import {
	AGENT_REQUIRED_I18N_COUNT,
	AGENT_REQUIRED_LANGUAGE_CODES,
	isSupportedProductLanguage,
	OPTIONAL_PRODUCT_LANGUAGE_CODES,
} from './product-languages';
import { resolveWebsiteScreenshot, resolveRemoteLogo } from './agent-screenshots';

import { normalizeProductMediaList, type ProductMediaItem } from './product-media';
import { buildSubmitChecklistFromPost, type ValidationResult } from './submit-validation';

export interface AgentRelatedArticle {
	url: string;
	title?: string;
	lang?: string;
}

export interface AgentI18nEntry {
	name?: string;
	tagline?: string;
	description?: string;
	instruction?: string;
	coreFeatures?: unknown[];
	useCases?: unknown[];
	pricing?: unknown[];
	faqs?: unknown[];
	seo?: Record<string, unknown>;
}

export interface AgentSubmitBundle {
	website: string;
	slug?: string;
	logo?: string;
	/** 官网截图 URL（全语言共用一张） */
	websiteScreenshot?: string;
	productMedia?: unknown[];
	categorys?: unknown[];
	tags?: unknown[];
	audiences?: unknown[];
	links?: Record<string, unknown>;
	social?: Record<string, unknown>;
	developerType?: string;
	developerCountry?: string;
	developerProvince?: string;
	developerName?: string;
	pricingUrl?: string;
	docsUrl?: string;
	relatedArticles?: AgentRelatedArticle[];
	i18n: Record<string, AgentI18nEntry>;
}

export interface AgentSubmitValidationResult extends ValidationResult {
	languageErrors?: Record<string, string>;
}

/** Phase 1 校验上下文（如本地截图 / logo 文件是否存在） */
export interface AgentSubmitPhase1Context {
	localWebsiteScreenshot?: boolean;
	localLogo?: boolean;
}

function jsonLen(value: unknown): number {
	if (Array.isArray(value)) return value.length;
	return 0;
}

function validateI18nEntry(lang: string, entry: AgentI18nEntry, enEntry: AgentI18nEntry): string | null {
	if (!entry.name || entry.name.length < 2) {
		return `${lang}: name must be at least 2 characters`;
	}
	if (!entry.tagline || entry.tagline.length < 10) {
		return `${lang}: tagline must be at least 10 characters`;
	}
	if (!entry.description || entry.description.length < 50) {
		return `${lang}: description must be at least 50 characters`;
	}
	if (jsonLen(entry.coreFeatures) !== jsonLen(enEntry.coreFeatures)) {
		return `${lang}: coreFeatures length must match en`;
	}
	if (jsonLen(entry.useCases) !== jsonLen(enEntry.useCases)) {
		return `${lang}: useCases length must match en`;
	}
	if (jsonLen(entry.pricing) !== jsonLen(enEntry.pricing)) {
		return `${lang}: pricing length must match en`;
	}
	// Verify each pricing entry's chargeType and priceText matches 'en' exactly
	const entryPricing = Array.isArray(entry.pricing) ? entry.pricing : [];
	const enPricing = Array.isArray(enEntry.pricing) ? enEntry.pricing : [];
	for (let i = 0; i < entryPricing.length; i++) {
		const item = entryPricing[i];
		const enItem = enPricing[i];
		if (!item || typeof item !== 'object') {
			return `${lang}: pricing plan at index ${i} must be an object`;
		}
		if (!enItem || typeof enItem !== 'object') {
			return `${lang}: en pricing plan at index ${i} is invalid`;
		}
		const p = item as Record<string, unknown>;
		const enP = enItem as Record<string, unknown>;
		if (p.chargeType !== enP.chargeType) {
			return `${lang}: pricing plan at index ${i} chargeType "${p.chargeType}" must match en "${enP.chargeType}"`;
		}
		if (p.name !== undefined && (typeof p.name !== 'string' || !p.name.trim())) {
			return `${lang}: pricing plan at index ${i} name must be a non-empty string when provided`;
		}
		if (p.recommend !== undefined && typeof p.recommend !== 'boolean') {
			return `${lang}: pricing plan at index ${i} recommend must be a boolean when provided`;
		}
		if (typeof p.priceNote !== 'string' || !p.priceNote.trim()) {
			return `${lang}: pricing plan at index ${i} priceNote must be a non-empty string`;
		}
		if (p.priceNote.trim().length > 100) {
			return `${lang}: pricing plan at index ${i} priceNote must be under 100 characters`;
		}
		if (!Array.isArray(p.features) || p.features.length === 0) {
			return `${lang}: pricing plan at index ${i} features must be a non-empty array`;
		}
		if (!p.features.every((f) => typeof f === 'string' && f.trim().length > 0)) {
			return `${lang}: pricing plan at index ${i} features must only contain non-empty strings`;
		}
	}
	if (jsonLen(entry.faqs) !== jsonLen(enEntry.faqs)) {
		return `${lang}: faqs length must match en`;
	}

	// 针对非英语语种，检查部分列表字段是否直接拷贝了英文文本
	if (lang !== 'en') {
		const features = Array.isArray(entry.coreFeatures) ? entry.coreFeatures : [];
		const enFeatures = Array.isArray(enEntry.coreFeatures) ? enEntry.coreFeatures : [];
		for (let i = 0; i < features.length; i++) {
			const f = features[i] as any;
			const enF = enFeatures[i] as any;
			if (f && enF) {
				if (f.title && enF.title && f.title.trim() === enF.title.trim()) {
					return `${lang}: coreFeatures[${i}].title matches English text (not translated)`;
				}
				if (f.description && enF.description && f.description.trim() === enF.description.trim()) {
					return `${lang}: coreFeatures[${i}].description matches English text (not translated)`;
				}
			}
		}

		const cases = Array.isArray(entry.useCases) ? entry.useCases : [];
		const enCases = Array.isArray(enEntry.useCases) ? enEntry.useCases : [];
		for (let i = 0; i < cases.length; i++) {
			const c = cases[i];
			const enC = enCases[i];
			if (typeof c === 'string' && typeof enC === 'string' && c.trim() && c.trim() === enC.trim()) {
				return `${lang}: useCases[${i}] matches English text (not translated)`;
			}
		}

		const faqs = Array.isArray(entry.faqs) ? entry.faqs : [];
		const enFaqs = Array.isArray(enEntry.faqs) ? enEntry.faqs : [];
		for (let i = 0; i < faqs.length; i++) {
			const f = faqs[i] as any;
			const enF = enFaqs[i] as any;
			if (f && enF) {
				if (f.question && enF.question && f.question.trim() === enF.question.trim()) {
					return `${lang}: faqs[${i}].question matches English text (not translated)`;
				}
				if (f.answer && enF.answer && f.answer.trim() === enF.answer.trim()) {
					return `${lang}: faqs[${i}].answer matches English text (not translated)`;
				}
			}
		}
	}

	return null;
}

