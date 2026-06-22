/**
 * 同步快照物化：在「已与服务端对齐的基底」上按序重放增量动作，得到 UI 用的 working 状态。
 *
 * 三端（grammar-mini / grammar-worker / 其它消费者）必须只使用本模块合并，禁止各自实现 nodeHistory 逻辑。
 * 重放结束后对 book 作用域调用 compact.ts，保证 nodeHistory / mistakeHistory 按主键折叠。
 */
import { compactMistakeHistory, compactNodeHistory } from './compact';
import {
	SYNC_MAX_HEARTS,
	type BookRecord,
	type MistakeHistoryItem,
	type SyncAction,
	type SyncPendingOp,
	type SyncScope,
	type UserGlobalRecord,
	MISTAKE_STATE_ACTIVE,
	MISTAKE_STATE_MASTERED,
} from './types';

/** 从 SyncAction 或 PendingOp 解析动作类型（优先 actionType，否则 payload.type） */
function actionTypeOf(action: SyncAction | SyncPendingOp): string {
	if ('actionType' in action && action.actionType) {
		return action.actionType;
	}
	const payload = action.payload as Record<string, unknown>;
	return String(payload.type || '');
}

/** 解析动作时间：SyncAction 用 clientTime，PendingOp 用 at */
function clientTimeOf(action: SyncAction | SyncPendingOp): number {
	if ('clientTime' in action && action.clientTime) {
		return action.clientTime;
	}
	if ('at' in action && action.at) {
		return action.at;
	}
	return Date.now();
}

/**
 * 按 LSN 升序重放；LSN 相同时按客户端时间排序。
 * 保证离线多条 op 合并后与线上一致（与 user_actions 插入顺序对齐）。
 */
function sortActions<T extends SyncAction | SyncPendingOp>(actions: T[]): T[] {
	return [...actions].sort((left, right) => {
		const lLsn = ('lsn' in left && left.lsn) || 0;
		const rLsn = ('lsn' in right && right.lsn) || 0;
		if (lLsn !== rLsn) return lLsn - rLsn;
		return clientTimeOf(left) - clientTimeOf(right);
	});
}

/**
 * 将一条 global 作用域的动作合并进 UserGlobalRecord 累加器（就地修改）。
 */
