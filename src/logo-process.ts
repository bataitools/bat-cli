import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import decodeIco from 'decode-ico';
import sharp from 'sharp';

const LOGO_USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function isIcoBuffer(buffer: Buffer): boolean {
	return buffer.length >= 4 && buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00;
}

export async function sharpFromBuffer(buffer: Buffer): Promise<sharp.Sharp> {
	if (isIcoBuffer(buffer)) {
		try {
			const images = decodeIco(buffer);
			if (images.length > 0) {
				const largest = images.reduce((best, img) =>
					img.width * img.height > best.width * best.height ? img : best,
				);
				return sharp(largest.data, {
					raw: { width: largest.width, height: largest.height, channels: 4 },
				});
			}
		} catch (icoErr) {
			console.error(`[bat-cli:Logo] ICO decode failed, falling back to standard sharp:`, icoErr);
		}
	}

	return sharp(buffer, { pages: -1 });
}

/** 下载远程 logo 并处理为 256×256 格式（对齐 bat-crawl/logo.py） */
export async function downloadAndProcessLogo(
	logoUrl: string,
	outPath: string,
	format: 'webp' | 'png' = 'webp',
): Promise<void> {
	const started = performance.now();
	const target = logoUrl.trim();
	if (!target.startsWith('http://') && !target.startsWith('https://')) {
		throw new Error('logo URL must be absolute (http:// or https://)');
	}

	const res = await fetch(target, {
		headers: { 'User-Agent': LOGO_USER_AGENT },
	});
	if (!res.ok) {
		throw new Error(`Failed to download logo from ${target}: HTTP ${res.status}`);
	}

	const buffer = Buffer.from(await res.arrayBuffer());
	if (!buffer.byteLength) {
		throw new Error(`Failed to download logo from ${target}: empty response`);
	}

	mkdirSync(dirname(outPath), { recursive: true });
	const pipeline = await sharpFromBuffer(buffer);
	const resized = pipeline.resize(256, 256, { fit: 'fill' });
	if (format === 'png') {
		await resized.png({ quality: 90 }).toFile(outPath);
	} else {
		await resized.webp({ quality: 90 }).toFile(outPath);
	}

	console.error(`[bat-cli:Logo] processed ${target} → ${outPath} in ${(performance.now() - started).toFixed(0)}ms`);
}