function validateRelatedArticles(articles: unknown): string | null {
	if (articles == null) return null;
	if (!Array.isArray(articles)) return 'relatedArticles must be an array';
	for (const item of articles) {
		if (!item || typeof item !== 'object') return 'relatedArticles items must be objects';
		const url = (item as AgentRelatedArticle).url;
		if (typeof url !== 'string' || !url.trim()) return 'relatedArticles.url is required';
		try {
			new URL(url);
		} catch {
			return `relatedArticles.url is invalid: ${url}`;
		}
	}
	return null;
}

/** 将 Agent bundle 转为单语言 checklist 输入（以 en 为准） */
export function agentBundleToEnPost(bundle: AgentSubmitBundle): Record<string, unknown> {
	const en = bundle.i18n.en ?? {};
	return {
		orderType: 'SUBMIT_AGENT',
		slug: bundle.slug,
		name: en.name,
		tagline: en.tagline,
		description: en.description,
		instruction: en.instruction,
		developerName: bundle.developerName,
		developerType: bundle.developerType,
		developerCountry: bundle.developerCountry,
		developerProvince: bundle.developerProvince,
		website: bundle.website,
		websiteScreenshot: resolveWebsiteScreenshot(bundle),
		logo: bundle.logo,
		coreFeatures: en.coreFeatures ?? [],
		useCases: en.useCases ?? [],
		pricing: en.pricing ?? [],
		faqs: en.faqs ?? [],
		tags: bundle.tags ?? [],
		audiences: bundle.audiences ?? [],
		categorys: bundle.categorys ?? [],
		links: bundle.links ?? {},
		social: bundle.social ?? {},
		pricing_url: bundle.pricingUrl ?? '',
		docs_url: bundle.docsUrl ?? '',
		seo: en.seo,
	};
}

function validateBundleWebsite(website: unknown): AgentSubmitValidationResult | null {
	if (!website || typeof website !== 'string') {
		return {
			ok: false,
			items: [],
			errors: { website: 'website is required' },
		};
	}
	try {
		new URL(website.startsWith('http') ? website : `https://${website}`);
	} catch {
		return {
			ok: false,
			items: [],
			errors: { website: 'website must be a valid URL' },
		};
	}
	return null;
}

