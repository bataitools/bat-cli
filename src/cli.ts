#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import readline from 'node:readline';
import { validateAgentSubmitBundle, AGENT_REQUIRED_LANGUAGE_CODES } from './shared';
import { printCliError } from './api-error';
import {
	fetchSchema,
	getSubmitStatus,
	publishSubmit,
	submitBundle,
	uploadScreenshot,
	uploadLogo,
	listSubmits,
} from './client';
import {
	BAT_API_URL_PRODUCTION,
	BAT_API_URL_DEVELOPMENT,
	autoLogin,
	getApiUrl,
	logout,
	assertNotLoggedIn,
} from './config';
import { formalLogin, openBrowser } from './login-flow';
import { loginWithFormalApiKey } from './verify-api-key';
import { packSubmitDirectory, validatePhase1Directory } from './pack';
import { submitDirForWebsite } from './site-dir';
import { AGENT_LOCAL_WEBSITE_SCREENSHOT_FILENAME, ensureSubmitAssetsUploaded, localLogoPath } from './submit-assets';
import { captureWebsiteScreenshot } from './screenshot';
import { downloadAndCompressLogo } from './fetch-logo';

async function main() {
	// 如果命令行中带有 --dev 标志，则自动将其剔除并切换 API 基址为本地开发服务器
	const devIdx = process.argv.indexOf('--dev');
	if (devIdx >= 0) {
		process.argv.splice(devIdx, 1);
		if (!process.env.BAT_API_URL) {
			process.env.BAT_API_URL = BAT_API_URL_DEVELOPMENT;
		}
		if (!process.env.BAT_ENV) {
			process.env.BAT_ENV = 'dev';
		}
	}

	const [command, ...args] = process.argv.slice(2);

	if (command === 'version' || command === '--version' || command === '-v') {
		try {
			const pkgPath = resolve(import.meta.dirname, '../package.json');
			const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
			console.log(pkg.version);
		} catch {
			console.log('1.10.0');
		}
		return;
	}

	if (!command || command === 'help' || command === '--help') {
		printHelp();
		return;
	}

	const started = performance.now();

	try {
		switch (command) {
			case 'login': {
				assertNotLoggedIn();
				let token = args[0];
				const apiUrl = parseApiUrl(args);
				const keyFlag = readFlag(args, '--key');

				if (keyFlag) {
					await loginWithFormalApiKey(keyFlag, apiUrl);
					break;
				}

				if (token === 'guest') {
					await autoLogin(apiUrl);
					break;
				}
				if (token?.startsWith('bat_') || token?.startsWith('bat-')) {
					await loginWithFormalApiKey(token, apiUrl);
					break;
				}
				if (!token) {
					console.log('Welcome to BAT AI Tools CLI login!');
					console.log('You can log in using either your API key or OAuth device flow.');
					const rl = readline.createInterface({
						input: process.stdin,
						output: process.stdout,
					});
					const inputKey = await new Promise<string>((resolve) => {
						rl.question('👉 Please enter your API key (leave empty to login via browser OAuth): ', (ans) =>
							resolve(ans.trim()),
						);
					});
					rl.close();
					process.stdin.resume();
					if (inputKey) {
						await loginWithFormalApiKey(inputKey, apiUrl);
						break;
					}
					await formalLogin(apiUrl);
					break;
				}
				throw new Error(
					'Usage: bat-cli login [--key <api-key>] [--api <url>] [--env dev|prod]\n' +
						'       bat-cli login guest',
				);
			}
			case 'logout': {
				logout();
				break;
			}
			case 'schema': {
				const format = readFlag(args, '--format') ?? 'json';
				const keys = readFlag(args, '--keys');
				const schema = (await fetchSchema(args[0] && !args[0].startsWith('-') ? args[0] : 'en')) as any;

				let outputData = schema;
				if (keys) {
					const filterKeys = keys.split(',').map((k) => k.trim());
					const filtered: Record<string, any> = {};
					for (const key of filterKeys) {
						if (schema[key]) {
							filtered[key] = schema[key];
						}
					}
					outputData = filtered;
				}

				if (format === 'table') {
					printSchemaTable(outputData);
				} else {
					console.log(JSON.stringify(outputData, null, 2));
				}
				break;
			}
			case 'validate': {
				const file = readBundleFile(args);
				const raw = JSON.parse(readFileSync(file, 'utf-8'));
				const result = validateAgentSubmitBundle(raw);
				console.log(JSON.stringify(result, null, 2));
				if (!result.ok) process.exit(1);
				break;
			}
			case 'validate-phase1': {
				let dir = args[0];
				if (!dir) throw new Error('Usage: bat-cli validate-phase1 <submit-dir>');
				dir = resolve(dir);
				const result = validatePhase1Directory(dir);
				console.log(JSON.stringify(result, null, 2));
				if (!result.ok) process.exit(1);
				break;
			}
			case 'submit': {
				const dirFlag = args.indexOf('--dir');
				if (dirFlag >= 0) {
					let dir = args[dirFlag + 1];
					if (!dir) throw new Error('Usage: bat-cli submit --dir <submit-dir>');
					dir = resolve(dir);
					await ensureSubmitAssetsUploaded(dir);
					const bundle = await packSubmitDirectory(dir);
					const validation = validateAgentSubmitBundle(bundle);
					if (!validation.ok) {
						console.error(JSON.stringify(validation, null, 2));
						process.exit(1);
					}
					const data = await submitBundle(bundle);
					console.error(
						`[bat-cli] ${data.mode === 'update' ? 'update' : 'new submit'} submitId=${data.submitId} status=${data.status} (${getStatusText(data.status)})`,
					);
					console.log(JSON.stringify(data, null, 2));
					break;
				}
				const file = readBundleFile(args);
				const bundle = JSON.parse(readFileSync(file, 'utf-8'));
				const validation = validateAgentSubmitBundle(bundle);
				if (!validation.ok) {
					console.error(JSON.stringify(validation, null, 2));
					process.exit(1);
				}
				const data = await submitBundle(bundle);
				console.error(
					`[bat-cli] ${data.mode === 'update' ? 'update' : 'new submit'} submitId=${data.submitId} status=${data.status} (${getStatusText(data.status)})`,
				);
				console.log(JSON.stringify(data, null, 2));
				break;
			}
			case 'status': {
				const submitId = parseSubmitId(args);
				const data = await getSubmitStatus(submitId);
				console.log(JSON.stringify(data, null, 2));
				break;
			}
			case 'list': {
				const format = readFlag(args, '--format') ?? 'table';
				const data = await listSubmits();
				if (format === 'table') {
					if (!data || data.length === 0) {
						console.log('No submits found.');
						break;
					}
					console.log('ID\tName\tWebsite\tStatus\tCreated At');
					console.log('--------------------------------------------------');
					for (const item of data) {
						console.log(
							`${item.submitId}\t${item.name || '-'}\t${item.website || '-'}\t${item.statusLabel || item.status}\t${item.createdAt || '-'}`,
						);
					}
				} else {
					console.log(JSON.stringify(data, null, 2));
				}
				break;
			}
			case 'preview': {
				const previewUrl = readFlag(args, '--url') ?? args[0];
				if (!previewUrl) {
					throw new Error('Usage: bat-cli preview <previewUrl>');
				}
				console.log(`🔗 Preview URL: ${previewUrl}`);
				console.log(previewUrl);
				await openBrowser(previewUrl);
				break;
			}
			case 'upload-screenshot': {
				const opts = parseScreenshotArgs(args);
				const data = await uploadScreenshot({
					filePath: opts.file,
					website: opts.website,
				});
				console.log(JSON.stringify(data, null, 2));
				if (opts.mergeFile) {
					mergeScreenshotIntoFile(opts.mergeFile, data.path);
				}
				break;
			}
			case 'upload-logo': {
				const opts = parseLogoArgs(args);
				const data = await uploadLogo({
					filePath: opts.file,
					website: opts.website,
				});
				console.log(JSON.stringify(data, null, 2));
				if (opts.mergeFile) {
					mergeLogoIntoFile(opts.mergeFile, data.path);
				}
				break;
			}
			case 'capture-screenshot': {
				const website = readFlag(args, '--website') ?? args[0];
				const dir = readFlag(args, '--dir') ?? args[1] ?? '.';
				if (!website) {
					throw new Error('Usage: bat-cli capture-screenshot --website <url> --dir <submit-dir>');
				}
				const dest = join(resolve(dir), 'website-screenshot.webp');
				await captureWebsiteScreenshot(website, dest);
				break;
			}
			case 'fetch-logo': {
				const url = readFlag(args, '--url') ?? args[0];
				const dir = readFlag(args, '--dir') ?? args[1] ?? '.';
				if (!url) {
					throw new Error('Usage: bat-cli fetch-logo --url <logo-url> --dir <submit-dir>');
				}
				const dest = join(resolve(dir), 'logo.webp');
				await downloadAndCompressLogo(url, dest);
				break;
			}
			case 'pack': {
				let dir = args[0];
				const out = readFlag(args, '-o') ?? readFlag(args, '--out');
				if (!dir) throw new Error('Usage: bat-cli pack <submit-dir> [-o submit.bundle.json]');
				dir = resolve(dir);
				await ensureSubmitAssetsUploaded(dir);
				const bundle = await packSubmitDirectory(dir);
				const json = JSON.stringify(bundle, null, 2);
				if (out) {
					const resolvedOut = resolve(out);
					writeFileSync(resolvedOut, json, 'utf-8');
					console.log(`[bat-cli] wrote ${resolvedOut} (${Object.keys(bundle.i18n).length} languages)`);
				} else {
					console.log(json);
				}
				break;
			}
			case 'site-dir': {
				const website = args[0];
				if (!website) throw new Error('Usage: bat-cli site-dir <website-url> [--root ./submits]');
				const root = readFlag(args, '--root') ?? './submits';
				const dir = submitDirForWebsite(website, root);
				console.log(dir);
				break;
			}
			case 'init-site': {
				const website = readFlag(args, '--website');
				let dir = readFlag(args, '--dir');
				if (!website)
					throw new Error('Usage: bat-cli init-site --website <url> [--dir <submit-dir>] [--root ./submits]');
				if (!dir) {
					const root = readFlag(args, '--root') ?? './submits';
					dir = submitDirForWebsite(website, root);
				}
				const resolvedDir = resolve(dir);
				scaffoldSubmitDirectory(resolvedDir);
				console.log(`✅ Site directory created at: ${resolvedDir}`);
				console.log(resolvedDir);
				break;
			}
			case 'init': {
				const dir = args[0];
				if (!dir) throw new Error('Usage: bat-cli init <submit-dir>');
				const resolvedDir = resolve(dir);
				scaffoldSubmitDirectory(resolvedDir);
				console.log(`✅ Site directory scaffolded at: ${resolvedDir}`);
				break;
			}
			default:
				throw new Error(`Unknown command: ${command}`);
		}
		console.error(`[bat-cli] ${command} completed in ${(performance.now() - started).toFixed(0)}ms`);
	} catch (e) {
		printCliError(e);
		process.exit(1);
	}
}

