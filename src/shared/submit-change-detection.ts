import { normalizeDeveloperType } from './developer-type';
import { isUpdateSubmitType } from './product-slug';

export const SUBMIT_CHANGE_FIELD_KEYS = [
	'name',
	'logo',
	'tagline',
	'description',
	'instruction',
	'developerName',
	'developerType',
	'developerCountry',
	'developerProvince',
	'websiteScreenshot',
	'productMedia',
	'coreFeatures',
	'useCases',
	'pricing',
	'faqs',
	'audiences',
	'tags',
	'links',
	'social',
	'categorys',
	'pricingUrl',
	'docsUrl',
] as const;

export type SubmitChangeSnapshot = Record<(typeof SUBMIT_CHANGE_FIELD_KEYS)[number], unknown>;

function trimString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function normalizeSlugList(items: unknown): string[] {
	if (!Array.isArray(items)) return [];
	return items
		.map((item) => {
			if (typeof item === 'string') return item.trim();
			if (item && typeof item === 'object') {
				const obj = item as Record<string, unknown>;
				if (typeof obj.value === 'string') return obj.value.trim();
				if (typeof obj.slug === 'string') return obj.slug.trim();
				if (typeof obj.label === 'string') return obj.label.trim();
			}
			return '';
		})
		.filter(Boolean)
		.sort();
}

function normalizeUseCases(items: unknown): string[] {
	if (!Array.isArray(items)) return [];
	return items
		.map((item) => {
			if (typeof item === 'string') return item.trim();
			if (item && typeof item === 'object' && 'title' in item) {
				return String((item as { title?: unknown }).title ?? '').trim();
			}
			return '';
		})
		.filter(Boolean)
		.sort();
}

function normalizeCoreFeatures(items: unknown): { title: string; description: string }[] {
	if (!Array.isArray(items)) return [];
	return items
		.map((item) => {
			if (!item || typeof item !== 'object') return { title: '', description: '' };
			const row = item as { title?: unknown; description?: unknown };
			return {
				title: String(row.title ?? '').trim(),
				description: String(row.description ?? '').trim(),
			};
		})
		.filter((item) => item.title)
		.sort((a, b) => a.title.localeCompare(b.title));
}

function normalizePricing(items: unknown): unknown[] {
	if (!Array.isArray(items)) return [];
	return [...items].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function normalizeFaqs(items: unknown): { question: string; answer: string }[] {
	if (!Array.isArray(items)) return [];
	return items
		.map((item) => {
			if (!item || typeof item !== 'object') return { question: '', answer: '' };
			const row = item as { question?: unknown; answer?: unknown };
			return {
				question: String(row.question ?? '').trim(),
				answer: String(row.answer ?? '').trim(),
			};
		})
		.filter((item) => item.question)
		.sort((a, b) => a.question.localeCompare(b.question));
}

function normalizeRecord(value: unknown): Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const out: Record<string, string> = {};
	for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
		out[key] = trimString(raw);
	}
	return out;
}

function normalizeMedia(items: unknown): string[] {
	if (!Array.isArray(items)) return [];
	return items
		.map((item) => {
			if (typeof item === 'string') return item.trim();
			if (item && typeof item === 'object') {
				const obj = item as Record<string, unknown>;
				if (typeof obj.url === 'string') return obj.url.trim();
				if (typeof obj.src === 'string') return obj.src.trim();
			}
			return JSON.stringify(item);
		})
		.filter(Boolean)
		.sort();
}

export function buildSubmitChangeSnapshot(post: Record<string, unknown>): SubmitChangeSnapshot {
	return {
		name: trimString(post.name),
		logo: trimString(post.logo),
		tagline: trimString(post.tagline),
		description: trimString(post.description),
		instruction: trimString(post.instruction),
		developerName: trimString(post.developerName),
		developerType: normalizeDeveloperType(post.developerType),
		developerCountry: trimString(post.developerCountry),
		developerProvince: trimString(post.developerProvince),
		websiteScreenshot: trimString(post.websiteScreenshot),
		productMedia: normalizeMedia(post.productMedia),
		coreFeatures: normalizeCoreFeatures(post.coreFeatures),
		useCases: normalizeUseCases(post.useCases),
		pricing: normalizePricing(post.pricing),
		faqs: normalizeFaqs(post.faqs),
		audiences: normalizeSlugList(post.audiences),
		tags: normalizeSlugList(post.tags),
		links: normalizeRecord(post.links),
		social: normalizeRecord(post.social),
		categorys: normalizeSlugList(post.categorys),
		pricingUrl: trimString(post.pricingUrl ?? post.pricing_url),
		docsUrl: trimString(post.docsUrl ?? post.docs_url),
	};
}

function stableStringify(value: unknown): string {
	return JSON.stringify(value);
}

export function hasSubmitContentChanges(
	current: Record<string, unknown>,
	baseline: Record<string, unknown>,
): boolean {
	const left = buildSubmitChangeSnapshot(current);
	const right = buildSubmitChangeSnapshot(baseline);
	return stableStringify(left) !== stableStringify(right);
}

export function isUpdateSubmitContext(post: Record<string, unknown>): boolean {
	if (post.productId) return true;
	const submitType =
		(typeof post.orderType === 'string' ? post.orderType : '') ||
		(typeof post.type === 'string' ? post.type : '');
	return isUpdateSubmitType(submitType);
}
