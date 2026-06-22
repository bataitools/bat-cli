const PRODUCT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const MAX_PRODUCT_SLUG_LENGTH = 60;

export function normalizeProductSlug(input: string): string {
	return input
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, MAX_PRODUCT_SLUG_LENGTH);
}

export function slugFromWebsite(website: string): string {
	const raw = website.trim();
	if (!raw) return '';

	try {
		const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
		let host = url.hostname.toLowerCase();
		if (host.startsWith('www.')) {
			host = host.slice(4);
		}

		let parts = host.split('.').filter(Boolean);
		if (parts.length === 0) return '';

		if (parts.length > 1 && parts[parts.length - 1] === 'com') {
			parts.pop();
		}

		const base = parts.join('-');
		return normalizeProductSlug(base);
	} catch {
		return normalizeProductSlug(raw);
	}
}

export function isValidProductSlug(slug: string): boolean {
	return (
		slug.length >= 2 &&
		slug.length <= MAX_PRODUCT_SLUG_LENGTH &&
		PRODUCT_SLUG_PATTERN.test(slug)
	);
}

export function isNewSubmitType(type: string | null | undefined): boolean {
	if (!type) return true;
	return type.toUpperCase().startsWith('SUBMIT_');
}

export function isUpdateSubmitType(type: string | null | undefined): boolean {
	if (!type) return false;
	return type.toUpperCase().startsWith('UPDATE_');
}
