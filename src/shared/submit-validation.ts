import { isValidDeveloperType } from './agent-developer-type';

export interface ChecklistItem {
	id: string;
	sectionId: string;
	label: string;
	ok: boolean;
	message?: string;
	errorKey?: string;
}

export interface SubmitFormSnapshot {
	post: Record<string, unknown>;
	logo: unknown;
	categorys: unknown[];
}

/** Agent 提交：开发者信息在官网未披露时允许留空 */
export interface BuildSubmitChecklistOptions {
	optionalDeveloperIdentity?: boolean;
}

export interface ValidationResult {
	items: ChecklistItem[];
	errors: Record<string, string>;
	ok: boolean;
}

function isBlank(value: unknown): boolean {
	return typeof value !== 'string' || value.trim().length === 0;
}

export function buildSubmitChecklist(
	{ post, logo, categorys }: SubmitFormSnapshot,
	options: BuildSubmitChecklistOptions = {},
): ValidationResult {
	const optionalDev = options.optionalDeveloperIdentity === true;
	const errors: Record<string, string> = {};
	const items: ChecklistItem[] = [];

	const add = (item: Omit<ChecklistItem, 'ok'> & { ok: boolean }) => {
		items.push(item);
		if (!item.ok && item.errorKey && item.message) {
			errors[item.errorKey] = item.message;
		}
	};

	const name = typeof post.name === 'string' ? post.name : '';
	const isUpdate = Boolean(post.productId);
	const tagline = typeof post.tagline === 'string' ? post.tagline : '';
	const description = typeof post.description === 'string' ? post.description : '';
	const developerName = typeof post.developerName === 'string' ? post.developerName : '';
	const social = (post.social ?? {}) as { email?: string };
	const coreFeatures = Array.isArray(post.coreFeatures) ? post.coreFeatures : [];
	const useCases = Array.isArray(post.useCases) ? post.useCases : [];
	const pricing = Array.isArray(post.pricing) ? post.pricing : [];
	const faqs = Array.isArray(post.faqs) ? post.faqs : [];
	const tags = Array.isArray(post.tags) ? post.tags : [];
	const audiences = Array.isArray(post.audiences) ? post.audiences : [];

	add({
		id: 'name',
		sectionId: 'basic-info',
		label: 'Product name',
		ok: name.length >= 2,
		message: 'Product name must be at least 2 characters',
		errorKey: 'name',
	});

	add({
		id: 'tagline',
		sectionId: 'basic-info',
		label: 'Tagline',
		ok: tagline.length >= 10,
		message: 'Tagline must be at least 10 characters',
		errorKey: 'tagline',
	});

	add({
		id: 'description',
		sectionId: 'basic-info',
		label: 'Product description',
		ok: description.length >= 50,
		message: 'Description must be at least 50 characters',
		errorKey: 'description',
	});

	add({
		id: 'logo',
		sectionId: 'basic-info',
		label: 'Product logo',
		ok: Boolean(logo),
		message: 'Product logo is required',
		errorKey: 'logo',
	});

	const developerCountry = typeof post.developerCountry === 'string' ? post.developerCountry.trim() : '';
	const developerProvince = typeof post.developerProvince === 'string' ? post.developerProvince.trim() : '';
	const developerType = typeof post.developerType === 'string' ? post.developerType.trim() : '';

	add({
		id: 'developerName',
		sectionId: 'basic-info',
		label: 'Developer / company name',
		ok: optionalDev ? isBlank(developerName) || developerName.length >= 2 : developerName.length >= 2,
		message: optionalDev
			? 'Developer name must be at least 2 characters when provided'
			: 'Developer name is required',
		errorKey: 'developerName',
	});

	add({
		id: 'developerType',
		sectionId: 'basic-info',
		label: 'Developer type',
		ok: optionalDev
			? isBlank(developerType) || isValidDeveloperType(developerType)
			: isValidDeveloperType(post.developerType),
		message: 'Developer type must be one of: company, team, individual',
		errorKey: 'developerType',
	});

	add({
		id: 'developerLocation',
		sectionId: 'basic-info',
		label: 'Developer location',
		ok: optionalDev
			? (isBlank(developerCountry) && isBlank(developerProvince)) ||
				(Boolean(developerCountry) && Boolean(developerProvince))
			: Boolean(developerCountry && developerProvince),
		message: optionalDev
			? 'Provide both country and province, or leave both empty'
			: 'Country and province are required',
		errorKey: 'developerLocation',
	});

	add({
		id: 'email',
		sectionId: 'basic-info',
		label: 'Public support email',
		ok: !social.email || social.email.trim() === '' || /^\S+@\S+\.\S+$/.test(social.email),
		message: 'Valid public support email is required',
		errorKey: 'email',
	});

	add({
		id: 'websiteScreenshot',
		sectionId: 'visual-assets',
		label: 'Website screenshot',
		ok: Boolean(post.websiteScreenshot),
		message: 'Website screenshot is required',
		errorKey: 'websiteScreenshot',
	});

	const featureTitles = coreFeatures
		.map((f) => (typeof f === 'object' && f && 'title' in f ? String(f.title).trim().toLowerCase() : ''))
		.filter((title) => title);
	const useCaseTitles = useCases
		.map((u) => (typeof u === 'string' ? u.trim().toLowerCase() : ''))
		.filter((title) => title);

	const duplicateFeature = featureTitles.find((title, index) => featureTitles.indexOf(title) !== index);
	const duplicateUseCase = useCaseTitles.find((title, index) => useCaseTitles.indexOf(title) !== index);
	const crossDuplicate = featureTitles.find((title) => useCaseTitles.includes(title));

	add({
		id: 'coreFeatures',
		sectionId: 'features-usecases',
		label: 'Core features (min. 3)',
		ok: coreFeatures.length >= 3 && !duplicateFeature && !crossDuplicate,
		message: duplicateFeature
			? 'Core feature titles must be unique'
			: crossDuplicate
				? 'Titles cannot repeat between core features and use cases'
				: 'Add at least 3 core features',
		errorKey: 'coreFeatures',
	});

	add({
		id: 'useCases',
		sectionId: 'features-usecases',
		label: 'Use cases (min. 3)',
		ok: useCases.length >= 3 && !duplicateUseCase && !crossDuplicate,
		message: duplicateUseCase
			? 'Use case titles must be unique'
			: crossDuplicate
				? 'Titles cannot repeat between core features and use cases'
				: 'Add at least 3 use cases',
		errorKey: 'useCases',
	});

	let pricingError: string | undefined;
	const ALLOWED_CHARGE_TYPES = ['free', 'recurring', 'flat', 'contact'];

	if (pricing.length === 0) {
		pricingError = 'Add at least one complete pricing plan';
	} else {
		for (let i = 0; i < pricing.length; i++) {
			const item = pricing[i];
			if (typeof item !== 'object' || !item) {
				pricingError = `Pricing plan at index ${i} must be an object`;
				break;
			}
			const p = item as Record<string, unknown>;
			if (typeof p.chargeType !== 'string' || !p.chargeType.trim()) {
				pricingError = `Pricing plan at index ${i}: chargeType must be a string`;
				break;
			}
			const chargeType = p.chargeType.trim().toLowerCase();
			if (!ALLOWED_CHARGE_TYPES.includes(chargeType)) {
				pricingError = `Pricing plan at index ${i}: chargeType "${p.chargeType}" is invalid. Allowed: ${ALLOWED_CHARGE_TYPES.join(', ')}`;
				break;
			}
			if (typeof p.priceNote !== 'string') {
				pricingError = `Pricing plan at index ${i}: priceNote must be a string`;
				break;
			}
			const priceNoteVal = p.priceNote.trim();
			if (priceNoteVal.length === 0) {
				pricingError = `Pricing plan at index ${i}: priceNote cannot be empty`;
				break;
			}
			if (priceNoteVal.length > 100) {
				pricingError = `Pricing plan at index ${i}: priceNote must be under 100 characters`;
				break;
			}
			if (!Array.isArray(p.features) || p.features.length === 0) {
				pricingError = `Pricing plan at index ${i}: features must be a non-empty array`;
				break;
			}
			if (!p.features.every((f) => typeof f === 'string' && f.trim().length > 0)) {
				pricingError = `Pricing plan at index ${i}: features must only contain non-empty strings`;
				break;
			}
		}
	}

	add({
		id: 'pricing',
		sectionId: 'pricing-plans',
		label: 'Pricing plans',
		ok: !pricingError,
		message: pricingError || 'Add at least one complete pricing plan',
		errorKey: 'pricing',
	});

	add({
		id: 'faqs',
		sectionId: 'faq',
		label: 'FAQs (min. 3)',
		ok: faqs.length >= 3,
		message: 'Add at least 3 FAQs',
		errorKey: 'faqs',
	});

	add({
		id: 'categorys',
		sectionId: 'categorization',
		label: 'Categories',
		ok: categorys.length > 0,
		message: 'Select at least one category',
		errorKey: 'categorys',
	});

	add({
		id: 'tags',
		sectionId: 'categorization',
		label: 'Tags',
		ok: tags.length > 0,
		message: 'Select at least one tag',
		errorKey: 'tags',
	});

	add({
		id: 'audiences',
		sectionId: 'categorization',
		label: 'Target audiences',
		ok: audiences.length > 0,
		message: 'Select at least one target audience',
		errorKey: 'audiences',
	});

	const ok = items.every((item) => item.ok);
	return { items, errors, ok };
}

/** 从 API 返回的草稿对象构建检查清单（与 QuickEditor 表单状态对齐） */
export function buildSubmitChecklistFromPost(post: Record<string, unknown>, options: BuildSubmitChecklistOptions = {}) {
	return buildSubmitChecklist(
		{
			post,
			logo: post.logo,
			categorys: Array.isArray(post.categorys) ? post.categorys : [],
		},
		options,
	);
}
