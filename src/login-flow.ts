import { exec } from 'node:child_process';
import { signAgentRequest } from './agent-sign';
import { AgentApiEnvelope, AgentApiError, isAgentApiErrorCode, throwAgentApiError } from './api-error';
import { getApiUrl, saveToken } from './config';

interface DeviceCodeSession {
	siteUrl?: string;
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete: string;
	expires_in: number;
	interval: number;
}

interface DeviceTokenResult {
	key: string;
	userId: number;
	accountType: 'formal';
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function openBrowser(url: string): Promise<void> {
	return new Promise((resolve) => {
		const platform = process.platform;
		const cmd =
			platform === 'darwin' ? `open "${url}"` : platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
		exec(cmd, (err) => {
			if (err) {
				console.warn(`[bat-cli] could not open browser: ${err.message}`);
			}
			resolve();
		});
	});
}

async function requestDeviceCode(apiBase: string): Promise<DeviceCodeSession> {
	const path = '/bat/agent/device/code';
	const signHeaders = await signAgentRequest('POST', path, '');
	const res = await fetch(`${apiBase}${path}`, { method: 'POST', headers: signHeaders });
	const body = (await res.json()) as AgentApiEnvelope<DeviceCodeSession>;
	if (!res.ok || !body.success || !body.data) {
		throwAgentApiError(res.status, body);
	}
	return body.data;
}

/** 兼容旧版 API：siteUrl 缺失时从 verification_uri 推导 */
export function normalizeDeviceSession(session: DeviceCodeSession): DeviceCodeSession & { siteUrl: string } {
	const verificationUriComplete = session.verification_uri_complete?.trim();
	if (!verificationUriComplete?.match(/^https?:\/\//)) {
		throw new Error('Device authorization response missing verification_uri_complete from server');
	}

	let siteUrl = session.siteUrl?.trim();
	if (!siteUrl?.match(/^https?:\/\//)) {
		try {
			siteUrl = new URL(session.verification_uri?.trim() || verificationUriComplete).origin;
		} catch {
			throw new Error('Device authorization response missing siteUrl from server');
		}
	}

	return {
		...session,
		siteUrl,
		verification_uri_complete: verificationUriComplete,
	};
}

function printDeviceAuthInstructions(session: DeviceCodeSession & { siteUrl: string }): void {
	// 使用 stderr，避免 readline 占用 stdout 时 URL 不显示
	const lines = [
		'',
		`!  Copy your one-time code: ${session.user_code}`,
		'',
		'!  Open this URL in your browser to authorize bat-cli:',
		session.verification_uri_complete,
		'',
	];
	for (const line of lines) {
		console.error(line);
	}
}

async function pollDeviceToken(apiBase: string, deviceCode: string): Promise<DeviceTokenResult> {
	const path = '/bat/agent/device/token';
	const bodyText = JSON.stringify({ device_code: deviceCode });
	const signHeaders = await signAgentRequest('POST', path, bodyText);
	const res = await fetch(`${apiBase}${path}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...signHeaders,
		},
		body: bodyText,
	});
	const body = (await res.json()) as AgentApiEnvelope<DeviceTokenResult>;
	if (body.success && body.data?.key) {
		return body.data;
	}
	throw AgentApiError.fromResponse(res.status, body);
}

/**
 * OAuth Device Authorization Grant（同 GitHub CLI `gh auth login`）
 * 1. 申请 device_code + user_code
 * 2. 浏览器打开 verification_uri 完成授权
 * 3. CLI 轮询换取 API Key
 */
export async function formalLogin(apiUrl?: string): Promise<void> {
	const started = performance.now();
	const apiBase = apiUrl?.trim() ? apiUrl.trim().replace(/\/+$/, '') : getApiUrl();

	// readline.close() 后 Bun 可能提前退出；resume stdin 保证后续 fetch / 轮询能跑完
	process.stdin.resume();

	console.error('[bat-cli] Requesting device authorization…');
	const session = normalizeDeviceSession(await requestDeviceCode(apiBase));
	printDeviceAuthInstructions(session);

	console.error('[bat-cli] Opening browser…');
	await openBrowser(session.verification_uri_complete);
	console.error('[bat-cli] Waiting for authorization in the browser (complete sign-in there)…');
	console.error('');

	const deadline = Date.now() + session.expires_in * 1000;
	let intervalMs = session.interval * 1000;

	while (Date.now() < deadline) {
		await sleep(intervalMs);
		try {
			const token = await pollDeviceToken(apiBase, session.device_code);
			console.log('');
			saveToken(token.key, apiUrl);
			console.log(
				`[bat-cli] formal login completed (userId=${token.userId}) in ${(performance.now() - started).toFixed(0)}ms`,
			);
			return;
		} catch (e) {
			if (isAgentApiErrorCode(e, 'AUTHORIZATION_PENDING')) {
				process.stderr.write('.');
				continue;
			}
			if (isAgentApiErrorCode(e, 'SLOW_DOWN')) {
				intervalMs += 1000;
				continue;
			}
			throw e;
		}
	}

	throw new Error('Device authorization timed out. Run bat-cli login again.');
}
