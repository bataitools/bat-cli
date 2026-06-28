import { AgentApiEnvelope, throwAgentApiError } from './api-error';
import { signAgentRequest } from './agent-sign';
import { getApiUrl, saveToken } from './config';

export interface AgentWhoami {
	userId: number;
	email?: string;
	nickname?: string;
	accountType: 'formal' | 'guest';
}

export function assertFormalApiKeyFormat(apiKey: string): void {
	const trimmed = apiKey.trim();
	if (!trimmed.startsWith('bat_')) {
		throw new Error('Invalid API key format. Key must start with "bat_".');
	}
}

/** 调用 /bat/agent/whoami 校验 API Key（Agent CLI 专用，需签名 + Bearer） */
export async function verifyFormalApiKey(apiKey: string, apiUrl?: string): Promise<AgentWhoami> {
	const started = performance.now();
	const base = apiUrl?.trim() ? apiUrl.trim().replace(/\/+$/, '') : getApiUrl();
	const trimmed = apiKey.trim();
	const path = '/bat/agent/whoami';

	console.error(`[bat-cli] Verifying API key against ${base}${path} …`);

	const signHeaders = await signAgentRequest('GET', path, '');
	const res = await fetch(`${base}${path}`, {
		headers: {
			Authorization: `Bearer ${trimmed}`,
			...signHeaders,
		},
	});
	const body = (await res.json()) as AgentApiEnvelope<AgentWhoami>;

	if (res.status === 401 || !body.success) {
		throwAgentApiError(res.status, body);
	}
	if (!body.data?.userId) {
		throw new Error('API key verification failed: unexpected response from server');
	}
	if (body.data.accountType === 'guest') {
		throw new Error(
			'This is a guest API key, not a formal account key. Use `bat-cli login guest` or OAuth device login instead.',
		);
	}

	console.error(
		`[bat-cli] API key verified userId=${body.data.userId} in ${(performance.now() - started).toFixed(0)}ms`,
	);
	return body.data;
}

export async function loginWithFormalApiKey(apiKey: string, apiUrl?: string): Promise<void> {
	assertFormalApiKeyFormat(apiKey);
	const whoami = await verifyFormalApiKey(apiKey, apiUrl);
	saveToken(apiKey.trim(), apiUrl);
	const label = whoami.email ?? whoami.nickname ?? `user #${whoami.userId}`;
	console.log(`✅ Logged in as ${label} (userId=${whoami.userId})`);
}
