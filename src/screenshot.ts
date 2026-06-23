import { readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

export async function captureWebsiteScreenshot(url: string): Promise<Buffer> {
	const started = performance.now();
	let target = url.trim();
	if (!target.startsWith('http://') && !target.startsWith('https://')) {
		target = `https://${target}`;
	}

	const tmpPath = join(tmpdir(), `bat-cli-screenshot-${Date.now()}.png`);

	try {
		console.error('⏳ Starting browser...');
		const { chromium } = await import('playwright');
		let browser;
		try {
			browser = await chromium.launch({ headless: true });
		} catch (launchErr: any) {
			const errMsg = String(launchErr.message || launchErr);
			if (
				errMsg.includes("Executable doesn't exist") ||
				errMsg.includes('playwright install') ||
				errMsg.includes('chromium')
			) {
				console.error(
					'[bat-cli:Screenshot] Playwright Chromium is not installed. Attempting to install automatically...',
				);
				try {
					execSync('npx playwright install chromium', { stdio: 'inherit' });
					browser = await chromium.launch({ headless: true });
				} catch (installErr) {
					throw new Error(
						`Failed to automatically install Playwright Chromium. Please run the following command manually:\n\n  npx playwright install chromium\n\nOriginal error: ${errMsg}`,
					);
				}
			} else {
				throw launchErr;
			}
		}

		console.error(`📸 Capturing screenshot for ${target}...`);
		try {
			const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
			await page.goto(target, { waitUntil: 'networkidle', timeout: 60_000 });
			await page.screenshot({ path: tmpPath, fullPage: false, type: 'png' });
		} finally {
			await browser.close();
		}

		const buffer = readFileSync(tmpPath);
		console.error(`[bat-cli:Screenshot] captured ${target} in ${(performance.now() - started).toFixed(0)}ms`);
		return buffer;
	} finally {
		try {
			unlinkSync(tmpPath);
		} catch {
			// ignore cleanup errors
		}
	}
}
