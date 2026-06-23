import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import {
	AGENT_LOCAL_LOGO_FILENAME,
	AGENT_LOCAL_WEBSITE_SCREENSHOT_FILENAME,
	isRemoteAgentAssetUrl,
	type AgentSubmitBase,
} from './shared';
import { uploadLogo, uploadScreenshot } from './client';
import { sharpFromBuffer } from './logo-process';

export { AGENT_LOCAL_LOGO_FILENAME, AGENT_LOCAL_WEBSITE_SCREENSHOT_FILENAME };

// 本地图片压缩配置常量
export const COMPRESS_LOGO_MAX_WIDTH = 256;
export const COMPRESS_LOGO_MAX_HEIGHT = 256;
export const COMPRESS_LOGO_QUALITY = 90;

export const COMPRESS_SCREENSHOT_MAX_WIDTH = 1920;
export const COMPRESS_SCREENSHOT_QUALITY = 80;

export function localLogoPath(submitDir: string): string {
	const extensions = ['webp', 'ico', 'png', 'jpg', 'jpeg'];
	for (const ext of extensions) {
		const p = join(submitDir, `logo.${ext}`);
		if (existsSync(p)) {
			return p;
		}
	}
	return join(submitDir, AGENT_LOCAL_LOGO_FILENAME);
}

export function localWebsiteScreenshotPath(submitDir: string): string {
	const extensions = ['webp', 'png', 'jpg', 'jpeg'];
	for (const ext of extensions) {
		const p = join(submitDir, `website-screenshot.${ext}`);
		if (existsSync(p)) {
			return p;
		}
	}
	return join(submitDir, AGENT_LOCAL_WEBSITE_SCREENSHOT_FILENAME);
}

export function hasLocalLogo(submitDir: string): boolean {
	const extensions = ['webp', 'ico', 'png', 'jpg', 'jpeg'];
	return extensions.some((ext) => existsSync(join(submitDir, `logo.${ext}`)));
}

export function hasLocalWebsiteScreenshot(submitDir: string): boolean {
	const extensions = ['webp', 'png', 'jpg', 'jpeg'];
	return extensions.some((ext) => existsSync(join(submitDir, `website-screenshot.${ext}`)));
}

function readBaseJson(submitDir: string): AgentSubmitBase & Record<string, unknown> {
	const basePath = join(submitDir, 'base.json');
	return JSON.parse(readFileSync(basePath, 'utf-8')) as AgentSubmitBase & Record<string, unknown>;
}

function writeBaseJson(submitDir: string, base: AgentSubmitBase & Record<string, unknown>): void {
	const basePath = join(submitDir, 'base.json');
	writeFileSync(basePath, `${JSON.stringify(base, null, 2)}\n`, 'utf-8');
}

export async function ensureLogoUploaded(submitDir: string): Promise<string> {
	const started = performance.now();
	const base = readBaseJson(submitDir);
	const existing = typeof base.logo === 'string' ? base.logo.trim() : '';

	if (isRemoteAgentAssetUrl(existing)) {
		console.error(`[bat-cli:Logo] using existing remote URL, skip upload url=${existing}`);
		return existing;
	}

	const localPath = localLogoPath(submitDir);
	if (!existsSync(localPath)) {
		throw new Error(
			`Missing logo: set base.json logo to a remote URL, or place logo.webp, logo.ico or logo.png in ${submitDir}`,
		);
	}

	if (!base.website || typeof base.website !== 'string') {
		throw new Error('base.json website is required for logo upload');
	}

	// 统一在客户端压缩为 logo.webp
	const logoWebpPath = join(submitDir, 'logo.webp');
	let uploadPath = localPath;
	try {
		const buffer = readFileSync(localPath);
		const pipeline = await sharpFromBuffer(buffer);
		const tempPath = logoWebpPath + '.tmp';
		await pipeline
			.resize(COMPRESS_LOGO_MAX_WIDTH, COMPRESS_LOGO_MAX_HEIGHT, { fit: 'fill' })
			.webp({ quality: COMPRESS_LOGO_QUALITY })
			.toFile(tempPath);
		if (existsSync(logoWebpPath)) {
			unlinkSync(logoWebpPath);
		}
		renameSync(tempPath, logoWebpPath);
		uploadPath = logoWebpPath;
	} catch (err) {
		console.error(`[bat-cli:Logo] compression failed for ${localPath}, falling back to original:`, err);
	}

	const data = await uploadLogo({ filePath: uploadPath, website: base.website });
	base.logo = data.path;
	writeBaseJson(submitDir, base);
	console.error(
		`[bat-cli:Logo] uploaded ${uploadPath} → ${data.path} in ${(performance.now() - started).toFixed(0)}ms`,
	);
	return data.path;
}

export async function ensureWebsiteScreenshotUploaded(submitDir: string): Promise<string> {
	const started = performance.now();
	const base = readBaseJson(submitDir);
	const existing = typeof base.websiteScreenshot === 'string' ? base.websiteScreenshot.trim() : '';

	if (isRemoteAgentAssetUrl(existing)) {
		console.error(`[bat-cli:Screenshot] using existing remote URL, skip upload url=${existing}`);
		return existing;
	}

	const localPath = localWebsiteScreenshotPath(submitDir);
	if (!existsSync(localPath)) {
		throw new Error(
			`Missing website screenshot: set base.json websiteScreenshot to a remote URL, or place website-screenshot.png/website-screenshot.webp in ${submitDir}`,
		);
	}

	if (!base.website || typeof base.website !== 'string') {
		throw new Error('base.json website is required for screenshot upload');
	}

	// 统一在客户端压缩为 website-screenshot.webp
	const screenshotWebpPath = join(submitDir, 'website-screenshot.webp');
	let uploadPath = localPath;
	try {
		const tempPath = screenshotWebpPath + '.tmp';
		await sharp(localPath)
			.resize({ width: COMPRESS_SCREENSHOT_MAX_WIDTH, withoutEnlargement: true })
			.webp({ quality: COMPRESS_SCREENSHOT_QUALITY })
			.toFile(tempPath);
		if (existsSync(screenshotWebpPath)) {
			unlinkSync(screenshotWebpPath);
		}
		renameSync(tempPath, screenshotWebpPath);
		uploadPath = screenshotWebpPath;
	} catch (err) {
		console.error(`[bat-cli:Screenshot] compression failed for ${localPath}, falling back to original:`, err);
	}

	const data = await uploadScreenshot({ filePath: uploadPath, website: base.website });
	base.websiteScreenshot = data.path;
	writeBaseJson(submitDir, base);
	console.error(
		`[bat-cli:Screenshot] uploaded ${uploadPath} → ${data.path} in ${(performance.now() - started).toFixed(0)}ms`,
	);
	return data.path;
}

/** pack / submit 前上传本地 logo 与截图（若 base.json 尚无远程 URL） */
export async function ensureSubmitAssetsUploaded(submitDir: string): Promise<void> {
	const started = performance.now();
	await ensureLogoUploaded(submitDir);
	await ensureWebsiteScreenshotUploaded(submitDir);
	console.error(`[bat-cli:Assets] submitDir=${submitDir} ready in ${(performance.now() - started).toFixed(0)}ms`);
}
