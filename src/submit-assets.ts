import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
try {
	sharp.cache(false);
	sharp.concurrency(1);
} catch {
	// ignore
}
import { AGENT_LOCAL_LOGO_FILENAME, AGENT_LOCAL_WEBSITE_SCREENSHOT_FILENAME, type AgentSubmitBase } from './shared';
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
	const extensions = ['svg', 'webp', 'ico', 'png', 'jpg', 'jpeg'];
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

async function prepareLogoUploadPath(submitDir: string, localPath: string): Promise<string> {
	if (localPath.endsWith('.svg') || localPath.endsWith('.ico')) {
		console.error(
			`[bat-cli:Logo] detected ${localPath.endsWith('.svg') ? 'SVG' : 'ICO'} format, skip WebP conversion`,
		);
		return localPath;
	}

	try {
		const stats = statSync(localPath);
		const ext = localPath.split('.').pop()?.toLowerCase() || '';
		if (stats.size < 200 * 1024 && ['webp', 'png', 'jpg', 'jpeg'].includes(ext)) {
			console.error(
				`[bat-cli:Logo] file size is ${stats.size} bytes (< 200KB), skipping sharp compression to prevent OOM.`,
			);
			return localPath;
		}
	} catch {
		// ignore stat error
	}

	const tempDir = join(tmpdir(), 'bat-cli-assets');
	if (!existsSync(tempDir)) {
		mkdirSync(tempDir, { recursive: true });
	}
	const logoWebpPath = join(tempDir, `${basename(submitDir)}-logo.webp`);
	try {
		const buffer = readFileSync(localPath);
		const pipeline = await sharpFromBuffer(buffer);
		await pipeline
			.resize(COMPRESS_LOGO_MAX_WIDTH, COMPRESS_LOGO_MAX_HEIGHT, { fit: 'fill' })
			.webp({ quality: COMPRESS_LOGO_QUALITY })
			.toFile(logoWebpPath);
		return logoWebpPath;
	} catch (err) {
		console.error(`[bat-cli:Logo] compression failed for ${localPath}, falling back to original:`, err);
		return localPath;
	}
}

async function prepareScreenshotUploadPath(submitDir: string, localPath: string): Promise<string> {
	try {
		const stats = statSync(localPath);
		const ext = localPath.split('.').pop()?.toLowerCase() || '';
		if (stats.size < 1024 * 1024 && ['webp', 'png', 'jpg', 'jpeg'].includes(ext)) {
			console.error(
				`[bat-cli:Screenshot] file size is ${stats.size} bytes (< 1MB), skipping sharp compression to prevent OOM.`,
			);
			return localPath;
		}
	} catch {
		// ignore stat error
	}

	const tempDir = join(tmpdir(), 'bat-cli-assets');
	if (!existsSync(tempDir)) {
		mkdirSync(tempDir, { recursive: true });
	}
	const screenshotWebpPath = join(tempDir, `${basename(submitDir)}-screenshot.webp`);
	try {
		await sharp(localPath)
			.resize({ width: COMPRESS_SCREENSHOT_MAX_WIDTH, withoutEnlargement: true })
			.webp({ quality: COMPRESS_SCREENSHOT_QUALITY })
			.toFile(screenshotWebpPath);
		return screenshotWebpPath;
	} catch (err) {
		console.error(`[bat-cli:Screenshot] compression failed for ${localPath}, falling back to original:`, err);
		return localPath;
	}
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