function validateHttpOrHttpsUrls(bundle: AgentSubmitBundle): Record<string, string> | null {
	const errors: Record<string, string> = {};

	const check = (val: unknown, fieldName: string) => {
		if (typeof val === 'string' && val.trim()) {
			const trimmed = val.trim();
			if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
				errors[fieldName] = `${fieldName} URL must start with http:// or https://`;
			}
		}
	};

	check(bundle.website, 'website');
	check(bundle.pricingUrl, 'pricingUrl');
	check(bundle.docsUrl, 'docsUrl');
	check(bundle.logo, 'logo');
	check(bundle.websiteScreenshot, 'websiteScreenshot');

	const media = Array.isArray(bundle.productMedia) ? bundle.productMedia : [];
	for (let i = 0; i < media.length; i++) {
		const item = media[i];
		if (item && typeof item === 'object') {
			const m = item as Record<string, unknown>;
			check(m.url, `productMedia[${i}].url`);
			check(m.thumbnail, `productMedia[${i}].thumbnail`);
		}
	}

	return Object.keys(errors).length > 0 ? errors : null;
}

/** Phase 1：仅校验 base.json + i18n/en.json（英文阶段完成检查） */
export function validateAgentSubmitPhase1(
	bundle: unknown,
	context?: AgentSubmitPhase1Context,
): AgentSubmitValidationResult {
	const languageErrors: Record<string, string> = {};

	if (!bundle || typeof bundle !== 'object') {
		return {
			ok: false,
			items: [],
			errors: { bundle: 'Submit bundle must be an object' },
			languageErrors,
		};
	}

	const b = bundle as AgentSubmitBundle;
	const httpOrHttpsErrors = validateHttpOrHttpsUrls(b);
	if (httpOrHttpsErrors) {
		return {
			ok: false,
			items: [],
			errors: httpOrHttpsErrors,
			languageErrors,
		};
	}
	const websiteErr = validateBundleWebsite(b.website);
	if (websiteErr) return { ...websiteErr, languageErrors };

	if (!b.i18n?.en) {
		return {
			ok: false,
			items: [],
			errors: { i18n: 'i18n/en.json is required for Phase 1' },
			languageErrors,
		};
	}

	const enEntry = b.i18n.en;
	const enErr = validateI18nEntry('en', enEntry, enEntry);
	if (enErr) languageErrors.en = enErr;

	const hasRemoteScreenshot = Boolean(resolveWebsiteScreenshot(b));
	const hasLocalScreenshot = context?.localWebsiteScreenshot === true;
	if (!hasRemoteScreenshot && !hasLocalScreenshot) {
		return {
			ok: false,
			items: [],
			errors: {
				websiteScreenshot:
					'websiteScreenshot URL in base.json or local website-screenshot.png is required (run capture-screenshot first)',
			},
			languageErrors: Object.keys(languageErrors).length > 0 ? languageErrors : undefined,
		};
	}

	const hasRemoteLogo = Boolean(resolveRemoteLogo(b));
	const hasLocalLogo = context?.localLogo === true;
	if (!hasRemoteLogo && !hasLocalLogo) {
		return {
			ok: false,
			items: [],
			errors: {
				logo: 'logo URL in base.json or local logo file (svg/webp/png/jpg) is required (run fetch-logo first)',
			},
			languageErrors: Object.keys(languageErrors).length > 0 ? languageErrors : undefined,
		};
	}

	const articlesErr = validateRelatedArticles(b.relatedArticles);
	if (articlesErr) {
		return {
			ok: false,
			items: [],
			errors: { relatedArticles: articlesErr },
			languageErrors,
		};
	}

	normalizeProductMediaList(b.productMedia);

	const postForChecklist = agentBundleToEnPost(b);
	if (!resolveRemoteLogo(b) && context?.localLogo) {
		postForChecklist.logo = 'local://logo.webp';
	}

	const baseResult = buildSubmitChecklistFromPost(postForChecklist, {
		optionalDeveloperIdentity: true,
	});
	const ok = baseResult.ok && Object.keys(languageErrors).length === 0;

	return {
		...baseResult,
		ok,
		languageErrors: Object.keys(languageErrors).length > 0 ? languageErrors : undefined,
	};
}

