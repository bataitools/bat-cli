export const DEVELOPER_TYPES = ['company', 'team', 'individual'] as const;

export type DeveloperType = (typeof DEVELOPER_TYPES)[number];

export function normalizeDeveloperType(value: unknown, fallback: DeveloperType = 'company'): DeveloperType {
	const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
	return (DEVELOPER_TYPES as readonly string[]).includes(normalized)
		? (normalized as DeveloperType)
		: fallback;
}

export function isValidDeveloperType(value: unknown): value is DeveloperType {
	if (typeof value !== 'string') return false;
	const normalized = value.trim().toLowerCase();
	return (DEVELOPER_TYPES as readonly string[]).includes(normalized);
}
