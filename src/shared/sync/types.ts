/** 同步动作作用域：`global` 跨教材全局；`book` 单本教材进度 */
export type SyncScope = 'global' | 'book';

/**
 * 客户端 / 服务端统一的增量动作（写入 `user_actions` 的权威日志条目）。
 * 快照由 `applySyncActions` 重放这些动作物化得到，禁止直接覆盖整包 content。
 */
export interface SyncAction {
	/** 客户端生成的 UUID，幂等键；重复推送同 id 不会二次生效 */
	id: string;
	/** 客户端单调递增逻辑序列号，按 scope 在服务端取 MAX(lsn) */
	lsn: number;
	/** 动作作用域，决定合并进 `UserGlobalRecord` 还是 `BookRecord` */
	scope: SyncScope;
	/** 动作类型，与 payload.type 一致，如 `complete_node`、`deduct_hearts` */
	actionType: string;
	/** 动作参数 JSON，结构因 actionType 而异 */
	payload: Record<string, unknown>;
	/** 客户端产生该动作的毫秒时间戳 */
	clientTime: number;
}

/**
 * 客户端待推送队列项（grammar-mini 持久化在 `progress:user:*:sync` 的 `pendingOps`）。
 * 联网确认后从队列裁剪；UI 展示状态 = apply(已同步基底, pendingOps)。
 */
export interface SyncPendingOp {
	/** 动作作用域 */
	scope: SyncScope;
	/** 动作参数，须含 `type` 字段便于调试与 apply 分发 */
	payload: Record<string, unknown>;
	/** 客户端产生该动作的毫秒时间戳 */
	at: number;
	/** 推送前分配的 LSN，与 SyncAction.lsn 对齐 */
	lsn?: number;
	/** 推送前分配的 UUID，与 SyncAction.id 对齐 */
	id?: string;
}

/** 非 Pro 用户体力上限（与产品规则一致） */
export const SYNC_MAX_HEARTS = 25;

/**
 * 单个关卡（Node）的生涯汇总。
 * 同一 `nodeId` 在 `nodeHistory` 数组中仅保留一条；重复刷关通过就地累加/取极值更新，不是每次通关一条流水。
 * 单次通关的明细（当次 correct/total 等）在 `complete_node` 的 op payload 中，不在此结构重复存流水。
 */
export interface NodeHistoryItem {
	/** 关卡全局唯一 ID，通常形如 `s0_u0_n2`（阶段_单元_节点） */
	nodeId: string;
	/** 所属单元 ID 快照（如 `s0_u0`），可从 nodeId 解析，仅存一份便于按单元筛选 */
	unitId?: string;
	/** 累计完整通关该关的次数；每结算一次 `complete_node` +1，用于判断是否复习关 */
	playCount: number;
	/** 历次通关中「答对题数」的累加和（不是某一局的题目总数） */
	lifetimeCorrect: number;
	/** 历次通关中单局正确率（correct/total）的历史最大值，0~1，保留两位小数语义 */
	bestAccuracy: number;
	/** 历次通关消耗时长的累加和，单位：秒 */
	totalDurationSec: number;
	/** 历次通关获得 XP 的累加和（含倍率后的最终值） */
	totalXpEarned: number;
	/** 首次完整通关该关的 Unix 时间戳（毫秒）；复习不会改写 */
	firstCompletedAt: number;
	/** 最近一次完整通关该关的 Unix 时间戳（毫秒）；打卡、今日关数等用此字段 */
	lastCompletedAt: number;
}

/** 错题已消灭：保留统计，错题本 / 进度页不展示 */
export const MISTAKE_STATE_MASTERED = 0 as const;
/** 错题待消灭：错题本展示，可进入消灭练习 */
export const MISTAKE_STATE_ACTIVE = 1 as const;

export type MistakeState = typeof MISTAKE_STATE_MASTERED | typeof MISTAKE_STATE_ACTIVE;

/**
 * 错题本中单题的汇总（按 `questionId` compact，非每次作答一条）。
 */
export interface MistakeHistoryItem {
	/** 题目全局唯一 ID */
	questionId: string;
	/** 历史遗留字段名；实际存的是题目所属 unitId（如 `s0_u0`），不是 stageId */
	stageId: string;
	/** 该题累计答错次数 */
	errorCount: number;
	/** 当前连续答错次数（答对后归零） */
	consecutiveWrong: number;
	/** 当前连续答对次数（答错后归零；用于判定是否消灭） */
	consecutiveCorrect: number;
	/** 最近一次练习该题的 Unix 时间戳（毫秒） */
	lastAttemptDate: number;
	/** 最近一次练习结果：`0` 错，`1` 对 */
	lastAttemptResult: 0 | 1;
	/**
	 * 错题本展示与消灭状态（数字省空间，替代原 status 字符串 + displayMistake）：
	 * `1`（MISTAKE_STATE_ACTIVE）待消灭；`0`（MISTAKE_STATE_MASTERED）已消灭。
	 */
	state: MistakeState;
}

/**
 * 用户跨教材的全局进度快照（本地键 `U_{userId}`，服务端 `user_sync_states`）。
 */
export interface UserGlobalRecord {
	/** 用户 ID；游客为 `guest` */
	userId: string;
	/** 历史累计获得的总 XP（只增不减） */
	totalXp: number;
	/** 当前可用于消费（如兑换体力）的 XP */
	availableXp: number;
	/** 最近一次结算获得的 XP 数值 */
	lastEarnedXp: number;
	/** 最近一次获得 XP 的 Unix 时间戳（毫秒） */
	lastEarnedAt: number;
	/** 当前生效的经验倍率，默认 `1` */
	boostMultiplier: number;
	/** 倍率过期时间的 Unix 时间戳（毫秒）；过期后倍率重置为 1 */
	boostExpiresAt: number;
	/** 连续打卡天数 */
	streakDays: number;
	/** 上次计入打卡的日期，格式 `YYYYMMDD`（如 `20260530`） */
	lastStreakDate: number;
	/** 当前体力值，0 ~ SYNC_MAX_HEARTS */
	hearts: number;
	/** 上次体力变更或校准基准时间的 Unix 时间戳（毫秒） */
	lastHeartsUpdatedAt: number;
	/** 当前正在学习的教材 ID；未选课可为 `null` */
	activeBookId: string | null;
	/** 已解锁 / 已加入学习的教材 ID 列表 */
	enrolledBookIds?: string[];
	/** 该全局记录最近一次被更新的 Unix 时间戳（毫秒） */
	updatedAt: number;
}

/**
 * 单本教材的学习进度快照（本地键 `B_{userId}_{bookId}`，服务端 `user_book_sync_states`）。
 * 路径「下一关」由 `nodeHistory` 推导，不单独存 lastNodeId 指针字段。
 */
export interface BookRecord {
	/** 用户 ID */
	userId: string;
	/** 教材 ID */
	bookId: string;
	/** 当前通关轮次；用户重置整书进度时 +1，默认 `1` */
	attemptNumber?: number;
	/** 是否活跃：`1` 活跃，`0` 归档（多书切换场景） */
	isActive?: number;
	/** 教材名称缓存，断网时渲染路径标题 */
	bookName?: string;
	/** 各关卡生涯汇总列表，按 nodeId compact */
	nodeHistory: NodeHistoryItem[];
	/** 错题本汇总列表，按 questionId compact */
	mistakeHistory: MistakeHistoryItem[];
	/** 是否已通关该教材（大纲节点均被 nodeHistory 覆盖） */
	isCompleted: boolean;
	/** 该书记录最近一次被更新的 Unix 时间戳（毫秒） */
	updatedAt: number;
}
