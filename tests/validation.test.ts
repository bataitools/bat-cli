import { describe, expect, it, beforeAll, afterAll, spyOn } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { packSubmitDirectory, validatePhase1Directory } from '../src/pack';
import { validateAgentSubmitBundle } from '../src/shared';

// 测试配置常量，方便切换不同的测试数据
const TEST_DOMAIN = 'imagetostl.me';
const SAMPLE_DIR = resolve(import.meta.dirname, `../samples/${TEST_DOMAIN}`);
const EXPECTED_WEBSITE = 'https://imagetostl.me';
const EXPECTED_LOGO = 'https://static.bataitools.com/upload/toos/logo/imagetostl.me/f0c0c9695807b30d.webp';

describe('BAT CLI Automated Tests - Validation', () => {
	const sampleDir = SAMPLE_DIR;
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

	it('should fail bundle validation when non-english translation directly copies english text (uniqueness check)', () => {
		const { AGENT_REQUIRED_LANGUAGE_CODES } = require('../src/shared/product-languages');
		const mockI18n: any = {};
		for (const code of AGENT_REQUIRED_LANGUAGE_CODES) {
			mockI18n[code] = {
				name: `Name ${code}`,
				tagline: `This is a unique tagline for code ${code}.`,
				description: `This is a long unique description for code ${code} that has at least fifty characters.`,
			};
		}

		// 让 zh 的 tagline 直接拷贝 en 的 tagline
		mockI18n.zh.tagline = mockI18n.en.tagline;

		const bundle = {
			website: 'https://example.com',
			logo: 'https://example.com/logo.png',
			websiteScreenshot: 'https://example.com/screenshot.png',
			categorys: ['ai-3d-generator'],
			tags: ['freemium'],
			audiences: ['developers'],
			i18n: mockI18n,
		};

		const result = validateAgentSubmitBundle(bundle as any);
		expect(result.ok).toBe(false);
		expect(result.languageErrors?.zh).toBeDefined();
		expect(result.languageErrors?.zh).toContain('tagline is identical to the translation in en');
	});

	it('should fail bundle validation when coreFeatures title/description directly copies english text', () => {
		const { AGENT_REQUIRED_LANGUAGE_CODES } = require('../src/shared/product-languages');
		const mockI18n: any = {};
		for (const code of AGENT_REQUIRED_LANGUAGE_CODES) {
			mockI18n[code] = {
				name: `Name ${code}`,
				tagline: `This is a unique tagline for code ${code}.`,
				description: `This is a long unique description for code ${code} that has at least fifty characters.`,
				coreFeatures: [{ title: `Feature for ${code}`, description: `Description for ${code}` }],
			};
		}

		// 让 zh 的 coreFeatures title 直接拷贝 en 的
		mockI18n.zh.coreFeatures[0].title = mockI18n.en.coreFeatures[0].title;

		const bundle = {
			website: 'https://example.com',
			logo: 'https://example.com/logo.png',
			websiteScreenshot: 'https://example.com/screenshot.png',
			categorys: ['ai-3d-generator'],
			tags: ['freemium'],
			audiences: ['developers'],
			i18n: mockI18n,
		};

		const result = validateAgentSubmitBundle(bundle as any);
		expect(result.ok).toBe(false);
		expect(result.languageErrors?.zh).toBeDefined();
		expect(result.languageErrors?.zh).toContain('coreFeatures[0].title matches English text');
	});

	it('should fail validation when any URL field does not start with http:// or https://', () => {
		const { AGENT_REQUIRED_LANGUAGE_CODES } = require('../src/shared/product-languages');
		const mockI18n: any = {};
		for (const code of AGENT_REQUIRED_LANGUAGE_CODES) {
			mockI18n[code] = {
				name: `Name ${code}`,
				tagline: `This is a unique tagline for code ${code}.`,
				description: `This is a long unique description for code ${code} that has at least fifty characters.`,
				coreFeatures: [{ title: `Feature for ${code}`, description: `Description for ${code}` }],
			};
		}

		// 1. 无协议的 website，或相对路径的 productMedia
		const bundle = {
			website: 'example.com', // 缺少 http/https
			logo: 'https://example.com/logo.png',
			websiteScreenshot: 'https://example.com/screenshot.png',
			categorys: ['ai-3d-generator'],
			tags: ['freemium'],
			audiences: ['developers'],
			productMedia: [
				{
					type: 'video',
					url: 'assets/video.mp4', // 相对路径，缺少 http/https
				},
			],
			i18n: mockI18n,
		};

		const result = validateAgentSubmitBundle(bundle as any);
		expect(result.ok).toBe(false);
		expect(result.errors?.website).toBe('website URL must start with http:// or https://');
		expect(result.errors?.['productMedia[0].url']).toBe(
			'productMedia[0].url URL must start with http:// or https://',
		);
	});

	it('should pass validation when website uses http://', () => {
		const { AGENT_REQUIRED_LANGUAGE_CODES } = require('../src/shared/product-languages');
		const mockI18n: any = {};
		for (const code of AGENT_REQUIRED_LANGUAGE_CODES) {
			mockI18n[code] = {
				name: `Name ${code}`,
				tagline: `This is a unique tagline for code ${code}.`,
				description: `This is a long unique description for code ${code} that has at least fifty characters.`,
				coreFeatures: [{ title: `Feature for ${code}`, description: `Description for ${code}` }],
			};
		}

		const bundle = {
			website: 'http://example.com', // http:// 协议
			logo: 'https://example.com/logo.png',
			websiteScreenshot: 'https://example.com/screenshot.png',
			categorys: ['ai-3d-generator'],
			tags: ['freemium'],
			audiences: ['developers'],
			i18n: mockI18n,
		};

		const result = validateAgentSubmitBundle(bundle as any);
		expect(result.errors?.website).toBeUndefined();
	});

	it('should produce warnings for unknown properties but remain ok=true', () => {
		const { AGENT_REQUIRED_LANGUAGE_CODES } = require('../src/shared/product-languages');
		const mockI18n: any = {};
		for (const code of AGENT_REQUIRED_LANGUAGE_CODES) {
			mockI18n[code] = {
				name: `Name ${code}`,
				tagline: `This is a unique tagline for code ${code}.`,
				description: `This is a long unique description for code ${code} that has at least fifty characters.`,
				coreFeatures: [
					{ title: `Feature 1 ${code}`, description: `Desc 1 ${code}` },
					{ title: `Feature 2 ${code}`, description: `Desc 2 ${code}` },
					{ title: `Feature 3 ${code}`, description: `Desc 3 ${code}` },
				],
				useCases: [`Use case 1 ${code}`, `Use case 2 ${code}`, `Use case 3 ${code}`],
				pricing: [
					{
						chargeType: 'free',
						priceNote: `Free Note ${code}`,
						features: [`Feature 1 ${code}`],
					},
				],
				faqs: [
					{ question: `Question 1 ${code}?`, answer: `Answer 1 ${code}` },
					{ question: `Question 2 ${code}?`, answer: `Answer 2 ${code}` },
					{ question: `Question 3 ${code}?`, answer: `Answer 3 ${code}` },
				],
				extraI18nField: 'should warn', // i18n 内部多余字段
			};
		}

		const bundle = {
			website: 'https://example.com',
			logo: 'https://example.com/logo.png',
			websiteScreenshot: 'https://example.com/screenshot.png',
			categorys: ['ai-3d-generator'],
			tags: ['freemium'],
			audiences: ['developers'],
			social: {
				email: 'support@example.com',
			},
			extraRootField: 'should warn', // 根属性多余字段
			i18n: mockI18n,
		};

		const result = validateAgentSubmitBundle(bundle as any);
		expect(result.ok).toBe(true);
		expect(result.warnings).toBeDefined();
		expect(result.warnings?.['bundle.extraRootField']).toBe(
			'Unknown property "extraRootField" in submit bundle (ignored)',
		);
		expect(result.warnings?.['i18n.en.extraI18nField']).toBe(
			'Unknown property "extraI18nField" in i18n.en (ignored)',
		);
	});

	it('should fail validation when string length exceeds limit', () => {
		const { AGENT_REQUIRED_LANGUAGE_CODES } = require('../src/shared/product-languages');
		const mockI18n: any = {};
		for (const code of AGENT_REQUIRED_LANGUAGE_CODES) {
			mockI18n[code] = {
				name: 'A'.repeat(101), // Limit is 100
				tagline: `This is a unique tagline for code ${code}.`,
				description: `This is a long unique description for code ${code} that has at least fifty characters.`,
			};
		}

		const bundle = {
			website: 'https://example.com',
			logo: 'https://example.com/logo.png',
			websiteScreenshot: 'https://example.com/screenshot.png',
			categorys: ['ai-3d-generator'],
			tags: ['freemium'],
			audiences: ['developers'],
			i18n: mockI18n,
		};

		const result = validateAgentSubmitBundle(bundle as any);
		expect(result.ok).toBe(false);
		expect(result.errors?.['i18n.en.name']).toContain('must be at most 100 characters');
	});

	it('should fail validation when lists contain too many items', () => {
		const { AGENT_REQUIRED_LANGUAGE_CODES } = require('../src/shared/product-languages');
		const mockI18n: any = {};
		for (const code of AGENT_REQUIRED_LANGUAGE_CODES) {
			mockI18n[code] = {
				name: `Name ${code}`,
				tagline: `This is a unique tagline for code ${code}.`,
				description: `This is a long unique description for code ${code} that has at least fifty characters.`,
			};
		}

		const bundle = {
			website: 'https://example.com',
			logo: 'https://example.com/logo.png',
			websiteScreenshot: 'https://example.com/screenshot.png',
			categorys: Array(11).fill('ai-3d-generator'), // Limit is 10
			tags: ['freemium'],
			audiences: ['developers'],
			i18n: mockI18n,
		};

		const result = validateAgentSubmitBundle(bundle as any);
		expect(result.ok).toBe(false);
		expect(result.errors?.categorys).toContain('must have at most 10 items');
	});

	it('should correctly calculate signature', async () => {
		const { calculateAgentSubmitSignature } = require('../src/shared');
		const payload = JSON.stringify({ website: 'https://example.com' });
		const timestamp = 1719223200;
		const signature = await calculateAgentSubmitSignature(payload, timestamp);
		expect(signature).toBeDefined();
		expect(typeof signature).toBe('string');

		// 校验相同的 signature 能够用相同算法重现
		const signature2 = await calculateAgentSubmitSignature(payload, timestamp);
		expect(signature2).toBe(signature);
	});
});