function readBundleFile(args: string[]): string {
	const fileFlag = args.indexOf('-f');
	const file = fileFlag >= 0 ? args[fileFlag + 1] : args[0];
	if (!file) throw new Error('Usage: bat-cli <command> -f <submit.json>');
	return file;
}

function parseSubmitId(args: string[]): number {
	const idFlag = args.indexOf('--id');
	const raw = idFlag >= 0 ? args[idFlag + 1] : args[0];
	const id = Number(raw);
	if (!id) throw new Error('Usage: bat-cli status --id <submitId>');
	return id;
}

function readFlag(args: string[], name: string): string | undefined {
	const idx = args.indexOf(name);
	return idx >= 0 ? args[idx + 1] : undefined;
}

function parseScreenshotArgs(args: string[]) {
	const file = readFlag(args, '-f') ?? readFlag(args, '--file');
	const website = readFlag(args, '--website');
	const mergeFile = readFlag(args, '--merge');
	if (!file || !website) {
		throw new Error('Usage: bat-cli upload-screenshot -f <file.png> --website <url> [--merge base.json]');
	}
	return { file, website, mergeFile };
}

function parseLogoArgs(args: string[]) {
	const file = readFlag(args, '-f') ?? readFlag(args, '--file');
	const website = readFlag(args, '--website');
	const mergeFile = readFlag(args, '--merge');
	if (!file || !website) {
		throw new Error('Usage: bat-cli upload-logo -f <file.png> --website <url> [--merge base.json]');
	}
	return { file, website, mergeFile };
}

