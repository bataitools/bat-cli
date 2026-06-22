const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export function normalizeHostname(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	try {
		const url = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
		const hostname = new URL(url).hostname.toLowerCase();
		return hostname.replace(/^www\./, '');
	} catch {
		return null;
	}
}

/** 证明页是否与产品官网同域（含子域名，如 blog.example.com） */
export function isExchangeProofOnProductSite(proofUrl: string, productWebsite: string): boolean {
	const proofHost = normalizeHostname(proofUrl);
	const siteHost = normalizeHostname(productWebsite);
	if (!proofHost || !siteHost) return false;
	if (LOCAL_HOSTS.has(proofHost) && LOCAL_HOSTS.has(siteHost)) return proofHost === siteHost;
	if (proofHost === siteHost) return true;
	return proofHost.endsWith(`.${siteHost}`);
}

export function validateExchangeProofUrl(
	proofUrl: string,
	productWebsite: string,
): { ok: true } | { ok: false; message: string } {
	const trimmed = proofUrl.trim();
	if (!trimmed) {
		return { ok: false, message: 'Please enter the page URL where you placed our backlink.' };
	}
	const proofHost = normalizeHostname(trimmed);
	if (!proofHost) {
		return { ok: false, message: 'Please enter a valid URL (e.g. https://yourwebsite.com/blog/post).' };
	}
	const siteHost = normalizeHostname(productWebsite);
	if (!siteHost) {
		return { ok: false, message: 'Product website is missing. Please save your website URL on the edit page first.' };
	}
	if (!isExchangeProofOnProductSite(trimmed, productWebsite)) {
		return {
			ok: false,
			message: `The backlink page must be on the same domain as your product website (${siteHost}).`,
		};
	}
	return { ok: true };
}
