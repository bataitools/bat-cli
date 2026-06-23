import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
	packAgentSubmit,
	validateAgentSubmitBundle,
	validateAgentSubmitPhase1,
	type AgentI18nEntry,
	type AgentSubmitBase,
	type AgentSubmitBundle,
} from './shared';
import { hasLocalLogo, hasLocalWebsiteScreenshot } from './submit-assets';

export function loadI18nDirectory(i18nDir: string): Record<string, AgentI18nEntry> {
	const result: Record<string, AgentI18nEntry> = {};
	const files = readdirSync(i18nDir).filter((f) => f.endsWith('.json'));
	for (const file of files) {
		const lang = file.replace(/\.json$/, '');
		const raw = JSON.parse(readFileSync(join(i18nDir, file), 'utf-8')) as AgentI18nEntry;
		result[lang] = raw;
	}
	return result;
}

export function loadSubmitDirectory(dir: string): AgentSubmitBundle {
	const basePath = join(dir, 'base.json');
	const i18nDir = join(dir, 'i18n');
	const base = JSON.parse(readFileSync(basePath, 'utf-8')) as AgentSubmitBase;
	if (!statSync(i18nDir).isDirectory()) {
		throw new Error(`Missing i18n directory: ${i18nDir}`);
	}
	const i18nByLang = loadI18nDirectory(i18nDir);
	return packAgentSubmit(base, i18nByLang);
}

export function validatePhase1Directory(dir: string) {
	const started = performance.now();
	const bundle = loadSubmitDirectory(dir);
	const result = validateAgentSubmitPhase1(bundle, {
		localWebsiteScreenshot: hasLocalWebsiteScreenshot(dir),
		localLogo: hasLocalLogo(dir),
	});
	console.error(
		`[bat-cli:ValidatePhase1] dir=${dir} ok=${result.ok} in ${(performance.now() - started).toFixed(0)}ms`,
	);
	return result;
}

export async function packSubmitDirectory(dir: string): Promise<AgentSubmitBundle> {
	const started = performance.now();
	const bundle = loadSubmitDirectory(dir);
	const validation = validateAgentSubmitBundle(bundle);
	if (!validation.ok) {
		const msg = JSON.stringify({ errors: validation.errors, languageErrors: validation.languageErrors }, null, 2);
		throw new Error(`Pack validation failed:\n${msg}`);
	}

	console.error(
		`[bat-cli:Pack] dir=${dir} langs=${Object.keys(bundle.i18n).length} in ${(performance.now() - started).toFixed(0)}ms`,
	);
	return bundle;
}
