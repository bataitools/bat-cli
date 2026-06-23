import { exec } from 'node:child_process';
import { getApiUrl, saveToken } from './config';

interface ApiEnvelope<T> {
	success: boolean;
	data?: T;
	errorCode?: string;
	errorMsg?: string;
}

interface DeviceCodeSession {
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
	const res = await fetch(`${apiBase}/bat/agent/device/code`, { method: 'POST' });
	const body = (await res.json()) as ApiEnvelope<DeviceCodeSession>;
	if (!res.ok || !body.success || !body.data) {
		throw new Error(body.errorMsg ?? `Device authorization failed: ${res.status}`);
	}
	return body.data;
}

async function pollDeviceToken(apiBase: string, deviceCode: string): Promise<DeviceTokenResult> {
	const res = await fetch(`${apiBase}/bat/agent/device/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ device_code: deviceCode }),
	});
	const body = (await res.json()) as ApiEnvelope<DeviceTokenResult>;
	if (body.success && body.data?.key) {
		return body.data;
	}
	const code = body.errorCode ?? 'UNKNOWN';
	const msg = body.errorMsg ?? `Device token poll failed: ${res.status}`;
	const err = new Error(msg) as Error & { errorCode?: string };
	err.errorCode = code;
	throw err;
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

	console.error('[bat-cli] starting device authorization (OAuth)…');
	const session = await requestDeviceCode(apiBase);

	console.error('');
	console.error(`!  Enter code: ${session.user_code}`);
	console.error(`!  Open: ${session.verification_uri_complete}`);
	console.error('');

	await openBrowser(session.verification_uri_complete);

	const deadline = Date.now() + session.expires_in * 1000;
	let intervalMs = session.interval * 1000;

	while (Date.now() < deadline) {
		await sleep(intervalMs);
		try {
			const token = await pollDeviceToken(apiBase, session.device_code);
			saveToken(token.key, apiUrl);
			console.error(
				`[bat-cli] formal login completed (userId=${token.userId}) in ${(performance.now() - started).toFixed(0)}ms`,
			);
			return;
		} catch (e) {
			const code = (e as Error & { errorCode?: string }).errorCode;
			if (code === 'AUTHORIZATION_PENDING') {
				process.stderr.write('.');
				continue;
			}
			if (code === 'SLOW_DOWN') {
				intervalMs += 1000;
				continue;
			}
			throw e;
		}
	}

	throw new Error('Device authorization timed out. Run bat-cli login again.');
}
