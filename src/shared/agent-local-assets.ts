/** Agent 提交目录内本地 logo 文件名（与 base.json 同级，对齐 bat-crawl 256×256 webp） */
export const AGENT_LOCAL_LOGO_FILENAME = 'logo.webp';

/** Agent 提交目录内本地官网截图文件名（与 base.json 同级） */
export const AGENT_LOCAL_WEBSITE_SCREENSHOT_FILENAME = 'website-screenshot.webp';

/** 是否为已上传或可直链的远程资源 URL（http/https） */
export function isRemoteAgentAssetUrl(value: string): boolean {
	const trimmed = value.trim();
	if (!trimmed) return false;
	return /^(https?:)?\/\//i.test(trimmed);
}

/** @deprecated 使用 isRemoteAgentAssetUrl */
export const isRemoteWebsiteScreenshotUrl = isRemoteAgentAssetUrl;
