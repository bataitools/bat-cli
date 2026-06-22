/** 进度同步 API（canonical，仅批量）。单 scope 用长度为 1 的数组。 */
export const SYNC_API_PATHS = {
	/** 上传增量 ops（`records[]`，1～N 个 scope） */
	pushOpsBatch: '/sync/ops/push-batch',
	/** 拉取物化快照（`requests[]`，1～N 个 scope） */
	pullSnapshotsBatch: '/sync/snapshot/pull-batch',
} as const;
