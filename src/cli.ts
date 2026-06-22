#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAgentSubmitBundle } from './shared';
import { fetchSchema, getSubmitStatus, publishSubmit, submitBundle, uploadScreenshot } from './client';
import { BAT_API_URL_PRODUCTION, autoLogin, saveToken } from './config';
import { formalLogin } from './login-flow';
import { packSubmitDirectory, validatePhase1Directory } from './pack';
import { captureWebsiteScreenshot } from './screenshot';
import { submitDirForWebsite } from './site-dir';
import {
	AGENT_LOCAL_WEBSITE_SCREENSHOT_FILENAME,
	ensureSubmitAssetsUploaded,
	localLogoPath,
} from './submit-assets';
import { downloadAndProcessLogo } from './logo-process';

async function main() {
	const [command, ...args] = process.argv.slice(2);

	if (!command || command === 'help' || command === '--help') {
		printHelp();
		return;
	}

	const started = performance.now();

	try {
		switch (command) {
			case 'login': {
				const token = args[0];
				const apiUrl = readFlag(args, '--api');
				if (token === 'guest') {
					await autoLogin(apiUrl);
					break;
				}
				if (token?.startsWith('bat_')) {
					saveToken(token, apiUrl);
					console.log('[bat-cli] saved formal account API key');
					break;
				}
				if (!token) {
					await formalLogin(apiUrl);
					break;
				}
				throw new Error(
					'Usage: bat-cli login | bat-cli login <api-key> | bat-cli login guest | bat-cli login-guest',
				);
			}
			case 'login-guest': {
				await autoLogin(readFlag(args, '--api'));
				break;
			}
			case 'schema': {
				const schema = await fetchSchema(args[0] ?? 'en');
				console.log(JSON.stringify(schema, null, 2));
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
				const dir = args[0];
				if (!dir) throw new Error('Usage: bat-cli validate-phase1 <submit-dir>');
				const result = validatePhase1Directory(dir);
				console.log(JSON.stringify(result, null, 2));
				if (!result.ok) process.exit(1);
				break;
			}
			case 'submit': {
				const dirFlag = args.indexOf('--dir');
				if (dirFlag >= 0) {
					const dir = args[dirFlag + 1];
					if (!dir) throw new Error('Usage: bat-cli submit --dir <submit-dir>');
					await ensureSubmitAssetsUploaded(dir);
					const bundle = await packSubmitDirectory(dir);
					const validation = validateAgentSubmitBundle(bundle);
					if (!validation.ok) {
						console.error(JSON.stringify(validation, null, 2));
						process.exit(1);
					}
					const data = await submitBundle(bundle);
					console.log(
						`[bat-cli] ${data.mode === 'update' ? 'update' : 'new submit'} submitId=${data.submitId} orderType=${data.orderType} status=${data.status}`,
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
				console.log(
					`[bat-cli] ${data.mode === 'update' ? 'update' : 'new submit'} submitId=${data.submitId} orderType=${data.orderType} status=${data.status}`,
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
			case 'capture-screenshot': {
				const opts = parseCaptureArgs(args);
				const buffer = await captureWebsiteScreenshot(opts.url);
				if (opts.dir) {
					mkdirSync(opts.dir, { recursive: true });
					const outPath = join(opts.dir, AGENT_LOCAL_WEBSITE_SCREENSHOT_FILENAME);
					writeFileSync(outPath, buffer);
					console.log(`[bat-cli] wrote local screenshot ${outPath}`);
					break;
				}
				if (opts.mergeFile) {
					const tmpFile = join(tmpdir(), `bat-cli-upload-${Date.now()}.png`);
					writeFileSync(tmpFile, buffer);
					const data = await uploadScreenshot({
						filePath: tmpFile,
						website: opts.website,
					});
					console.log(JSON.stringify(data, null, 2));
					mergeScreenshotIntoFile(opts.mergeFile, data.path);
					break;
				}
				throw new Error(
					'Usage: bat-cli capture-screenshot --website <url> --dir <submit-dir> [--url <capture-url>]',
				);
			}
			case 'fetch-logo': {
				const url = readFlag(args, '--url');
				const dir = readFlag(args, '--dir');
				if (!url || !dir) {
					throw new Error('Usage: bat-cli fetch-logo --url <logo-url> --dir <submit-dir>');
				}
				const outPath = localLogoPath(dir);
				await downloadAndProcessLogo(url, outPath);
				console.log(`[bat-cli] wrote local logo ${outPath}`);
				break;
			}
			case 'pack': {
				const dir = args[0];
				const out = readFlag(args, '-o') ?? readFlag(args, '--out');
				if (!dir) throw new Error('Usage: bat-cli pack <submit-dir> [-o submit.bundle.json]');
				await ensureSubmitAssetsUploaded(dir);
				const bundle = await packSubmitDirectory(dir);
				const json = JSON.stringify(bundle, null, 2);
				if (out) {
					writeFileSync(out, json, 'utf-8');
					console.log(`[bat-cli] wrote ${out} (${Object.keys(bundle.i18n).length} languages)`);
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
				if (!website) throw new Error('Usage: bat-cli init-site --website <url> [--root ./submits]');
				const root = readFlag(args, '--root') ?? './submits';
				const dir = submitDirForWebsite(website, root);
				scaffoldSubmitDirectory(dir);
				console.log(dir);
				break;
			}
			case 'init': {
				const dir = args[0];
				if (!dir) throw new Error('Usage: bat-cli init <submit-dir>');
				scaffoldSubmitDirectory(dir);
				break;
			}
			default:
				throw new Error(`Unknown command: ${command}`);
		}
		console.log(`[bat-cli] ${command} completed in ${(performance.now() - started).toFixed(0)}ms`);
	} catch (e) {
		console.error(`[bat-cli] error:`, e instanceof Error ? e.message : e);
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

function parseCaptureArgs(args: string[]) {
	const website = readFlag(args, '--website');
	const url = readFlag(args, '--url') ?? website;
	const dir = readFlag(args, '--dir');
	const mergeFile = readFlag(args, '--merge');
	if (!website || !url) {
		throw new Error(
			'Usage: bat-cli capture-screenshot --website <url> --dir <submit-dir> [--url <capture-url>]',
		);
	}
	return { website, url, dir, mergeFile };
}

function scaffoldSubmitDirectory(dir: string) {
	const basePath = join(dir, 'base.json');
	const enPath = join(dir, 'i18n/en.json');

	mkdirSync(join(dir, 'i18n'), { recursive: true });
	const baseTemplate = join(import.meta.dirname, '../examples/submit/base.json');
	const enTemplate = join(import.meta.dirname, '../examples/submit/i18n/en.json');
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

function printHelp() {
	console.log(`bat-cli — BAT AI Tools Skill/CLI submit tool

Commands:
  login [--api URL]              OAuth device login (opens browser, like gh auth login)
  login <api-key> [--api URL]    Save API key directly (CI / advanced)
  login guest | login-guest      Anonymous device guest account
  schema [lang]         Fetch taxonomy + API schema (default lang: en)
  validate -f <file>    Validate full submit bundle locally
  validate-phase1 <dir> Validate base.json + i18n/en.json only (before translate)
  submit --dir <dir>    Ensure screenshot + pack + submit and publish in one step
  submit -f <file>      Submit and publish bundle to BAT
  status --id <id>      Check review status
  site-dir <url> [--root DIR]  Print per-site directory (default root: ./submits)
  init-site --website <url>    Scaffold ./submits/<host>/base.json + i18n/en.json
  init <submit-dir>            Scaffold base.json + i18n/en.json
  pack <dir> [-o file]  Merge base.json + i18n/*.json → bundle (uploads local logo/screenshot if needed)
  fetch-logo --url <url> --dir <dir>  Download logo → local logo.webp (256×256 webp)
  upload-screenshot -f <file> --website <url> [--merge base.json]
  capture-screenshot --website <url> --dir <submit-dir> [--url <page>]
                        Playwright capture → local website-screenshot.png (install: bunx playwright install chromium)
  capture-screenshot --website <url> --merge base.json
                        Legacy: capture + upload immediately and set websiteScreenshot in base.json

API endpoint:
  default             ${BAT_API_URL_PRODUCTION} (override via BAT_API_URL env or login --api)
`);
}

main();
