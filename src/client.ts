import { existsSync, readFileSync } from 'node:fs';
import { signAgentRequest } from './agent-sign';
import { AgentApiEnvelope, throwAgentApiError } from './api-error';
import { ensureToken, getApiUrl } from './config';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	const base = getApiUrl();
	const token = await ensureToken();
	const method = options.method ?? 'GET';

	const urlParts = path.split('?');
	const cleanPath = urlParts[0];
	const queryStr = urlParts[1] ?? '';

	let bodyOrQuery = '';
	if (method === 'POST' && typeof options.body === 'string') {
		bodyOrQuery = options.body;
	} else if (method === 'GET') {
		bodyOrQuery = queryStr;
	}

	const signHeaders = await signAgentRequest(method, cleanPath, bodyOrQuery);

	const res = await fetch(`${base}${path}`, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
			...signHeaders,
			...(options.headers ?? {}),
		},
	});
	const body = (await res.json()) as AgentApiEnvelope<T>;
	if (!res.ok || !body.success) {
		throwAgentApiError(res.status, body);
	}
	if (body.data === undefined) {
		throw new Error('API response missing data');
	}
	return body.data;
}

export async function fetchSchema(lang = 'en') {
	return request<{ staticBase?: string } & Record<string, unknown>>(`/bat/agent/schema?lang=${lang}`);
}

async function postAgentAsset(
	apiPath: '/bat/agent/upload-logo' | '/bat/agent/upload-screenshot',
	website: string,
	file?: { buffer: Buffer; mime: string; filename: string },
): Promise<{ path: string; website: string }> {
	const base = getApiUrl();
	const token = await ensureToken();
	const qs = new URLSearchParams({ website });
	const signHeaders = await signAgentRequest('POST', apiPath, qs.toString());

	let body: BodyInit;
	if (file) {
		const form = new FormData();
		form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mime }), file.filename);
		body = form;
	} else {
		body = new FormData();
	}

	const res = await fetch(`${base}${apiPath}?${qs.toString()}`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			...signHeaders,
		},
		body,
	});
	const json = (await res.json()) as AgentApiEnvelope<{ path: string; website: string }>;
	if (!res.ok || !json.success || !json.data?.path) {
		throwAgentApiError(res.status, json);
	}
	return json.data;
}

export async function submitBundle(bundle: unknown) {
	return request<{
		submitId: number;
		mode: 'new' | 'update';
		previewUrl: string;
		status: number;
		statusLabel?: string;
	}>('/bat/agent/submit', {
		method: 'POST',
		body: JSON.stringify(bundle),
	});
}

export async function publishSubmit(submitId: number) {
	return request<unknown>('/bat/agent/publish', {
		method: 'POST',
		body: JSON.stringify({ submitId }),
	});
}

export async function getSubmitStatus(submitId: number) {
	return request<{
		submitId: number;
		status: number;
		statusLabel: string;
		previewCode: string;
		languageCount: number;
	}>('/bat/agent/status/' + submitId);
}

export async function uploadScreenshot(options: {
	filePath?: string;
	website: string;
}): Promise<{ path: string; website: string }> {
	if (options.filePath) {
		if (!existsSync(options.filePath)) {
			throw new Error(`File not found: ${options.filePath}`);
		}
		const buffer = readFileSync(options.filePath);
		return postAgentAsset('/bat/agent/upload-screenshot', options.website, {
			buffer,
			mime: 'image/png',
			filename: 'screenshot.png',
		});
	}
	return postAgentAsset('/bat/agent/upload-screenshot', options.website);
}

export async function uploadLogo(options: {
	filePath?: string;
	website: string;
}): Promise<{ path: string; website: string }> {
	if (options.filePath) {
		if (!existsSync(options.filePath)) {
			throw new Error(`File not found: ${options.filePath}`);
		}
		const buffer = readFileSync(options.filePath);
		const ext = options.filePath.split('.').pop()?.toLowerCase() || 'webp';
		let mime = 'image/webp';
		if (ext === 'ico') {
			mime = 'image/x-icon';
		} else if (ext === 'png') {
			mime = 'image/png';
		} else if (ext === 'jpg' || ext === 'jpeg') {
			mime = 'image/jpeg';
		} else if (ext === 'svg') {
			mime = 'image/svg+xml';
		}
		return postAgentAsset('/bat/agent/upload-logo', options.website, {
			buffer,
			mime,
			filename: `logo.${ext}`,
		});
	}
	return postAgentAsset('/bat/agent/upload-logo', options.website);
}

export interface AgentSubmitItem {
	submitId: number;
	name: string;
	website: string;
	status: number;
	statusLabel: string;
	createdAt: string;
	previewCode?: string;
}

export async function listSubmits() {
	return request<AgentSubmitItem[]>('/bat/agent/list');
}
