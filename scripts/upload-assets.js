#!/usr/bin/env node

/**
 * upload-assets.js
 *
 * 官方推荐的独立资源上传辅助脚本 (ESM 格式)。
 * 用于直接上传 Logo 或 Screenshot 素材到 BAT 平台，避开复杂的客户端大图处理，完美解决签名抖动和 content-type 问题。
 *
 * 使用方法:
 *   bun run scripts/upload-assets.js --type logo|screenshot --file <file-path> --website <website-url> [--env dev|prod]
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

// 1. 解析参数
const args = process.argv.slice(2);
const type = readArg(args, '--type'); // logo 或 screenshot
const filePath = readArg(args, '--file');
const website = readArg(args, '--website');
const env = readArg(args, '--env') || 'prod'; // 默认生产环境

if (!type || !filePath || !website) {
	console.error('❌ 缺失必需参数！');
	console.error(
		'用法: node scripts/upload-assets.js --type logo|screenshot --file <文件路径> --website <网站网址> [--env dev|prod]',
	);
	process.exit(1);
}

if (type !== 'logo' && type !== 'screenshot') {
	console.error('❌ --type 参数只能是 "logo" 或 "screenshot"');
	process.exit(1);
}

if (!fs.existsSync(filePath)) {
	console.error(`❌ 文件不存在: ${filePath}`);
	process.exit(1);
}

// 2. 加载凭证和确定 API 地址
const configDir = path.join(os.homedir(), '.bat-cli');
const credFile = env === 'dev' ? 'credentials-dev.json' : 'credentials.json';
const credPath = path.join(configDir, credFile);
const apiUrl = env === 'dev' ? 'https://api-dev.bataitools.com' : 'https://api.bataitools.com';

if (!fs.existsSync(credPath)) {
	console.error(`❌ 未找到本地登录凭证: ${credPath}`);
	console.error('请先通过 CLI 登录: bat-cli login');
	process.exit(1);
}

let token;
try {
	const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
	token = creds.token;
} catch (e) {
	console.error(`❌ 读取凭证文件失败: ${e.message}`);
	process.exit(1);
}

if (!token) {
	console.error('❌ 凭证中未包含 Token，请重新登录！');
	process.exit(1);
}

// 3. 计算签名
const apiPath = type === 'logo' ? '/bat/agent/upload-logo' : '/bat/agent/upload-screenshot';
const timestamp = Math.floor(Date.now() / 1000);
const qs = new URLSearchParams({ website });
const queryString = qs.toString();

const payload = `POST:${apiPath}:${queryString}`;
const secret = 'bataitools-agent-submit-signature-secret-salt-2026';
const message = `${timestamp}:${payload}`;
const signature = crypto.createHmac('sha256', secret).update(message).digest('hex');

// 4. 确定 MIME 类型
const ext = path.extname(filePath).toLowerCase();
let mimeType = 'application/octet-stream';
if (ext === '.png') mimeType = 'image/png';
else if (ext === '.webp') mimeType = 'image/webp';
else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
else if (ext === '.svg') mimeType = 'image/svg+xml';
else if (ext === '.ico') mimeType = 'image/x-icon';

console.log('----------------------------------------');
console.log(`[Upload] 目标环境: ${env} (${apiUrl})`);
console.log(`[Upload] 资源类型: ${type}`);
console.log(`[Upload] 本地路径: ${filePath}`);
console.log(`[Upload] 关联网站: ${website}`);
console.log(`[Upload] 对应 MIME: ${mimeType}`);
console.log(`[Upload] 时间戳:   ${timestamp}`);
console.log(`[Upload] 签名结果: ${signature}`);
console.log('----------------------------------------');

// 5. 执行上传
async function run() {
	const form = new FormData();
	const buffer = fs.readFileSync(filePath);

	// 转换为 Blob 以设定精确的 MIME，防止 multipart 的 default (application/octet-stream) 被服务器拒绝
	const blob = new Blob([buffer], { type: mimeType });
	form.append('file', blob, path.basename(filePath));

	console.log(`⏳ 正在上传素材到 ${apiUrl}${apiPath} ...`);
	try {
		const res = await fetch(`${apiUrl}${apiPath}?${queryString}`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'x-bat-timestamp': String(timestamp),
				'x-bat-signature': signature,
			},
			body: form,
		});

		const body = await res.json();
		console.log(`[HTTP Status] ${res.status}`);
		console.log('[Response]', JSON.stringify(body, null, 2));

		if (res.ok && body.success && body.data && body.data.path) {
			console.log('\n🎉 上传成功！');
			console.log(`🔗 远程 URL: \x1b[32m${body.data.path}\x1b[0m`);
			console.log('请将此 URL 填入您 base.json 对应的属性中。');
		} else {
			console.error('\n❌ 上传失败！');
			process.exit(1);
		}
	} catch (err) {
		console.error(`\n❌ 网络请求抛错: ${err.message}`);
		process.exit(1);
	}
}

run();

// 辅助参数解析函数
function readArg(args, flag) {
	const idx = args.indexOf(flag);
	if (idx !== -1 && args[idx + 1]) {
		return args[idx + 1];
	}
	return null;
}
