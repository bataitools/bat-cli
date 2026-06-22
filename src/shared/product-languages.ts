/** 单条产品语言元数据 */
export interface ProductLanguageDefinition {
	readonly code: string;
	readonly name: string;
	readonly nativeName: string;
}

/**
 * Agent 提交必填语言（28 种，含 en）。
 *
 * 选取标准（2024–2025 互联网数据）：
 * 1. 互联网用户数 Top 10：en, zh, es, ar, id, pt, fr, ja, ru, de
 * 2. 用户数 / 网页内容占比均显著的区域语言：ko, tr, vi, it, nl, pl, th, hi, uk, fa, bn, ur
 * 3. 繁体中文独立 SEO 市场：tw
 * 4. 高 ARPU 市场：sv, no, da, fi, he（北欧 + 以色列）
 */
export const AGENT_REQUIRED_PRODUCT_LANGUAGES = [
	{ code: 'en', name: 'English', nativeName: 'English' },
	{ code: 'zh', name: 'Simplified Chinese', nativeName: '简体中文' },
	{ code: 'tw', name: 'Traditional Chinese', nativeName: '繁體中文' },
	{ code: 'es', name: 'Spanish', nativeName: 'Español' },
	{ code: 'ar', name: 'Arabic', nativeName: 'العربية' },
	{ code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
	{ code: 'pt', name: 'Portuguese', nativeName: 'Português' },
	{ code: 'fr', name: 'French', nativeName: 'Français' },
	{ code: 'ja', name: 'Japanese', nativeName: '日本語' },
	{ code: 'ru', name: 'Russian', nativeName: 'Русский' },
	{ code: 'de', name: 'German', nativeName: 'Deutsch' },
	{ code: 'ko', name: 'Korean', nativeName: '한국어' },
	{ code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
	{ code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
	{ code: 'it', name: 'Italian', nativeName: 'Italiano' },
	{ code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
	{ code: 'pl', name: 'Polish', nativeName: 'Polski' },
	{ code: 'th', name: 'Thai', nativeName: 'ไทย' },
	{ code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
	{ code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
	{ code: 'fa', name: 'Persian', nativeName: 'فارسی' },
	{ code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
	{ code: 'ur', name: 'Urdu', nativeName: 'اردو' },
	{ code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
	{ code: 'no', name: 'Norwegian', nativeName: 'Norsk' },
	{ code: 'da', name: 'Danish', nativeName: 'Dansk' },
	{ code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
	{ code: 'he', name: 'Hebrew', nativeName: 'עברית' },
] as const satisfies readonly ProductLanguageDefinition[];

/** 可选产品语言（当前无；预留扩展位，非必填语言放此处） */
export const OPTIONAL_PRODUCT_LANGUAGES: readonly ProductLanguageDefinition[] = [];

/** 产品详情页允许存储与展示的全部语言（必填 + 可选） */
export const SUPPORTED_PRODUCT_LANGUAGES = [
	...AGENT_REQUIRED_PRODUCT_LANGUAGES,
	...OPTIONAL_PRODUCT_LANGUAGES,
] as const;

export type ProductLanguageCode = (typeof SUPPORTED_PRODUCT_LANGUAGES)[number]['code'];

export const AGENT_REQUIRED_LANGUAGE_CODES: ProductLanguageCode[] = AGENT_REQUIRED_PRODUCT_LANGUAGES.map(
	(language) => language.code,
);

export const OPTIONAL_PRODUCT_LANGUAGE_CODES: ProductLanguageCode[] = OPTIONAL_PRODUCT_LANGUAGES.map(
	(language) => language.code,
);

export const SUPPORTED_PRODUCT_LANGUAGE_CODES: ProductLanguageCode[] = SUPPORTED_PRODUCT_LANGUAGES.map(
	(language) => language.code,
);

export const AGENT_REQUIRED_I18N_COUNT = AGENT_REQUIRED_LANGUAGE_CODES.length;

export function isSupportedProductLanguage(lang: string): lang is ProductLanguageCode {
	return SUPPORTED_PRODUCT_LANGUAGE_CODES.includes(lang as ProductLanguageCode);
}

