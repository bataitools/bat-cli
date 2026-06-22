import type { MistakeHistoryItem, NodeHistoryItem } from './types';

/**
 * 取两个时间戳中「最早的有效时刻」。
 * 用于合并 firstCompletedAt：忽略 0 / 缺失，避免 Math.min(0, 真实时间) 把首次通关时间冲成 0。
 */
function minPositiveTimestamp(a: number, b: number): number {
	const values = [a, b].filter((t) => t > 0);
	if (values.length === 0) return 0;
	return Math.min(...values);
}

/**
 * 将 nodeHistory 按 nodeId 折叠为「每关一条」的生涯汇总。
 *
 * 调用时机：`applySyncActions` 重放完 book 作用域的全部 op 之后调用一次。
 *
 * 为何需要：
 * - 重放过程中可能对同一 nodeId 多次 push 再合并，或冲突解决时临时出现重复行；
 * - 多端各自产生 op 后合并快照，须保证上限为「已完成的不同 node 数」，而非通关次数条数。
 *
 * 合并规则（同一 nodeId 的两条记录 A、B）：
 * | 字段 | 规则 |
 * | playCount / lifetimeCorrect / totalDurationSec / totalXpEarned | 累加 |
 * | bestAccuracy | 取 max（历次单局正确率的上限） |
 * | firstCompletedAt | 取 min（保留最早首次通关） |
 * | lastCompletedAt | 取 max（保留最近活动，供打卡/排序） |
 * | unitId | 保留已有，缺失时用 incoming 补全 |
 *
 * 返回结果按 lastCompletedAt 升序排序，便于 UI 按时间线展示最近进度。
 */
export function compactNodeHistory(items: NodeHistoryItem[]): NodeHistoryItem[] {
	const map = new Map<string, NodeHistoryItem>();

	for (const incoming of items) {
		if (!incoming?.nodeId) continue;

		const existing = map.get(incoming.nodeId);

		// 首次见到该 nodeId：直接入表
		if (!existing) {
			map.set(incoming.nodeId, { ...incoming });
			continue;
		}

		// 已存在：按上表规则合并为一条
		const playCount = (existing.playCount || 0) + (incoming.playCount || 0);
		const lifetimeCorrect = (existing.lifetimeCorrect || 0) + (incoming.lifetimeCorrect || 0);

		map.set(incoming.nodeId, {
			nodeId: existing.nodeId,
			unitId: existing.unitId || incoming.unitId || '',
			playCount,
			lifetimeCorrect,
			bestAccuracy: Math.max(existing.bestAccuracy || 0, incoming.bestAccuracy || 0),
			totalDurationSec: (existing.totalDurationSec || 0) + (incoming.totalDurationSec || 0),
			totalXpEarned: (existing.totalXpEarned || 0) + (incoming.totalXpEarned || 0),
			firstCompletedAt: minPositiveTimestamp(existing.firstCompletedAt, incoming.firstCompletedAt),
			lastCompletedAt: Math.max(existing.lastCompletedAt || 0, incoming.lastCompletedAt || 0),
		});
	}

	return Array.from(map.values()).sort((a, b) => a.lastCompletedAt - b.lastCompletedAt);
}

/**
 * 将 mistakeHistory 按 questionId 折叠为「每题一条」。
 *
 * 调用时机：与 compactNodeHistory 相同，在 book 快照 apply 结束后调用。
 *
 * 与 nodeHistory 不同：错题合并以「最近一次练习」为准（LWW），而不是纯累加。
 * 多端冲突时，保留 lastAttemptDate 较新的一侧作为主记录（primary），另一侧为 secondary。
 */
export function compactMistakeHistory(items: MistakeHistoryItem[]): MistakeHistoryItem[] {
	const map = new Map<string, MistakeHistoryItem>();

	for (const incoming of items) {
		if (!incoming?.questionId) continue;

		const existing = map.get(incoming.questionId);

		if (!existing) {
			map.set(incoming.questionId, { ...incoming });
			continue;
		}

		// 较新的一次练习作为主记录，承载连对/连错/上次结果等「当前状态」
		const useIncoming = (incoming.lastAttemptDate || 0) >= (existing.lastAttemptDate || 0);
		const primary = useIncoming ? incoming : existing;
		const secondary = useIncoming ? existing : incoming;

		map.set(incoming.questionId, {
			...primary,
			// 累计答错次数取两侧较大值，避免离线各自 +1 后合并时少计
			errorCount: Math.max(existing.errorCount || 0, incoming.errorCount || 0),
			consecutiveWrong: primary.consecutiveWrong ?? secondary.consecutiveWrong ?? 0,
			consecutiveCorrect: primary.consecutiveCorrect ?? secondary.consecutiveCorrect ?? 0,
			lastAttemptResult: primary.lastAttemptResult,
			// state 跟较新一侧走（消灭/重新激活以最近一次为准）
			state: primary.state ?? secondary.state ?? 1,
		});
	}

	return Array.from(map.values());
}