function scaffoldSubmitDirectory(dir: string) {
	const basePath = join(dir, 'base.json');
	const enPath = join(dir, 'i18n/en.json');

	mkdirSync(join(dir, 'i18n'), { recursive: true });
	const baseTemplate = join(import.meta.dirname, '../templates/submit/base.json');
	const enTemplate = join(import.meta.dirname, '../templates/submit/i18n/en.json');
	writeFileSync(basePath, readFileSync(baseTemplate, 'utf-8'));
	writeFileSync(enPath, readFileSync(enTemplate, 'utf-8'));
	console.log(`[bat-cli] scaffolded ${dir}/base.json and ${dir}/i18n/en.json`);
}

function mergeScreenshotIntoFile(file: string, path: string) {
	const bundle = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>;
	bundle.websiteScreenshot = path;
	delete bundle.screenshots;
	writeFileSync(file, JSON.stringify(bundle, null, 2));
	console.log(`[bat-cli] merged websiteScreenshot into ${file}`);
}

function mergeLogoIntoFile(file: string, path: string) {
	const bundle = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>;
	bundle.logo = path;
	writeFileSync(file, JSON.stringify(bundle, null, 2));
	console.log(`[bat-cli] merged logo into ${file}`);
}

function printSchemaTable(schema: any) {
	if (schema.categories && Array.isArray(schema.categories)) {
		console.log('\n=== Categories (分类) ===');
		for (const item of schema.categories) {
			console.log(`* ${item.code} - ${item.name}`);
		}
	} else if (schema.categorys && Array.isArray(schema.categorys)) {
		console.log('\n=== Categories (分类) ===');
		for (const item of schema.categorys) {
			console.log(`* ${item.code} - ${item.name}`);
		}
	}
	if (schema.tags && Array.isArray(schema.tags)) {
		console.log('\n=== Tags (标签) ===');
		for (const item of schema.tags) {
			console.log(`* ${item.code} - ${item.name}`);
		}
	}
	if (schema.audiences && Array.isArray(schema.audiences)) {
		console.log('\n=== Audiences (受众) ===');
		for (const item of schema.audiences) {
			console.log(`* ${item.code} - ${item.name}`);
		}
	}
}