function applyGlobalAction(accumulator: UserGlobalRecord, action: SyncAction | SyncPendingOp): void {
	const payload = action.payload as Record<string, unknown>;
	const at = clientTimeOf(action);
	const type = actionTypeOf(action);

	switch (type) {
		case 'earn_xp': {
			// 仅当 lastEarnedAt 比已有更新时才入账，避免旧 op 重放重复加 XP
			const lastEarnedAt = Number(payload.lastEarnedAt || 0);
			if (lastEarnedAt > (accumulator.lastEarnedAt || 0)) {
				const xp = Number(payload.xp || 0);
				accumulator.totalXp = (accumulator.totalXp || 0) + xp;
				accumulator.availableXp = (accumulator.availableXp || 0) + xp;
				accumulator.lastEarnedXp = xp;
				accumulator.lastEarnedAt = lastEarnedAt;
			}
			break;
		}
		case 'deduct_hearts': {
			const amount = Number(payload.amount || 0);
			accumulator.hearts = Math.max(0, (accumulator.hearts ?? SYNC_MAX_HEARTS) - amount);
			accumulator.lastHeartsUpdatedAt = Math.max(accumulator.lastHeartsUpdatedAt || 0, Number(payload.lastHeartsUpdatedAt || at));
			break;
		}
		case 'replenish_hearts': {
			const cost = Number(payload.xpCost ?? 100);
			if ((accumulator.availableXp || 0) >= cost) {
				accumulator.availableXp = (accumulator.availableXp || 0) - cost;
				accumulator.hearts = SYNC_MAX_HEARTS;
				accumulator.lastHeartsUpdatedAt = Math.max(accumulator.lastHeartsUpdatedAt || 0, Number(payload.lastHeartsUpdatedAt || at));
			}
			break;
		}
		case 'enroll_book': {
			const bookId = String(payload.bookId || '');
			const list = Array.isArray(accumulator.enrolledBookIds) ? [...accumulator.enrolledBookIds] : [];
			if (bookId && !list.includes(bookId)) {
				list.push(bookId);
			}
			accumulator.enrolledBookIds = list;
			accumulator.activeBookId = bookId || accumulator.activeBookId;
			break;
		}
		case 'unenroll_book': {
			const bookId = String(payload.bookId || '');
			if (Array.isArray(accumulator.enrolledBookIds)) {
				accumulator.enrolledBookIds = accumulator.enrolledBookIds.filter((id) => id !== bookId);
				if (accumulator.activeBookId === bookId) {
					accumulator.activeBookId = accumulator.enrolledBookIds[0] || null;
				}
			}
			break;
		}
		case 'switch_book': {
			accumulator.activeBookId = String(payload.bookId || '') || null;
			break;
		}
		case 'bootstrap_state': {
			// 仅迁移：一次性用客户端整包 global 覆盖（guest → 登录）
			const state = payload.state as Record<string, unknown> | undefined;
			if (state && typeof state === 'object') {
				Object.assign(accumulator, state);
			}
			break;
		}
		case 'complete_node': {
			// global 侧的 complete_node：XP / 体力 / 连击 + 隐式选课（bookId 未 enroll 时加入列表）
			const earnedXp = Number(payload.earnedXp || 0);
			const eventAt = Number(payload.at || at);
			const bookId = String(payload.bookId || '');
			if (bookId) {
				const list = Array.isArray(accumulator.enrolledBookIds) ? [...accumulator.enrolledBookIds] : [];
				if (!list.includes(bookId)) {
					list.push(bookId);
				}
				accumulator.enrolledBookIds = list;
				if (!accumulator.activeBookId) {
					accumulator.activeBookId = bookId;
				}
			}
			if (eventAt > (accumulator.lastEarnedAt || 0)) {
				accumulator.totalXp = (accumulator.totalXp || 0) + earnedXp;
				accumulator.availableXp = (accumulator.availableXp || 0) + earnedXp;
				accumulator.lastEarnedXp = earnedXp;
				accumulator.lastEarnedAt = eventAt;
			}
			if (payload.streakDays !== undefined) {
				accumulator.streakDays = Number(payload.streakDays);
			}
			if (payload.lastStreakDate !== undefined) {
				accumulator.lastStreakDate = Number(payload.lastStreakDate);
			}
			if (payload.hearts !== undefined) {
				accumulator.hearts = Math.min(SYNC_MAX_HEARTS, Number(payload.hearts));
				accumulator.lastHeartsUpdatedAt = Math.max(accumulator.lastHeartsUpdatedAt || 0, eventAt);
			}
			break;
		}
		default:
			break;
	}

	accumulator.updatedAt = Math.max(accumulator.updatedAt || 0, Number(payload.updatedAt || at));
}

/** 在 mistakeHistory 中插入或更新一题（供 complete_node / add_mistake 复用） */
function upsertMistake(history: MistakeHistoryItem[], incoming: Partial<MistakeHistoryItem> & { questionId: string }): void {
	let item = history.find((m) => m.questionId === incoming.questionId);
	if (!item) {
		item = {
			questionId: incoming.questionId,
			stageId: incoming.stageId || '',
			errorCount: 0,
			consecutiveWrong: 0,
			consecutiveCorrect: 0,
			lastAttemptDate: incoming.lastAttemptDate || 0,
			lastAttemptResult: incoming.lastAttemptResult ?? 0,
			state: incoming.state ?? MISTAKE_STATE_ACTIVE,
		};
		history.push(item);
	}
	if (incoming.stageId) item.stageId = incoming.stageId;
	if (incoming.errorCount !== undefined) item.errorCount = incoming.errorCount;
	if (incoming.consecutiveWrong !== undefined) item.consecutiveWrong = incoming.consecutiveWrong;
	if (incoming.consecutiveCorrect !== undefined) item.consecutiveCorrect = incoming.consecutiveCorrect;
	if (incoming.lastAttemptDate !== undefined) item.lastAttemptDate = incoming.lastAttemptDate;
	if (incoming.lastAttemptResult !== undefined) item.lastAttemptResult = incoming.lastAttemptResult;
	if (incoming.state !== undefined) item.state = incoming.state;
}

