import { writeFileSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function compressLogoToWebp(srcPath: string, destPath: string, maxDim: number = 128): Promise<boolean> {
	// 1. Try Python Pillow for robust resizing and WebP compression
	try {
		execSync(
			`python3 -c "from PIL import Image; im = Image.open('${srcPath}'); im.thumbnail((${maxDim}, ${maxDim})); im.save('${destPath}', 'WEBP', quality=80)"`,
			{ stdio: 'ignore' },
		);
		if (existsSync(destPath)) {
			return true;
		}
	} catch (err) {
		// fallback
	}

	// 2. Try macOS sips resize + format WebP
	if (process.platform === 'darwin') {
		try {
			execSync(`sips -Z ${maxDim} "${srcPath}" --out "${destPath}"`, { stdio: 'ignore' });
			// Convert to WebP format if needed
			execSync(`sips -s format webp "${destPath}" --out "${destPath}"`, { stdio: 'ignore' });
			if (existsSync(destPath)) {
				return true;
			}
		} catch (err) {
			// fallback
		}
	}

	return false;
}

export async function downloadAndCompressLogo(logoUrl: string, destWebpPath: string): Promise<void> {
	console.log(`[bat-cli] Downloading logo from: ${logoUrl}...`);
	const res = await fetch(logoUrl);
	if (!res.ok) {
		throw new Error(`Failed to download logo. HTTP status: ${res.status}`);
	}

	const arrayBuffer = await res.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	// Get file extension from URL
	const urlWithoutQuery = logoUrl.split('?')[0];
	const originalExt = urlWithoutQuery.split('.').pop()?.toLowerCase() || 'png';
	const tempSrcPath = join(tmpdir(), `bat-cli-logo-temp-${Date.now()}.${originalExt}`);

	try {
		writeFileSync(tempSrcPath, buffer);
		const stats = statSync(tempSrcPath);
		console.log(`[bat-cli] Downloaded logo size: ${(stats.size / 1024).toFixed(1)} KB`);

		// If the logo is already a WebP or SVG under 20KB, we can use it directly
		if (stats.size <= 20 * 1024 && (originalExt === 'webp' || originalExt === 'svg')) {
			// Just copy/save directly to destination
			writeFileSync(destWebpPath.replace(/\.webp$/, `.${originalExt}`), buffer);
			console.log(`[bat-cli] Saved logo directly (no compression needed) to ${destWebpPath}`);
			return;
		}

		console.log(`[bat-cli] Resizing and compressing logo to WebP under 20KB...`);
		const ok = await compressLogoToWebp(tempSrcPath, destWebpPath, 128);
		if (ok && existsSync(destWebpPath)) {
			const finalStats = statSync(destWebpPath);
			console.log(
				`[bat-cli] Logo successfully optimized and saved to ${destWebpPath} (size: ${(finalStats.size / 1024).toFixed(1)} KB)`,
			);
		} else {
			// Fallback: write original buffer directly to destWebpPath (rename if necessary or write as-is)
			writeFileSync(destWebpPath, buffer);
			console.warn(`[bat-cli] Warning: Failed to compress logo, saved original file directly.`);
		}
	} finally {
		if (existsSync(tempSrcPath)) {
			try {
				unlinkSync(tempSrcPath);
			} catch {
				// ignore
			}
		}
	}
}
