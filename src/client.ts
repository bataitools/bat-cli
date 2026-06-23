import { existsSync, readFileSync } from 'node:fs';
import { ensureToken, getApiUrl } from './config';

interface ApiEnvelope<T> {
	success: boolean;
	data?: T;
	errorMsg?: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	const base = getApiUrl();
	const token = await ensureToken();
	const res = await fetch(`${base}${path}`, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
			...(options.headers ?? {}),
		},
	});
	const body = (await res.json()) as ApiEnvelope<T>;
	if (!res.ok || !body.success) {
		throw new Error(body.errorMsg ?? `Request failed: ${res.status}`);
	}
	if (body.data === undefined) {
		throw new Error('API response missing data');
	}
	return body.data;
}

export async function fetchSchema(lang = 'en') {
	const base = getApiUrl();
	const res = await fetch(`${base}/bat/agent/schema?lang=${lang}`);
	const body = (await res.json()) as ApiEnvelope<unknown>;
	if (!res.ok || !body.success || body.data === undefined) {
		throw new Error(body.errorMsg ?? `Schema fetch failed: ${res.status}`);
	}
	return body.data;
}

export async function submitBundle(bundle: unknown) {
	return request<{
		submitId: number;
		orderNo: string | null;
		mode: 'new' | 'update';
		orderType: string;
		previewCode?: string;
		status: number;
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
	filePath: string;
	website: string;
}): Promise<{ path: string; website: string }> {
	const base = getApiUrl();
	const token = await ensureToken();
	if (!existsSync(options.filePath)) {
		throw new Error(`File not found: ${options.filePath}`);
	}
	const buffer = readFileSync(options.filePath);
	const blob = new Blob([buffer], { type: 'image/png' });

	const form = new FormData();
	form.append('file', blob, 'screenshot.png');

	const qs = new URLSearchParams({ website: options.website });
	const res = await fetch(`${base}/bat/agent/upload-screenshot?${qs.toString()}`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}` },
		body: form,
	});
	const body = (await res.json()) as ApiEnvelope<{ path: string; website: string }>;
	if (!res.ok || !body.success || !body.data) {
		throw new Error(body.errorMsg ?? `Upload failed: ${res.status}`);
	}
	return body.data;
}

export async function uploadLogo(options: {
	filePath: string;
	website: string;
}): Promise<{ path: string; website: string }> {
	const base = getApiUrl();
	const token = await ensureToken();
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
	}

	const blob = new Blob([buffer], { type: mime });
	const form = new FormData();
	form.append('file', blob, `logo.${ext}`);

	const qs = new URLSearchParams({ website: options.website });
	const res = await fetch(`${base}/bat/agent/upload-logo?${qs.toString()}`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}` },
		body: form,
	});
	const body = (await res.json()) as ApiEnvelope<{ path: string; website: string }>;
	if (!res.ok || !body.success || !body.data) {
		throw new Error(body.errorMsg ?? `Upload failed: ${res.status}`);
	}
	return body.data;
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
