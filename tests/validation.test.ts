import { describe, expect, it, beforeAll, afterAll, spyOn } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { packSubmitDirectory, validatePhase1Directory } from '../src/pack';
import { validateAgentSubmitBundle } from '../src/shared';

// 测试配置常量，方便切换不同的测试数据
const TEST_DOMAIN = 'imagetostl.me';
const TEST_MOCK_DIR = resolve(import.meta.dirname, `./mock/${TEST_DOMAIN}`);
const EXPECTED_WEBSITE = 'https://imagetostl.me';
const EXPECTED_LOGO = 'https://static.bataitools.com/upload/toos/logo/imagetostl.me/f0c0c9695807b30d.webp';

describe('BAT CLI Automated Tests - Validation', () => {
	const sampleDir = TEST_MOCK_DIR;
	let consoleErrorSpy: any;

	beforeAll(() => {
		consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
	});

	afterAll(() => {
		consoleErrorSpy.mockRestore();
	});

	it('should locate sample submit directory', () => {
		expect(existsSync(sampleDir)).toBe(true);
		expect(existsSync(join(sampleDir, 'base.json'))).toBe(true);
		expect(existsSync(join(sampleDir, 'i18n'))).toBe(true);
	});

	it('should validate Phase 1 successfully for sample directory', () => {
		const result = validatePhase1Directory(sampleDir);
		expect(result.ok).toBe(true);
		expect(result.errors).toEqual({});
		expect(result.languageErrors).toBeUndefined();
	});

	it('should pack submit directory successfully and pass bundle validation', async () => {
		const bundle = await packSubmitDirectory(sampleDir);
		expect(bundle).toBeDefined();
		expect(bundle.website).toBe(EXPECTED_WEBSITE);
		expect(bundle.logo).toBe(EXPECTED_LOGO);
		expect(bundle.i18n).toBeDefined();
		expect(bundle.i18n.en).toBeDefined();
		expect(bundle.i18n.zh).toBeDefined();

		const validationResult = validateAgentSubmitBundle(bundle);
		expect(validationResult.ok).toBe(true);
		expect(validationResult.errors).toEqual({});
		expect(validationResult.languageErrors).toBeUndefined();
	});

	it('should fail with website errors when website is missing', () => {
		const tempTestDir = join(tmpdir(), `bat-cli-test-web-${Date.now()}`);
		try {
			mkdirSync(tempTestDir, { recursive: true });
			mkdirSync(join(tempTestDir, 'i18n'), { recursive: true });

			const invalidBase = {
				logo: 'https://example.com/logo.png',
				websiteScreenshot: 'https://example.com/screenshot.png',
				categorys: ['ai-3d-generator'],
				tags: ['freemium'],
				audiences: ['developers'],
			};
			writeFileSync(join(tempTestDir, 'base.json'), JSON.stringify(invalidBase, null, 2), 'utf-8');

			const validEn = {
				name: 'Test Agent',
				tagline: 'This is a test agent tagline.',
				description: 'This is a long test agent description that has at least fifty characters in it.',
			};
			writeFileSync(join(tempTestDir, 'i18n/en.json'), JSON.stringify(validEn, null, 2), 'utf-8');

			const result = validatePhase1Directory(tempTestDir);
			expect(result.ok).toBe(false);
			expect(result.errors?.website).toBeDefined();
		} finally {
			if (existsSync(tempTestDir)) {
				rmSync(tempTestDir, { recursive: true, force: true });
			}
		}
	});

	it('should fail with languageErrors when en i18n is invalid', () => {
		const tempTestDir = join(tmpdir(), `bat-cli-test-lang-${Date.now()}`);
		try {
			mkdirSync(tempTestDir, { recursive: true });
			mkdirSync(join(tempTestDir, 'i18n'), { recursive: true });

			const validBase = {
				website: 'https://example.com',
				logo: 'https://example.com/logo.png',
				websiteScreenshot: 'https://example.com/screenshot.png',
				categorys: ['ai-3d-generator'],
				tags: ['freemium'],
				audiences: ['developers'],
			};
			writeFileSync(join(tempTestDir, 'base.json'), JSON.stringify(validBase, null, 2), 'utf-8');

			const invalidEn = {
				name: 'Test',
				tagline: 'Short', // Less than 10 characters
				description: 'Too short description', // Less than 50 characters
			};
			writeFileSync(join(tempTestDir, 'i18n/en.json'), JSON.stringify(invalidEn, null, 2), 'utf-8');

			const result = validatePhase1Directory(tempTestDir);
			expect(result.ok).toBe(false);
			expect(result.languageErrors?.en).toBeDefined();
		} finally {
			if (existsSync(tempTestDir)) {
				rmSync(tempTestDir, { recursive: true, force: true });
			}
		}
	});
});
