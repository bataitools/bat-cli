import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
	packAgentSubmit,
	validateAgentSubmitBundle,
	validateAgentSubmitPhase1,
	type AgentI18nEntry,
	type AgentSubmitBase,
	type AgentSubmitBundle,
} from './shared';
import { hasLocalLogo, hasLocalWebsiteScreenshot } from './submit-assets';

export function loadI18nDirectory(i18nDir: string): Record<string, AgentI18nEntry> {
	const result: Record<string, AgentI18nEntry> = {};
	const files = readdirSync(i18nDir).filter((f) => f.endsWith('.json'));
	for (const file of files) {
		const lang = file.replace(/\.json$/, '');
		const raw = JSON.parse(readFileSync(join(i18nDir, file), 'utf-8')) as AgentI18nEntry;
		result[lang] = raw;
	}
	return result;
}

export function loadSubmitDirectory(dir: string): AgentSubmitBundle {
	const basePath = join(dir, 'base.json');
	const i18nDir = join(dir, 'i18n');
	const base = JSON.parse(readFileSync(basePath, 'utf-8')) as AgentSubmitBase;
	if (!statSync(i18nDir).isDirectory()) {
		throw new Error(`Missing i18n directory: ${i18nDir}`);
	}
	const i18nByLang = loadI18nDirectory(i18nDir);
	const bundle = packAgentSubmit(base, i18nByLang);

	// 1. 自动截断外层数组（base.json）并输出警告
	if (Array.isArray(bundle.categorys) && bundle.categorys.length > 10) {
		console.warn(
			`\x1b[33m[WARNING]\x1b[0m Too many categorys (${bundle.categorys.length}) in base.json, automatically keeping the first 10.`,
		);
		bundle.categorys = bundle.categorys.slice(0, 10);
	}

	if (Array.isArray(bundle.tags) && bundle.tags.length > 15) {
		console.warn(
			`\x1b[33m[WARNING]\x1b[0m Too many tags (${bundle.tags.length}) in base.json, automatically keeping the first 15.`,
		);
		bundle.tags = bundle.tags.slice(0, 15);
	}

	if (Array.isArray(bundle.audiences) && bundle.audiences.length > 10) {
		console.warn(
			`\x1b[33m[WARNING]\x1b[0m Too many audiences (${bundle.audiences.length}) in base.json, automatically keeping the first 10.`,
		);
		bundle.audiences = bundle.audiences.slice(0, 10);
	}

	if (Array.isArray(bundle.productMedia) && bundle.productMedia.length > 20) {
		console.warn(
			`\x1b[33m[WARNING]\x1b[0m Too many productMedia items (${bundle.productMedia.length}) in base.json, automatically keeping the first 20.`,
		);
		bundle.productMedia = bundle.productMedia.slice(0, 20);
	}

	// 2. 自动截断多语言内层数组（i18n/*.json）并输出警告
	if (bundle.i18n && typeof bundle.i18n === 'object') {
		for (const lang of Object.keys(bundle.i18n)) {
			const entry = bundle.i18n[lang];
			if (!entry || typeof entry !== 'object') continue;

			if (Array.isArray(entry.coreFeatures) && entry.coreFeatures.length > 10) {
				console.warn(
					`\x1b[33m[WARNING]\x1b[0m Too many coreFeatures (${entry.coreFeatures.length}) in i18n/${lang}.json, automatically keeping the first 10.`,
				);
				entry.coreFeatures = entry.coreFeatures.slice(0, 10);
			}

			if (Array.isArray(entry.useCases) && entry.useCases.length > 10) {
				console.warn(
					`\x1b[33m[WARNING]\x1b[0m Too many useCases (${entry.useCases.length}) in i18n/${lang}.json, automatically keeping the first 10.`,
				);
				entry.useCases = entry.useCases.slice(0, 10);
			}

			if (Array.isArray(entry.faqs) && entry.faqs.length > 15) {
				console.warn(
					`\x1b[33m[WARNING]\x1b[0m Too many faqs (${entry.faqs.length}) in i18n/${lang}.json, automatically keeping the first 15.`,
				);
				entry.faqs = entry.faqs.slice(0, 15);
			}

			if (Array.isArray(entry.pricing) && entry.pricing.length > 10) {
				console.warn(
					`\x1b[33m[WARNING]\x1b[0m Too many pricing plans (${entry.pricing.length}) in i18n/${lang}.json, automatically keeping the first 10.`,
				);
				entry.pricing = entry.pricing.slice(0, 10);
			}

			if (Array.isArray(entry.pricing)) {
				entry.pricing.forEach((item, i) => {
					if (item && Array.isArray(item.features) && item.features.length > 20) {
						console.warn(
							`\x1b[33m[WARNING]\x1b[0m Too many features (${item.features.length}) in i18n/${lang}.json pricing[${i}], automatically keeping the first 20.`,
						);
						item.features = item.features.slice(0, 20);
					}
				});
			}
		}
	}

	return bundle;
}

export function validatePhase1Directory(dir: string) {
	const started = performance.now();
	const bundle = loadSubmitDirectory(dir);
	const result = validateAgentSubmitPhase1(bundle, {
		localWebsiteScreenshot: hasLocalWebsiteScreenshot(dir),
		localLogo: hasLocalLogo(dir),
	});
	if (result.warnings) {
		console.warn(
			`\x1b[33m[WARNING]\x1b[0m Detect unknown properties:\n${JSON.stringify(result.warnings, null, 2)}`,
		);
	}
	console.error(
		`[bat-cli:ValidatePhase1] dir=${dir} ok=${result.ok} in ${(performance.now() - started).toFixed(0)}ms`,
	);
	return result;
}

export async function packSubmitDirectory(dir: string): Promise<AgentSubmitBundle> {
	const started = performance.now();
	const bundle = loadSubmitDirectory(dir);
	const validation = validateAgentSubmitBundle(bundle);
	if (validation.warnings) {
		console.warn(
			`\x1b[33m[WARNING]\x1b[0m Detect unknown properties:\n${JSON.stringify(validation.warnings, null, 2)}`,
		);
	}
	if (!validation.ok) {
		const msg = JSON.stringify({ errors: validation.errors, languageErrors: validation.languageErrors }, null, 2);
		throw new Error(`Pack validation failed:\n${msg}`);
	}

	console.error(
		`[bat-cli:Pack] dir=${dir} langs=${Object.keys(bundle.i18n).length} in ${(performance.now() - started).toFixed(0)}ms`,
	);
	return bundle;
}
