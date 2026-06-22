import type { AgentSubmitBundle } from './agent-submit-validation';
import { isRemoteAgentAssetUrl } from './agent-local-assets';

export {
	AGENT_LOCAL_LOGO_FILENAME,
	AGENT_LOCAL_WEBSITE_SCREENSHOT_FILENAME,
	isRemoteAgentAssetUrl,
	isRemoteWebsiteScreenshotUrl,
} from './agent-local-assets';

/** 解析产品 logo 远程 URL（仅 http/https；本地 logo.webp 不算） */
export function resolveRemoteLogo(bundle: Pick<AgentSubmitBundle, 'logo'>): string {
	if (typeof bundle.logo !== 'string') return '';
	const trimmed = bundle.logo.trim();
	return isRemoteAgentAssetUrl(trimmed) ? trimmed : '';
}

/** 解析产品官网截图 URL（全语言共用一张；仅返回远程 URL，不含本地文件） */
export function resolveWebsiteScreenshot(
	bundle: Pick<AgentSubmitBundle, 'websiteScreenshot'>,
): string {
	if (typeof bundle.websiteScreenshot !== 'string') return '';
	const trimmed = bundle.websiteScreenshot.trim();
	return isRemoteAgentAssetUrl(trimmed) ? trimmed : '';
}

/** @deprecated 使用 resolveWebsiteScreenshot；lang 参数已忽略，全语言共用 websiteScreenshot */
export function resolveScreenshotForLang(
	bundle: Pick<AgentSubmitBundle, 'websiteScreenshot'>,
	_lang: string,
): string {
	return resolveWebsiteScreenshot(bundle);
}
