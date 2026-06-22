/**
 * 根据首字母（s、u 或 n）和现有的 ID 列表生成下一个可用的 ID
 * @param existingIds 已有的 ID 列表
 * @param prefix 未使用，保留做签名兼容
 * @param delimiter 拼接的定界符，用来推导首字母（_s -> s, _u -> u, _n -> n）
 * @param maxLimit 最大生成个数限制，默认 36
 */
export function generateNextId(existingIds: string[], prefix: string, delimiter: '_s' | '_u' | '_n', maxLimit: number = 36): string {
	const prefixLetter = delimiter.substring(1) as 's' | 'u' | 'n';
	const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
	const usedSuffixes = new Set<string>();

	for (const id of existingIds) {
		if (!id || id.length < 2) continue;
		const parts = id.split('_');
		const lastPart = parts[parts.length - 1];
		if (lastPart && lastPart.startsWith(prefixLetter)) {
			const suffix = lastPart.slice(1);
			if (suffix.length === 1 && chars.includes(suffix)) {
				usedSuffixes.add(suffix);
			}
		}
	}

	if (usedSuffixes.size >= maxLimit) {
		throw new Error(`当前层级下最多只允许 ${maxLimit} 个子项`);
	}

	// 按顺序寻找第一个未使用的后缀字符
	for (let i = 0; i < chars.length; i++) {
		const char = chars[i];
		if (!usedSuffixes.has(char)) {
			if (prefixLetter === 's' || !prefix) {
				return `${prefixLetter}${char}`;
			} else {
				return `${prefix}_${prefixLetter}${char}`;
			}
		}
	}

	throw new Error('未找到可用的后缀字符');
}

/**
 * 智能分配下一个符合规则的 Stage ID
 */
export function generateNextStageId(existingStageIds: string[], bookId: string): string {
	return generateNextId(existingStageIds, bookId, '_s');
}

/**
 * 智能分配下一个符合规则的 Unit ID
 */
export function generateNextUnitId(existingUnitIds: string[], stageId: string): string {
	return generateNextId(existingUnitIds, stageId, '_u');
}

/**
 * 智能分配下一个符合规则的 Node ID
 */
export function generateNextNodeId(existingNodeIds: string[], unitId: string): string {
	return generateNextId(existingNodeIds, unitId, '_n');
}

/**
 * 将 ID (如 s1_u1_n1) 解析为各个层级的短 ID (stageId, unitId, nodeId)
 */
export function parseNodeId(id: string) {
	if (!id) {
		return {
			stageId: undefined,
			unitId: undefined,
			nodeId: undefined,
		};
	}

	// 如果是错题本，直接返回自身为 nodeId
	if (id.startsWith('mistake')) {
		return {
			stageId: undefined,
			unitId: undefined,
			nodeId: id,
		};
	}

	const parts = id.split('_');
	const stageId = parts[0] || undefined;
	const unitId = parts.length > 1 ? `${parts[0]}_${parts[1]}` : undefined;
	const nodeId = parts.length > 2 ? id : undefined;

	return {
		stageId,
		unitId,
		nodeId,
	};
}
