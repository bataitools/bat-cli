import { buildYoutubeThumbnailUrl, buildYoutubeWatchUrl, parseYoutubeVideoId } from './youtube';

export type ProductMediaType = 'video' | 'image';

export interface ProductMediaItem {
	type: ProductMediaType;
	/** image: 图片 URL；video: 视频 URL（支持 YouTube 或普通视频链接） */
	url: string;
	/** 视频缩略图（支持 YouTube 自动提取或普通视频自定义） */
	thumbnail?: string;
	/** YouTube 专属 video ID */
	videoId?: string;
}

export const PRODUCT_MEDIA_MAX_ITEMS = 10;

export function normalizeProductMediaItem(raw: unknown): ProductMediaItem | null {
	if (!raw || typeof raw !== 'object') return null;
	const item = raw as Record<string, unknown>;
	const type = item.type;

	if (type === 'image') {
		const url = typeof item.url === 'string' ? item.url.trim() : '';
		if (!url) return null;
		return { type: 'image', url };
	}

	if (type === 'video') {
		const input = typeof item.url === 'string' ? item.url.trim() : typeof item.videoId === 'string' ? item.videoId.trim() : '';
		if (!input) return null;

		// 尝试解析 YouTube 视频
		const videoId = parseYoutubeVideoId(input);
		if (videoId) {
			return {
				type: 'video',
				url: buildYoutubeWatchUrl(videoId),
				videoId,
				thumbnail: buildYoutubeThumbnailUrl(videoId, 'maxresdefault'),
			};
		}

		// 普通视频
		return {
			type: 'video',
			url: input,
			thumbnail: typeof item.thumbnail === 'string' ? item.thumbnail.trim() : undefined,
		};
	}

	return null;
}

export function normalizeProductMediaList(raw: unknown): ProductMediaItem[] {
	if (!Array.isArray(raw)) return [];
	const result: ProductMediaItem[] = [];
	for (const entry of raw) {
		const normalized = normalizeProductMediaItem(entry);
		if (normalized) result.push(normalized);
		if (result.length >= PRODUCT_MEDIA_MAX_ITEMS) break;
	}
	return result;
}

export function getProductMediaPreviewSrc(item: ProductMediaItem): string | null {
	if (item.type === 'image') return item.url;
	if (item.type === 'video') return item.thumbnail || (item.videoId ? buildYoutubeThumbnailUrl(item.videoId) : null);
	return null;
}
