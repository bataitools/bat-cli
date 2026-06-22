import { readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function captureWebsiteScreenshot(url: string): Promise<Buffer> {
	const started = performance.now();
	let target = url.trim();
	if (!target.startsWith('http://') && !target.startsWith('https://')) {
		target = `https://${target}`;
	}

	const tmpPath = join(tmpdir(), `bat-cli-screenshot-${Date.now()}.png`);

	try {
		const { chromium } = await import('playwright');
		const browser = await chromium.launch({ headless: true });
		try {
			const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
			await page.goto(target, { waitUntil: 'networkidle', timeout: 60_000 });
			await page.screenshot({ path: tmpPath, fullPage: false, type: 'png' });
		} finally {
			await browser.close();
		}

		const buffer = readFileSync(tmpPath);
		console.log(
			`[bat-cli:Screenshot] captured ${target} in ${(performance.now() - started).toFixed(0)}ms`,
		);
		return buffer;
	} finally {
		try {
			unlinkSync(tmpPath);
		} catch {
			// ignore cleanup errors
		}
	}
}
