import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** 生产环境 API（与 bataitools.com 官网配套，普通用户无需配置） */
export const BAT_API_URL_PRODUCTION = 'https://api.bataitools.com';
export const BAT_API_URL_DEVELOPMENT = 'https://api-dev.bataitools.com';

const CONFIG_DIR = join(homedir(), '.bat-cli');
const OLD_CONFIG_DIR = join(homedir(), '.bat-agent');

// 自动迁移老凭证目录
try {
	if (!existsSync(CONFIG_DIR) && existsSync(OLD_CONFIG_DIR)) {
		renameSync(OLD_CONFIG_DIR, CONFIG_DIR);
		console.log(`[bat-cli] Migrated credentials from ${OLD_CONFIG_DIR} to ${CONFIG_DIR}`);
	}
} catch {
	// 静默失败
}

const CREDENTIALS_FILE = join(CONFIG_DIR, 'credentials.json');

export interface CredentialsFile {
	token?: string;
	/** 可选：持久化开发/自定义 API 地址，优先级低于 BAT_API_URL 环境变量 */
	apiUrl?: string;
}

interface AutoLoginResponse {
	key: string;
	prefix: string;
	createdAt: string;
	lastUsedAt: string | null;
	userId: number;
	accountType: 'guest';
}

interface ApiEnvelope<T> {
	success: boolean;
	data?: T;
	errorMsg?: string;
}

function readCredentialsFile(): CredentialsFile {
	if (!existsSync(CREDENTIALS_FILE)) return {};
	try {
		return JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf-8')) as CredentialsFile;
	} catch {
		return {};
	}
}

function writeCredentialsFile(data: CredentialsFile) {
	if (!existsSync(CONFIG_DIR)) {
		mkdirSync(CONFIG_DIR, { recursive: true });
	}
	writeFileSync(CREDENTIALS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/** 解析 API 基址：BAT_API_URL 环境变量 > credentials.apiUrl > 生产默认 */
export function getApiUrl(): string {
	const fromEnv = process.env.BAT_API_URL?.trim();
	if (fromEnv) return fromEnv.replace(/\/+$/, '');

	const fromFile = readCredentialsFile().apiUrl?.trim();
	if (fromFile) return fromFile.replace(/\/+$/, '');

	return BAT_API_URL_PRODUCTION;
}

export function saveToken(token: string, apiUrl?: string) {
	const normalizedApiUrl = apiUrl?.trim().replace(/\/+$/, '');
	const newCreds: CredentialsFile = {
		token,
	};
	if (normalizedApiUrl && normalizedApiUrl !== BAT_API_URL_PRODUCTION) {
		newCreds.apiUrl = normalizedApiUrl;
	}

	writeCredentialsFile(newCreds);
	console.log(`[bat-cli] credentials saved to ${CREDENTIALS_FILE}`);
	console.log(`[bat-cli] api: ${getApiUrl()}`);
}

export function loadToken(): string | null {
	const token = readCredentialsFile().token?.trim();
	return token || null;
}

export function requireToken(): string {
	const token = loadToken();
	if (!token) {
		throw new Error('Not logged in. Run: bat-cli login-guest (device account) or bat-cli login (formal account)');
	}
	return token;
}

import { calculateAgentSubmitSignature } from './shared';

/** 无本地凭证时自动创建设备 guest 账号并登录 */
export async function autoLogin(apiUrl?: string): Promise<string> {
	const started = performance.now();
	const base = apiUrl?.trim() ? apiUrl.trim().replace(/\/+$/, '') : getApiUrl();
	console.log(`[bat-cli] auto-login requesting guest account from ${base}`);

	const path = '/bat/agent/auto-login';
	const timestamp = Math.floor(Date.now() / 1000);
	const signature = calculateAgentSubmitSignature(`POST:${path}:`, timestamp);

	const res = await fetch(`${base}${path}`, {
		method: 'POST',
		headers: {
			'x-bat-timestamp': String(timestamp),
			'x-bat-signature': signature,
		},
	});
	const body = (await res.json()) as ApiEnvelope<AutoLoginResponse>;
	if (!res.ok || !body.success || !body.data?.key) {
		throw new Error(body.errorMsg ?? `Auto-login failed: ${res.status}`);
	}

	saveToken(body.data.key, apiUrl);
	console.log(
		`[bat-cli] auto-login guest userId=${body.data.userId} completed in ${(performance.now() - started).toFixed(0)}ms`,
	);
	console.log(
		'[bat-cli] tip: credentials saved to ~/.bat-cli/credentials.json — use bat-cli login for a formal account on other devices',
	);
	return body.data.key;
}

/** 读取已有 token；若无则自动 guest 登录 */
export async function ensureToken(): Promise<string> {
	const existing = loadToken();
	if (existing) return existing;
	return autoLogin();
}
