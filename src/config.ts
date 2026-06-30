import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename, resolve } from 'node:path';
import { AgentApiEnvelope, throwAgentApiError } from './api-error';
import { signAgentRequest } from './agent-sign';

/** 生产环境 API（与 bataitools.com 官网配套，普通用户无需配置） */
export const BAT_API_URL_PRODUCTION = 'https://api.bataitools.com';
export const BAT_API_URL_DEVELOPMENT = 'https://api-dev.bataitools.com';

function isDirectoryWritable(dir: string): boolean {
	try {
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		const testFile = join(dir, `.write-test-${Date.now()}`);
		writeFileSync(testFile, 'test', 'utf-8');
		unlinkSync(testFile);
		return true;
	} catch {
		return false;
	}
}

function resolveConfigDir(): string {
	// 1. 首选: Home 目录
	const homePath = join(homedir(), '.bat-cli');
	if (isDirectoryWritable(homePath)) {
		return homePath;
	}

	// 2. 次选: CLI 所在目录 (根目录下)
	try {
		const cliRootPath = resolve(import.meta.dirname, '..', '.bat-cli');
		if (isDirectoryWritable(cliRootPath)) {
			return cliRootPath;
		}
	} catch {
		// ignore
	}

	// 3. 备选: 默认 HomePath
	return homePath;
}

const CONFIG_DIR = resolveConfigDir();
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

export function getCredentialsFile(): string {
	const env = (process.env.BAT_ENV || '').trim().toLowerCase();
	if (env === 'dev' || env === 'development' || env === 'test') {
		return join(CONFIG_DIR, 'credentials-dev.json');
	}
	return join(CONFIG_DIR, 'credentials.json');
}

export const ALREADY_LOGGED_IN_MSG = 'Already logged in. Run `bat-cli logout` before logging in again.';

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

let memoryToken: string | null = null;
let memoryApiUrl: string | null = null;

function readCredentialsFile(): CredentialsFile {
	const file = getCredentialsFile();
	if (!existsSync(file)) return {};
	try {
		return JSON.parse(readFileSync(file, 'utf-8')) as CredentialsFile;
	} catch {
		return {};
	}
}

function writeCredentialsFile(data: CredentialsFile) {
	try {
		if (!existsSync(CONFIG_DIR)) {
			mkdirSync(CONFIG_DIR, { recursive: true });
		}
		const file = getCredentialsFile();
		writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
	} catch (err) {
		console.warn(
			`[bat-cli] Warning: Failed to write credentials file to disk. Falling back to memory state. Error: ${String(err)}`,
		);
		if (data.token) memoryToken = data.token;
		if (data.apiUrl) memoryApiUrl = data.apiUrl;
	}
}

/** 解析 API 基址：BAT_API_URL 环境变量 > credentials.apiUrl > 生产默认 */
export function getApiUrl(): string {
	const fromEnv = process.env.BAT_API_URL?.trim();
	if (fromEnv) return fromEnv.replace(/\/+$/, '');

	if (memoryApiUrl) return memoryApiUrl.replace(/\/+$/, '');

	const fromFile = readCredentialsFile().apiUrl?.trim();
	if (fromFile) return fromFile.replace(/\/+$/, '');

	return BAT_API_URL_PRODUCTION;
}

export function isLoggedIn(): boolean {
	return Boolean(loadToken());
}

/** 已登录时拒绝再次 login / saveToken，须先 logout */
export function assertNotLoggedIn(): void {
	if (isLoggedIn()) {
		throw new Error(ALREADY_LOGGED_IN_MSG);
	}
}

export function logout(): void {
	const file = getCredentialsFile();
	if (existsSync(file)) {
		unlinkSync(file);
		console.log(`[bat-cli] logged out (removed ${file})`);
		return;
	}
	console.log('[bat-cli] not logged in');
}

export function saveToken(token: string, apiUrl?: string) {
	assertNotLoggedIn();
	const normalizedApiUrl = apiUrl?.trim().replace(/\/+$/, '');
	const newCreds: CredentialsFile = {
		token,
	};
	if (normalizedApiUrl && normalizedApiUrl !== BAT_API_URL_PRODUCTION) {
		newCreds.apiUrl = normalizedApiUrl;
	}

	writeCredentialsFile(newCreds);
	const file = getCredentialsFile();
	console.log(`[bat-cli] credentials saved to ${file}`);
	console.log(`[bat-cli] api: ${getApiUrl()}`);
}

export function loadToken(): string | null {
	const fromEnv = (process.env.BAT_TOKEN || process.env.BAT_API_KEY || '').trim();
	if (fromEnv) return fromEnv;

	if (memoryToken) return memoryToken;

	const token = readCredentialsFile().token?.trim();
	return token || null;
}

export function requireToken(): string {
	const token = loadToken();
	if (!token) {
		throw new Error('Not logged in. Run: bat-cli login guest (guest) or bat-cli login (formal account)');
	}
	return token;
}

/** 无本地凭证时自动创建设备 guest 账号并登录 */
export async function autoLogin(apiUrl?: string): Promise<string> {
	assertNotLoggedIn();
	const started = performance.now();
	const base = apiUrl?.trim() ? apiUrl.trim().replace(/\/+$/, '') : getApiUrl();
	console.log(`[bat-cli] auto-login requesting guest account from ${base}`);

	const path = '/bat/agent/auto-login';
	const signHeaders = await signAgentRequest('POST', path, '');

	const res = await fetch(`${base}${path}`, {
		method: 'POST',
		headers: signHeaders,
	});
	const body = (await res.json()) as AgentApiEnvelope<AutoLoginResponse>;
	if (!res.ok || !body.success || !body.data?.key) {
		throwAgentApiError(res.status, body);
	}

	saveToken(body.data.key, apiUrl);
	console.log(
		`[bat-cli] auto-login guest userId=${body.data.userId} completed in ${(performance.now() - started).toFixed(0)}ms`,
	);
	const file = getCredentialsFile();
	console.log(
		`[bat-cli] tip: credentials saved to ~/.bat-cli/${basename(file)} — use bat-cli login for a formal account on other devices`,
	);
	return body.data.key;
}

/** 读取已有 token；若无则自动 guest 登录 */
export async function ensureToken(): Promise<string> {
	const existing = loadToken();
	if (existing) return existing;
	return autoLogin();
}