/**
 * 将一条 book 作用域的动作合并进 BookRecord 累加器（就地修改）。
 * payload.bookId 与 accumulator.bookId 不一致时直接忽略（防止串书）。
 */
function applyBookAction(accumulator: BookRecord, action: SyncAction | SyncPendingOp): void {
	const payload = action.payload as Record<string, unknown>;
	const at = clientTimeOf(action);
	const type = actionTypeOf(action);
	const bookId = String(payload.bookId || accumulator.bookId);

	if (bookId !== accumulator.bookId) {
		return;
	}

	switch (type) {
		case 'bootstrap_state': {
			const state = payload.state as Record<string, unknown> | undefined;
			if (state && typeof state === 'object') {
				Object.assign(accumulator, state);
				if (Array.isArray(state.nodeHistory)) {
					accumulator.nodeHistory = state.nodeHistory as BookRecord['nodeHistory'];
				}
				if (Array.isArray(state.mistakeHistory)) {
					accumulator.mistakeHistory = state.mistakeHistory as BookRecord['mistakeHistory'];
				}
			}
			break;
		}
		case 'complete_node': {
			// --- 1. nodeHistory：按 nodeId 就地更新生涯汇总（重放结束后再 compact 兜底） ---
			const nodeId = String(payload.nodeId || '');
			const unitId = String(payload.unitId || '');
			const correct = Number(payload.correct || 0);
			const total = Number(payload.total || 0);
			const earnedXp = Number(payload.earnedXp || 0);
			const duration = Number(payload.duration || 0);
			const accuracy = total > 0 ? Number((correct / total).toFixed(2)) : 0;
			const eventAt = Number(payload.at || at);

			let existing = accumulator.nodeHistory.find((h) => h.nodeId === nodeId);
			if (existing) {
				// 复习：累加次数/答对数/时长/XP，正确率取历史 max，只推进 lastCompletedAt
				existing.playCount = (existing.playCount || 1) + 1;
				existing.lifetimeCorrect = (existing.lifetimeCorrect || 0) + correct;
				existing.bestAccuracy = Math.max(existing.bestAccuracy || 0, accuracy);
				existing.totalXpEarned = (existing.totalXpEarned || 0) + earnedXp;
				existing.totalDurationSec = (existing.totalDurationSec || 0) + duration;
				existing.lastCompletedAt = eventAt;
				if (!existing.unitId) existing.unitId = unitId;
			} else {
				// 首通：first / last 同为本次 eventAt
				accumulator.nodeHistory.push({
					nodeId,
					unitId,
					playCount: 1,
					lifetimeCorrect: correct,
					bestAccuracy: accuracy,
					totalDurationSec: duration,
					totalXpEarned: earnedXp,
					firstCompletedAt: eventAt,
					lastCompletedAt: eventAt,
				});
			}

			// --- 2. mistakeHistory：本局错题写入 / 连对消灭 ---
			const errors = Array.isArray(payload.errors) ? (payload.errors as string[]) : [];
			const stageId = String(payload.stageId || '');
			if (!stageId) {
				throw new Error('[SyncApply] Missing stageId in complete_node payload');
			}
			errors.forEach((qId) => {
				const item = accumulator.mistakeHistory.find((m) => m.questionId === qId);
				if (item) {
					item.errorCount += 1;
					item.consecutiveWrong += 1;
					item.consecutiveCorrect = 0;
					item.lastAttemptDate = eventAt;
					item.lastAttemptResult = 0;
					item.state = MISTAKE_STATE_ACTIVE;
					if (stageId) item.stageId = stageId;
				} else {
					upsertMistake(accumulator.mistakeHistory, {
						questionId: qId,
						stageId: stageId,
						errorCount: 1,
						consecutiveWrong: 1,
						consecutiveCorrect: 0,
						lastAttemptDate: eventAt,
						lastAttemptResult: 0,
						state: MISTAKE_STATE_ACTIVE,
					});
				}
			});

			const errorSet = new Set(errors);
			const correctIds = Array.isArray(payload.correctIds) ? (payload.correctIds as string[]) : [];
			correctIds.forEach((qId) => {
				if (errorSet.has(qId)) return;
				const item = accumulator.mistakeHistory.find((m) => m.questionId === qId);
				if (item && item.state === MISTAKE_STATE_ACTIVE) {
					item.consecutiveCorrect += 1;
					item.lastAttemptDate = eventAt;
					item.lastAttemptResult = 1;
					item.state = MISTAKE_STATE_MASTERED;
				}
			});

			if (payload.isCompleted === true) {
				accumulator.isCompleted = true;
			}
			break;
		}
		case 'add_mistake': {
			const questionId = String(payload.questionId || '');
			const item = accumulator.mistakeHistory.find((m) => m.questionId === questionId);
			const stageId = String(payload.stageId || '');
			if (!stageId) {
				throw new Error('[SyncApply] Missing stageId in add_mistake payload');
			}
			if (item) {
				item.errorCount += 1;
				item.consecutiveWrong += 1;
				item.consecutiveCorrect = 0;
				item.lastAttemptDate = at;
				item.lastAttemptResult = 0;
				item.state = MISTAKE_STATE_ACTIVE;
				if (stageId) item.stageId = stageId;
			} else {
				upsertMistake(accumulator.mistakeHistory, {
					questionId,
					stageId: stageId,
					errorCount: 1,
					consecutiveWrong: 1,
					consecutiveCorrect: 0,
					lastAttemptDate: at,
					lastAttemptResult: 0,
					state: MISTAKE_STATE_ACTIVE,
				});
			}
			break;
		}
		case 'remove_mistake': {
			const questionId = String(payload.questionId || '');
			accumulator.mistakeHistory = accumulator.mistakeHistory.filter((m) => m.questionId !== questionId);
			break;
		}
		case 'reset_book_progress': {
			accumulator.nodeHistory = [];
			accumulator.mistakeHistory = [];
			accumulator.isCompleted = false;
			accumulator.attemptNumber = (accumulator.attemptNumber || 1) + 1;
			break;
		}
		default:
			break;
	}

	accumulator.updatedAt = Math.max(accumulator.updatedAt || 0, Number(payload.updatedAt || at));
}

