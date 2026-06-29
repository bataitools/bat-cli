import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { calculateAgentSubmitSignature } from '../src/shared';

// 测试配置常量，方便切换不同的测试数据
const TEST_DOMAIN = 'imagetostl.me';
const SAMPLE_DIR = resolve(import.meta.dirname, `../samples/${TEST_DOMAIN}`);
const EXPECTED_WEBSITE = 'https://imagetostl.me';
const MOCK_STATIC_BASE = 'https://static.bataitools.com';

describe('BAT CLI E2E Tests', () => {
	const tempHome = join(tmpdir(), `bat-cli-e2e-home-${Date.now()}`);
	let mockServer: any;

	beforeAll(() => {
		// 启动本地 Mock API 服务
		mockServer = Bun.serve({
			port: 6665,
			async fetch(req) {
				const url = new URL(req.url);

				// 统一校验客户端算出来的签名
				const timestampHeader = req.headers.get('x-bat-timestamp');
				const signatureHeader = req.headers.get('x-bat-signature');
				if (!timestampHeader || !signatureHeader) {
					return Response.json(
						{ success: false, errorMsg: `Missing signature headers on ${url.pathname}` },
						{ status: 400 },
					);
				}
				const timestamp = parseInt(timestampHeader, 10);
				const now = Math.floor(Date.now() / 1000);
				if (Math.abs(now - timestamp) > 300) {
					return Response.json({ success: false, errorMsg: 'Signature expired' }, { status: 400 });
				}
				let bodyOrQuery = '';
				const method = req.method;
				const contentType = req.headers.get('Content-Type') || '';
				if (method === 'POST') {
					if (contentType.includes('multipart/form-data')) {
						bodyOrQuery = url.search.startsWith('?') ? url.search.slice(1) : '';
					} else {
						const cloned = req.clone();
						bodyOrQuery = await cloned.text();
					}
				} else if (method === 'GET') {
					bodyOrQuery = url.search.startsWith('?') ? url.search.slice(1) : '';
				}
				const expectedSignature = await calculateAgentSubmitSignature(
					`${method}:${url.pathname}:${bodyOrQuery}`,
					timestamp,
				);
				if (signatureHeader !== expectedSignature) {
					console.error(
						`Signature mismatch detailed debugging info:\n` +
							`  Method: ${method}\n` +
							`  Pathname: ${url.pathname}\n` +
							`  BodyOrQuery: "${bodyOrQuery}"\n` +
							`  Timestamp: ${timestamp}\n` +
							`  Received signatureHeader: "${signatureHeader}"\n` +
							`  Expected signature: "${expectedSignature}"\n` +
							`  Payload string used: "${method}:${url.pathname}:${bodyOrQuery}"`,
					);
					return Response.json(
						{
							success: false,
							errorMsg: `Signature verification failed. Path: ${url.pathname}, Method: ${method}`,
						},
						{ status: 400 },
					);
				}

				if (url.pathname === '/bat/agent/auto-login' && req.method === 'POST') {
					return Response.json({
						success: true,
						data: {
							key: 'mock-guest-token',
							prefix: 'bat-',
							createdAt: new Date().toISOString(),
							lastUsedAt: null,
							userId: 999,
							accountType: 'guest',
						},
					});
				}
				if (url.pathname === '/bat/agent/schema' && req.method === 'GET') {
					return Response.json({
						success: true,
						data: {
							staticBase: MOCK_STATIC_BASE,
							categorys: [{ id: 'ai-3d-generator', code: 'ai-3d-generator', name: 'AI 3D Generator' }],
							tags: [{ id: 'freemium', code: 'freemium', name: 'Freemium' }],
							audiences: [{ id: 'developers', code: 'developers', name: 'Developers' }],
						},
					});
				}
				if (url.pathname === '/bat/agent/upload-logo' && req.method === 'POST') {
					const website = url.searchParams.get('website') ?? EXPECTED_WEBSITE;
					return Response.json({
						success: true,
						data: {
							path: `${MOCK_STATIC_BASE}/upload/toos/logo/imagetostl.me/mock.webp`,
							website,
						},
					});
				}
				if (url.pathname === '/bat/agent/upload-screenshot' && req.method === 'POST') {
					const website = url.searchParams.get('website') ?? EXPECTED_WEBSITE;
					return Response.json({
						success: true,
						data: {
							path: `${MOCK_STATIC_BASE}/upload/toos/screenshot/imagetostl.me/mock.webp`,
							website,
						},
					});
				}
				if (url.pathname === '/bat/agent/submit' && req.method === 'POST') {
					return Response.json({
						success: true,
						data: {
							submitId: 888,
							mode: 'new',
							previewUrl: 'http://localhost:6661/tools/mock-preview',
							status: 1,
						},
					});
				}
				if (url.pathname === '/bat/agent/list' && req.method === 'GET') {
					return Response.json({
						success: true,
						data: [
							{
								submitId: 888,
								name: 'imagetostl',
								website: EXPECTED_WEBSITE,
								status: 1,
								statusLabel: 'pending',
								createdAt: '2026-06-23',
							},
						],
					});
				}
				return Response.json({ success: false, errorMsg: 'Not found' }, { status: 404 });
			},
		});

		// 确保临时沙箱 HOME 存在
		mkdirSync(tempHome, { recursive: true });
	});

	afterAll(() => {
		if (mockServer) {
			mockServer.stop();
		}
		if (existsSync(tempHome)) {
			rmSync(tempHome, { recursive: true, force: true });
		}
	});

	async function runCli(args: string[]) {
		const proc = Bun.spawn({
			cmd: ['bun', 'run', resolve(import.meta.dirname, '../src/cli.ts'), ...args],
			env: {
				...process.env,
				HOME: tempHome,
				USERPROFILE: tempHome,
				BAT_API_URL: 'http://localhost:6665',
				BAT_ENV: 'test',
			},
			stdout: 'pipe',
			stderr: 'pipe',
		});

		const exitCode = await proc.exited;
		const stdout = await new Response(proc.stdout).text();
		const stderr = await new Response(proc.stderr).text();

		return {
			success: exitCode === 0,
			exitCode,
			stdout,
			stderr,
		};
	}

	it('should display help message', async () => {
		const proc = await runCli(['help']);
		expect(proc.success).toBe(true);
		const stdout = proc.stdout;
		expect(stdout).toContain('Commands:');
		expect(stdout).toContain('login');
		expect(stdout).toContain('submit');
	});

	it('should perform guest login successfully', async () => {
		const proc = await runCli(['login', 'guest']);
		expect(proc.success).toBe(true);

		const credPath = join(tempHome, '.bat-cli/credentials-dev.json');
		expect(existsSync(credPath)).toBe(true);
		const creds = JSON.parse(readFileSync(credPath, 'utf-8'));
		expect(creds.token).toBe('mock-guest-token');
	});

	it('should reject login when already logged in', async () => {
		const proc = await runCli(['login', 'guest']);
		expect(proc.success).toBe(false);
		expect(proc.stderr).toContain('Already logged in');
		expect(proc.stderr).toContain('logout');
	});

	it('should logout and allow login again', async () => {
		const logoutProc = await runCli(['logout']);
		expect(logoutProc.success).toBe(true);
		expect(existsSync(join(tempHome, '.bat-cli/credentials-dev.json'))).toBe(false);

		const loginProc = await runCli(['login', 'guest']);
		expect(loginProc.success).toBe(true);
	});

	it('should fetch taxonomy schema', async () => {
		const proc = await runCli(['schema']);
		expect(proc.success).toBe(true);
		const stdout = proc.stdout;
		const data = JSON.parse(stdout);
		expect(data.categorys).toBeDefined();
	});

	it('should init a new site directory and query site-dir', async () => {
		const tempSubmitDir = join(tmpdir(), `bat-cli-e2e-submit-${Date.now()}`);
		try {
			// 1. 测试 init 命令行
			const initProc = await runCli(['init', tempSubmitDir]);
			expect(initProc.success).toBe(true);
			expect(existsSync(join(tempSubmitDir, 'base.json'))).toBe(true);
			expect(existsSync(join(tempSubmitDir, 'i18n/en.json'))).toBe(true);

			// 2. 测试 init-site 命令行
			const initSiteProc = await runCli([
				'init-site',
				'--website',
				'https://test-example.com',
				'--root',
				tempSubmitDir,
			]);
			expect(initSiteProc.success).toBe(true);
			const nestedDir = join(tempSubmitDir, 'test-example.com');
			expect(existsSync(join(nestedDir, 'base.json'))).toBe(true);

			// 3. 测试 site-dir 命令行
			const siteDirProc = await runCli(['site-dir', 'https://test-example.com', '--root', tempSubmitDir]);
			expect(siteDirProc.success).toBe(true);
			expect(siteDirProc.stdout.trim()).toBe(nestedDir);
		} finally {
			if (existsSync(tempSubmitDir)) {
				rmSync(tempSubmitDir, { recursive: true, force: true });
			}
		}
	});

	it('should pack a directory into bundle file', async () => {
		const tempOutJson = join(tmpdir(), `packed-bundle-${Date.now()}.json`);
		try {
			const proc = await runCli(['pack', SAMPLE_DIR, '-o', tempOutJson]);
			expect(proc.success).toBe(true);
			expect(existsSync(tempOutJson)).toBe(true);
			const bundle = JSON.parse(readFileSync(tempOutJson, 'utf-8'));
			expect(bundle.website).toBe(EXPECTED_WEBSITE);
			expect(bundle.logo).toBe(`${MOCK_STATIC_BASE}/upload/toos/logo/imagetostl.me/mock.webp`);
			expect(bundle.websiteScreenshot).toBe(`${MOCK_STATIC_BASE}/upload/toos/screenshot/imagetostl.me/mock.webp`);
		} finally {
			if (existsSync(tempOutJson)) {
				rmSync(tempOutJson, { recursive: true, force: true });
			}
		}
	});

	it('should execute validate-phase1 successfully', async () => {
		const proc = await runCli(['validate-phase1', SAMPLE_DIR]);
		expect(proc.success).toBe(true);
		const data = JSON.parse(proc.stdout);
		expect(data.ok).toBe(true);
	});

	it('should list submits in json format', async () => {
		const proc = await runCli(['list', '--format', 'json']);
		expect(proc.success).toBe(true);
		const list = JSON.parse(proc.stdout);
		expect(Array.isArray(list)).toBe(true);
		expect(list[0].submitId).toBe(888);
		expect(list[0].name).toBe('imagetostl');
	});

	it('should submit a packed bundle directory', async () => {
		const proc = await runCli(['submit', '--dir', SAMPLE_DIR]);
		expect(proc.success).toBe(true);
		const data = JSON.parse(proc.stdout);
		expect(data.submitId).toBe(888);
		expect(data.status).toBe(1);
	});
});
