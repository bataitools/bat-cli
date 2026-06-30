import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AGENT_LOCAL_LOGO_FILENAME, AGENT_LOCAL_WEBSITE_SCREENSHOT_FILENAME, type AgentSubmitBase } from './shared';
import { uploadLogo, uploadScreenshot } from './client';
import { compressLogoToWebp } from './fetch-logo';
import { compressPngToWebp } from './screenshot';

export { AGENT_LOCAL_LOGO_FILENAME, AGENT_LOCAL_WEBSITE_SCREENSHOT_FILENAME };

export function localLogoPath(submitDir: string): string {
	const extensions = ['svg', 'webp', 'ico', 'png', 'jpg', 'jpeg'];
	for (const ext of extensions) {
		const p = join(submitDir, `logo.${ext}`);
		if (existsSync(p)) {
			return p;
		}
	}
	return join(submitDir, AGENT_LOCAL_LOGO_FILENAME);
}

export function localWebsiteScreenshotPath(submitDir: string): string {
	const p = join(submitDir, 'website-screenshot.webp');
	if (existsSync(p)) {
		return p;
	}
	return join(submitDir, AGENT_LOCAL_WEBSITE_SCREENSHOT_FILENAME);
}

export function hasLocalLogo(submitDir: string): boolean {
	const extensions = ['svg', 'webp', 'ico', 'png', 'jpg', 'jpeg'];
	return extensions.some((ext) => existsSync(join(submitDir, `logo.${ext}`)));
}

export function hasLocalWebsiteScreenshot(submitDir: string): boolean {
	return existsSync(join(submitDir, 'website-screenshot.webp'));
}

function readBaseJson(submitDir: string): AgentSubmitBase & Record<string, unknown> {
	const basePath = join(submitDir, 'base.json');
	return JSON.parse(readFileSync(basePath, 'utf-8')) as AgentSubmitBase & Record<string, unknown>;
}

function writeBaseJson(submitDir: string, base: AgentSubmitBase & Record<string, unknown>): void {
	const basePath = join(submitDir, 'base.json');
	writeFileSync(basePath, `${JSON.stringify(base, null, 2)}\n`, 'utf-8');
}

async function prepareLogoUploadPath(submitDir: string, localPath: string): Promise<string> {
	const stats = statSync(localPath);
	const ext = localPath.split('.').pop()?.toLowerCase() || '';
	if ((stats.size > 20 * 1024 && ext !== 'svg') || (ext !== 'webp' && ext !== 'svg')) {
		const destPath = join(submitDir, 'logo.webp');
		console.error(
			`[bat-cli] Local logo size (${(stats.size / 1024).toFixed(1)} KB) or format (.${ext}) requires optimization. Compressing...`,
		);
		const ok = await compressLogoToWebp(localPath, destPath, 128);
		if (ok && existsSync(destPath)) {
			return destPath;
		}
	}
	const finalStats = statSync(localPath);
	if (finalStats.size > 50 * 1024) {
		throw new Error(
			`Logo file size (${(finalStats.size / 1024).toFixed(1)} KB) exceeds 50KB limit. Please compress it first.`,
		);
	}
	return localPath;
}

async function prepareScreenshotUploadPath(submitDir: string, localPath: string): Promise<string> {
	const stats = statSync(localPath);
	const ext = localPath.split('.').pop()?.toLowerCase() || '';
	if (ext !== 'webp' || stats.size > 100 * 1024) {
		const destPath = join(submitDir, 'website-screenshot.webp');
		console.error(
			`[bat-cli] Local screenshot size (${(stats.size / 1024).toFixed(1)} KB) or format (.${ext}) requires optimization. Compressing...`,
		);
		const ok = await compressPngToWebp(localPath, destPath, 75);
		if (ok && existsSync(destPath)) {
			return destPath;
		}
	}
	const finalStats = statSync(localPath);
	const finalExt = localPath.split('.').pop()?.toLowerCase() || '';
	if (finalExt !== 'webp') {
		throw new Error(
			`Website screenshot must be in WebP format (found .${finalExt}). Please convert it to WebP first.`,
		);
	}
	if (finalStats.size > 200 * 1024) {
		throw new Error(
			`Website screenshot file size (${(finalStats.size / 1024).toFixed(1)} KB) exceeds 200KB limit. Please compress it first.`,
		);
	}
	return localPath;
}

/** 向 API 同步 logo URL：有本地文件则上传，否则解析 R2 已有资源；URL 一律由服务端返回 */
export async function ensureLogoUploaded(submitDir: string): Promise<string> {
	const started = performance.now();
	const base = readBaseJson(submitDir);

	if (!base.website || typeof base.website !== 'string') {
		throw new Error('base.json website is required for logo upload');
	}

	const localPath = localLogoPath(submitDir);
	let data: { path: string; website: string };

	if (existsSync(localPath)) {
		const uploadPath = await prepareLogoUploadPath(submitDir, localPath);
		data = await uploadLogo({ filePath: uploadPath, website: base.website });
		console.error(
			`[bat-cli:Logo] uploaded ${uploadPath} → ${data.path} in ${(performance.now() - started).toFixed(0)}ms`,
		);
	} else {
		data = await uploadLogo({ website: base.website });
		console.error(
			`[bat-cli:Logo] resolved from API → ${data.path} in ${(performance.now() - started).toFixed(0)}ms`,
		);
	}

	base.logo = data.path;
	writeBaseJson(submitDir, base);
	return data.path;
}

/** 向 API 同步截图 URL：有本地文件则上传，否则解析 R2 已有资源；URL 一律由服务端返回 */
export async function ensureWebsiteScreenshotUploaded(submitDir: string): Promise<string> {
	const started = performance.now();
	const base = readBaseJson(submitDir);

	if (!base.website || typeof base.website !== 'string') {
		throw new Error('base.json website is required for screenshot upload');
	}

	const localPath = localWebsiteScreenshotPath(submitDir);
	let data: { path: string; website: string };

	if (existsSync(localPath)) {
		const uploadPath = await prepareScreenshotUploadPath(submitDir, localPath);
		data = await uploadScreenshot({ filePath: uploadPath, website: base.website });
		console.error(
			`[bat-cli:Screenshot] uploaded ${uploadPath} → ${data.path} in ${(performance.now() - started).toFixed(0)}ms`,
		);
	} else {
		data = await uploadScreenshot({ website: base.website });
		console.error(
			`[bat-cli:Screenshot] resolved from API → ${data.path} in ${(performance.now() - started).toFixed(0)}ms`,
		);
	}

	base.websiteScreenshot = data.path;
	writeBaseJson(submitDir, base);
	return data.path;
}

/** pack / submit 前通过 API 同步 logo 与截图 URL 到 base.json */
export async function ensureSubmitAssetsUploaded(submitDir: string): Promise<void> {
	const started = performance.now();
	await ensureLogoUploaded(submitDir);
	await ensureWebsiteScreenshotUploaded(submitDir);
	console.error(`[bat-cli:Assets] submitDir=${submitDir} ready in ${(performance.now() - started).toFixed(0)}ms`);
}
