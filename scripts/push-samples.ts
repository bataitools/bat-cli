#!/usr/bin/env bun
/**
 * 将 samples/ 下的完整提交样本，通过 bat-cli submit 流程推送到 dev 或 prod API。
 * 用途：验证远程 API 与提交流程是否正常（不仅限于单元测试）。
 *
 * 用法:
 *   bun run dev:push-samples
 *   bun run dev:push-samples -- --only imagetostl.me
 *   bun run dev:push-samples -- --dry-run
 *   bun run prod:push-samples -- --confirm-prod
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { BAT_API_URL_DEVELOPMENT, BAT_API_URL_PRODUCTION, ensureToken } from '../src/config';
import { shortCliErrorLabel, printIndentedCliError } from '../src/api-error';
import { submitBundle } from '../src/client';
import { packSubmitDirectory } from '../src/pack';
import { validateAgentSubmitBundle } from '../src/shared';
import { ensureSubmitAssetsUploaded } from '../src/submit-assets';

const LOG = '[push-samples]';
const SAMPLES_ROOT = resolve(import.meta.dirname, '../samples');

type EnvName = 'dev' | 'prod';

interface PushOptions {
	env: EnvName;
	only: string[];
	dryRun: boolean;
	confirmProd: boolean;
}

function readFlag(args: string[], name: string): string | undefined {
	const idx = args.indexOf(name);
	return idx >= 0 ? args[idx + 1] : undefined;
}

function hasFlag(args: string[], name: string): boolean {
	return args.includes(name);
}

function parseOptions(argv: string[]): PushOptions {
	const envRaw = readFlag(argv, '--env') ?? 'dev';
	if (envRaw !== 'dev' && envRaw !== 'prod') {
		throw new Error(`Invalid --env "${envRaw}". Use dev or prod.`);
	}

	const onlyRaw = readFlag(argv, '--only');
	const only = onlyRaw
		? onlyRaw
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
		: [];

	return {
		env: envRaw,
		only,
		dryRun: hasFlag(argv, '--dry-run'),
		confirmProd: hasFlag(argv, '--confirm-prod'),
	};
}

function resolveApiUrl(env: EnvName): string {
	return env === 'prod' ? BAT_API_URL_PRODUCTION : BAT_API_URL_DEVELOPMENT;
}

function discoverSampleDirs(only: string[]): string[] {
	if (!existsSync(SAMPLES_ROOT)) {
		throw new Error(`Samples directory not found: ${SAMPLES_ROOT}`);
	}

	const dirs = readdirSync(SAMPLES_ROOT)
		.filter((name) => {
			const dir = join(SAMPLES_ROOT, name);
			return statSync(dir).isDirectory() && existsSync(join(dir, 'base.json'));
		})
		.sort()
		.map((name) => join(SAMPLES_ROOT, name));

	if (only.length === 0) {
		return dirs;
	}

	const onlySet = new Set(only);
	const matched = dirs.filter((dir) => onlySet.has(basename(dir)));
	const missing = only.filter((name) => !matched.some((dir) => basename(dir) === name));
	if (missing.length > 0) {
		throw new Error(`Sample directory not found for --only: ${missing.join(', ')}`);
	}
	return matched;
}

async function pushOneSample(dir: string, dryRun: boolean): Promise<{ ok: boolean; website?: string; error?: string }> {
	const label = basename(dir);
	const started = performance.now();
	console.log(`${LOG} submitting ${label} ...`);

	try {
		await ensureSubmitAssetsUploaded(dir);
		const bundle = await packSubmitDirectory(dir);
		const validation = validateAgentSubmitBundle(bundle);
		if (!validation.ok) {
			console.error(`${LOG} validation failed for ${label}:`, JSON.stringify(validation, null, 2));
			return { ok: false, error: 'validation failed' };
		}

		if (dryRun) {
			console.log(
				`${LOG} dry-run ok ${label} website=${bundle.website} languages=${Object.keys(bundle.i18n).length} (${(performance.now() - started).toFixed(0)}ms)`,
			);
			return { ok: true, website: bundle.website };
		}

		const data = await submitBundle(bundle);
		console.log(
			`${LOG} done ${label} submitId=${data.submitId} mode=${data.mode} status=${data.status} preview=${data.previewUrl} (${(performance.now() - started).toFixed(0)}ms)`,
		);
		return { ok: true, website: bundle.website };
	} catch (e) {
		console.error(`${LOG} failed ${label}:`);
		printIndentedCliError(e);
		return { ok: false, error: shortCliErrorLabel(e) };
	}
}

async function main() {
	const started = performance.now();
	const options = parseOptions(process.argv.slice(2));
	const apiUrl = resolveApiUrl(options.env);

	if (options.env === 'prod' && !options.confirmProd && !options.dryRun) {
		throw new Error(
			'Refusing to push to prod without --confirm-prod. Use: bun run prod:push-samples -- --confirm-prod',
		);
	}

	process.env.BAT_API_URL = apiUrl;

	const sampleDirs = discoverSampleDirs(options.only);
	if (sampleDirs.length === 0) {
		throw new Error(`No sample directories found under ${SAMPLES_ROOT}`);
	}

	if (!options.dryRun) {
		await ensureToken();
	}

	console.log(`${LOG} target=${options.env} api=${apiUrl} dryRun=${options.dryRun} samples=${sampleDirs.length}`);
	for (const dir of sampleDirs) {
		console.log(`${LOG}   · ${basename(dir)}`);
	}

	const results: Array<{ label: string; ok: boolean; error?: string }> = [];
	for (const dir of sampleDirs) {
		const result = await pushOneSample(dir, options.dryRun);
		results.push({ label: basename(dir), ok: result.ok, error: result.error });
	}

	const passed = results.filter((r) => r.ok).length;
	const failed = results.filter((r) => !r.ok);
	console.log(`${LOG} finished ${passed}/${results.length} ok in ${(performance.now() - started).toFixed(0)}ms`);

	if (failed.length > 0) {
		console.error(`${LOG} failed samples:`);
		for (const item of failed) {
			console.error(`  · ${item.label}: ${item.error ?? 'unknown error'}`);
		}
		process.exit(1);
	}
}

main().catch((e) => {
	console.error(`${LOG} error:`);
	printIndentedCliError(e);
	process.exit(1);
});