/**
 * 在已同步基底上重放动作队列，得到当前工作快照（客户端 UI / 服务端物化快照均走此入口）。
 *
 * @param base 上次 push 确认的服务端内容，或本地 U_* / B_* 基底
 * @param actions 待重放的 SyncAction 或 pendingOps（会先按 scope 过滤）
 * @param scope `'global'` 或 `'book'`
 */
export function applySyncActions<T extends UserGlobalRecord | BookRecord>(
	base: T,
	actions: Array<SyncAction | SyncPendingOp>,
	scope: SyncScope,
): T {
	const scoped = sortActions(actions.filter((action) => action.scope === scope));

	if (scope === 'global') {
		const accumulator = { ...base } as UserGlobalRecord;
		for (const action of scoped) {
			applyGlobalAction(accumulator, action);
		}
		return accumulator as T;
	}

	// book：浅拷贝数组，避免重放污染入参；重放后 compact 折叠重复 nodeId / questionId
	const accumulator = {
		...(base as BookRecord),
		nodeHistory: [...((base as BookRecord).nodeHistory || [])],
		mistakeHistory: [...((base as BookRecord).mistakeHistory || [])],
	} as BookRecord;

	for (const action of scoped) {
		applyBookAction(accumulator, action);
	}

	accumulator.nodeHistory = compactNodeHistory(accumulator.nodeHistory);
	accumulator.mistakeHistory = compactMistakeHistory(accumulator.mistakeHistory);
	return accumulator as T;
}

/** 将客户端 PendingOp 转为推送用 SyncAction（补全 id / lsn / actionType / clientTime） */
export function pendingOpToSyncAction(op: SyncPendingOp): SyncAction {
	const payload = op.payload as Record<string, unknown>;
	return {
		id: op.id || '',
		lsn: op.lsn || 0,
		scope: op.scope,
		actionType: String(payload.type || ''),
		payload,
		clientTime: op.at,
	};
}

export function pendingOpsToSyncActions(ops: SyncPendingOp[]): SyncAction[] {
	return ops.map(pendingOpToSyncAction);
}
