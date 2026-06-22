import { join } from 'node:path';

/** URL hostname as directory segment — lowercase only, no other normalization. */
export function hostnameFromWebsite(website: string): string {
	const trimmed = website.trim();
	if (!trimmed) {
		throw new Error('website is required');
	}
	const withProtocol =
		trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
	const host = new URL(withProtocol).hostname.toLowerCase();
	if (!host) {
		throw new Error(`Invalid website: ${website}`);
	}
	return host;
}

export function submitDirForWebsite(website: string, root = './submits'): string {
	return join(root, hostnameFromWebsite(website));
}
