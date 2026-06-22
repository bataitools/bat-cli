export type YoutubeThumbnailQuality = 'maxresdefault' | 'hqdefault' | 'mqdefault' | 'default';

const YOUTUBE_THUMBNAIL_CHAIN: YoutubeThumbnailQuality[] = [
	'maxresdefault',
	'hqdefault',
	'mqdefault',
	'default',
];

/** 从 YouTube 链接或 11 位 video ID 解析视频 ID */
export function parseYoutubeVideoId(input: string): string | null {
	if (!input || typeof input !== 'string') return null;
	const trimmed = input.trim();
	if (!trimmed) return null;
	if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

	try {
		const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
		const host = url.hostname.replace(/^www\./, '');

		if (host === 'youtu.be') {
			const id = url.pathname.slice(1).split('/')[0];
			return id && id.length === 11 ? id : null;
		}

		if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
			if (url.pathname.startsWith('/embed/')) {
				const id = url.pathname.split('/')[2];
				return id && id.length === 11 ? id : null;
			}
			if (url.pathname.startsWith('/shorts/')) {
				const id = url.pathname.split('/')[2];
				return id && id.length === 11 ? id : null;
			}
			const v = url.searchParams.get('v');
			return v && v.length === 11 ? v : null;
		}
	} catch {
		return null;
	}

	return null;
}

export function buildYoutubeThumbnailUrl(
	videoId: string,
	quality: YoutubeThumbnailQuality = 'maxresdefault',
): string {
	return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

/** 缩略图降级链：优先使用库中记录的地址，再按质量逐级回退 */
export function buildYoutubeThumbnailSources(
	videoId: string,
	storedThumbnail?: string | null,
): string[] {
	const chain = YOUTUBE_THUMBNAIL_CHAIN.map((q) => buildYoutubeThumbnailUrl(videoId, q));
	if (!storedThumbnail) return chain;
	return [storedThumbnail, ...chain.filter((url) => url !== storedThumbnail)];
}

export function buildYoutubeWatchUrl(videoId: string): string {
	return `https://www.youtube.com/watch?v=${videoId}`;
}

export function buildYoutubeEmbedUrl(videoId: string): string {
	return `https://www.youtube-nocookie.com/embed/${videoId}`;
}
