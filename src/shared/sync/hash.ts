/** 不参与 contentHash 的元数据字段 */
const HASH_EXCLUDED_KEYS = new Set([
	'signature',
	'contentHash',
	'content_hash',
	'lastSyncedContentHash',
	'serverContentHash',
	'revision',
	'dirty',
	'pendingOps',
	'lastSyncTime',
	'updatedAt',
	'updated_at',
	'lastEarnedXp',
	'lastEarnedAt',
	'boostMultiplier',
	'boostExpiresAt',
	'bookName',
	'lastStageId',
	'lastUnitId',
	'lastNodeId',
]);

export function stableNormalize(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(stableNormalize);
	}
	if (value && typeof value === 'object') {
		const normalized: Record<string, unknown> = {};
		Object.keys(value as Record<string, unknown>)
			.sort()
			.forEach((key) => {
				normalized[key] = stableNormalize((value as Record<string, unknown>)[key]);
			});
		return normalized;
	}
	return value;
}

export function stripSyncMetaFields<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
	const rest: Record<string, unknown> = {};
	for (const [key, val] of Object.entries(data)) {
		if (!HASH_EXCLUDED_KEYS.has(key)) {
			rest[key] = val;
		}
	}
	return rest;
}

export function stableSerializeForHash(data: Record<string, unknown>): string {
	return JSON.stringify(stableNormalize(stripSyncMetaFields(data)));
}