function printHelp() {
	console.log(`bat-cli — BAT AI Tools Skill/CLI submit tool

Commands:
  login [--api URL]              OAuth device login (opens browser, like gh auth login)
  login <api-key> [--api URL]    Save API key directly (CI / advanced)
  login guest [--env dev|prod]   Anonymous guest account (no browser)
  logout                         Remove saved credentials (~/.bat-cli/credentials.json)
  schema [lang]         Fetch taxonomy + API schema (default lang: en)
  validate -f <file>    Validate full submit bundle locally
  validate-phase1 <dir> Validate base.json + i18n/en.json only (before translate)
  submit --dir <dir>    Ensure screenshot + pack + submit and publish in one step
  submit -f <file>      Submit and publish bundle to BAT
  status --id <id>      Check review status
  list [--format table|json]   List all submissions
  preview <previewUrl>         Open preview URL in browser
  site-dir <url> [--root DIR]  Print per-site directory (default root: ./submits)
  init-site --website <url>    Scaffold ./submits/<host>/base.json + i18n/en.json
  init <submit-dir>            Scaffold base.json + i18n/en.json
  pack <dir> [-o file]  Merge base.json + i18n/*.json → bundle (uploads local logo/screenshot if needed)
  capture-screenshot --website <url> [--dir dir]  Capture 1080p WebP screenshot of website
  fetch-logo --url <url> [--dir dir]             Download and compress remote logo to logo.webp
  upload-screenshot -f <file> --website <url> [--merge base.json]
  upload-logo -f <file> --website <url> [--merge base.json]

API endpoint:
  default             ${BAT_API_URL_PRODUCTION} (override via BAT_API_URL env or login --api)
`);
}

function parseApiUrl(args: string[]): string | undefined {
	let apiUrl = readFlag(args, '--api');
	const env = readFlag(args, '--env');

	if (env === 'dev' || env === 'development') {
		return BAT_API_URL_DEVELOPMENT;
	}
	if (env === 'prod' || env === 'production') {
		return BAT_API_URL_PRODUCTION;
	}
	return apiUrl || process.env.BAT_API_URL;
}

function askQuestion(query: string): Promise<string> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	return new Promise((resolve) =>
		rl.question(query, (ans) => {
			rl.close();
			resolve(ans.trim());
		}),
	);
}

function getStatusText(status: number | string): string {
	const s = Number(status);
	switch (s) {
		case 0:
			return 'draft/草稿';
		case 1:
			return 'pending_review/待审核';
		case 2:
			return 'approved/审核通过已发布';
		case 3:
			return 'rejected/审核拒绝';
		default:
			return `unknown/未知(${status})`;
	}
}

main().catch((e) => {
	printCliError(e);
	process.exit(1);
});
