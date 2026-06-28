import { calculateAgentSubmitSignature } from './shared';

/** Agent API 请求签名（与 bat-worker agent/routes 中间件一致） */
export async function signAgentRequest(
	method: string,
	path: string,
	bodyOrQuery = '',
): Promise<Record<string, string>> {
	const timestamp = Math.floor(Date.now() / 1000);
	const payload = `${method}:${path}:${bodyOrQuery}`;
	const signature = await calculateAgentSubmitSignature(payload, timestamp);
	return {
		'x-bat-timestamp': String(timestamp),
		'x-bat-signature': signature,
	};
}