export function validateAgentSubmitBundle(bundle: unknown): AgentSubmitValidationResult {
	const languageErrors: Record<string, string> = {};

	if (!bundle || typeof bundle !== 'object') {
		return {
			ok: false,
			items: [],
			errors: { bundle: 'Submit bundle must be an object' },
			languageErrors,
		};
	}

	const b = bundle as AgentSubmitBundle;
	const httpOrHttpsErrors = validateHttpOrHttpsUrls(b);
	if (httpOrHttpsErrors) {
		return {
			ok: false,
			items: [],
			errors: httpOrHttpsErrors,
			languageErrors,
		};
	}

	const websiteErr = validateBundleWebsite(b.website);
	if (websiteErr) return { ...websiteErr, languageErrors };

	if (!resolveWebsiteScreenshot(b)) {
		return {
			ok: false,
			items: [],
			errors: { websiteScreenshot: 'websiteScreenshot is required' },
			languageErrors,
		};
	}

	if (!resolveRemoteLogo(b)) {
		return {
			ok: false,
			items: [],
			errors: { logo: 'logo is required' },
			languageErrors,
		};
	}

	if (!b.i18n || typeof b.i18n !== 'object') {
		return {
			ok: false,
			items: [],
			errors: { i18n: 'i18n object is required' },
			languageErrors,
		};
	}

	const langs = Object.keys(b.i18n);

	const missing = AGENT_REQUIRED_LANGUAGE_CODES.filter((code) => !b.i18n[code]);
	if (missing.length > 0) {
		return {
			ok: false,
			items: [],
			errors: {
				i18n: `All ${AGENT_REQUIRED_I18N_COUNT} languages are required. Missing: ${missing.join(', ')}`,
			},
			languageErrors,
		};
	}

	for (const lang of langs) {
		if (!isSupportedProductLanguage(lang)) {
			languageErrors[lang] =
				`Unsupported language: ${lang}. Allowed required: ${AGENT_REQUIRED_LANGUAGE_CODES.join(', ')}; optional: ${OPTIONAL_PRODUCT_LANGUAGE_CODES.join(', ')}`;
		}
	}

	const enEntry = b.i18n.en;
	for (const lang of langs) {
		if (lang === 'en') continue;
		const err = validateI18nEntry(lang, b.i18n[lang] ?? {}, enEntry);
		if (err) languageErrors[lang] = err;
	}

	// 检查主要文本字段在全语种间的唯一性（防止拷贝未翻译文本）
	const taglineLangs: Record<string, string> = {};
	const descriptionLangs: Record<string, string> = {};
	const instructionLangs: Record<string, string> = {};

	for (const lang of langs) {
		const entry = b.i18n[lang];
		if (!entry) continue;

		if (entry.tagline && entry.tagline.trim()) {
			const val = entry.tagline.trim();
			if (taglineLangs[val] && taglineLangs[val] !== lang) {
				languageErrors[lang] =
					`${lang}: tagline is identical to the translation in ${taglineLangs[val]} (must be unique across languages)`;
			} else {
				taglineLangs[val] = lang;
			}
		}

		if (entry.description && entry.description.trim()) {
			const val = entry.description.trim();
			if (descriptionLangs[val] && descriptionLangs[val] !== lang) {
				languageErrors[lang] =
					`${lang}: description is identical to the translation in ${descriptionLangs[val]} (must be unique across languages)`;
			} else {
				descriptionLangs[val] = lang;
			}
		}

		if (entry.instruction && entry.instruction.trim()) {
			const val = entry.instruction.trim();
			if (instructionLangs[val] && instructionLangs[val] !== lang) {
				languageErrors[lang] =
					`${lang}: instruction is identical to the translation in ${instructionLangs[val]} (must be unique across languages)`;
			} else {
				instructionLangs[val] = lang;
			}
		}
	}

	const articlesErr = validateRelatedArticles(b.relatedArticles);
	if (articlesErr) {
		return {
			ok: false,
			items: [],
			errors: { relatedArticles: articlesErr },
			languageErrors,
		};
	}

	normalizeProductMediaList(b.productMedia);

	const baseResult = buildSubmitChecklistFromPost(agentBundleToEnPost(b), {
		optionalDeveloperIdentity: true,
	});
	const ok = baseResult.ok && Object.keys(languageErrors).length === 0;

	return {
		...baseResult,
		ok,
		languageErrors: Object.keys(languageErrors).length > 0 ? languageErrors : undefined,
	};
}

export function normalizeAgentProductMedia(raw: unknown): ProductMediaItem[] {
	return normalizeProductMediaList(raw);
}
