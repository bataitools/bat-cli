import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'bun';

const ROOT = join(import.meta.dir, '..');
const PKG_PATH = join(ROOT, 'package.json');
const DIST_CLI = join(ROOT, 'dist/cli.js');

/** @bat/shared、decode-ico 已打入 dist/cli.js，不可作为 npm 依赖发布 */
const BUNDLED_DEPENDENCIES = new Set(['@bat/shared', 'decode-ico']);

function readPkg(): Record<string, unknown> {
	return JSON.parse(readFileSync(PKG_PATH, 'utf8'));
}

function writePkg(pkg: Record<string, unknown>) {
	writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
}

function bumpVersion(version: string, kind: 'patch' | 'minor'): string {
	const parts = version.split('.').map(Number);
	if (parts.length !== 3 || parts.some(Number.isNaN)) {
		throw new Error(`Invalid semver: ${version}`);
	}
	if (kind === 'minor') {
		parts[1] += 1;
		parts[2] = 0;
	} else {
		parts[2] += 1;
	}
	return parts.join('.');
}

function runBuild() {
	console.log('\x1b[36m[Publish]\x1b[0m Building dist/cli.js ...');
	const proc = spawnSync(['bun', 'run', 'build'], { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' });
	if (proc.exitCode !== 0) {
		throw new Error('Build failed');
	}
	if (!existsSync(DIST_CLI)) {
		throw new Error('dist/cli.js not found after build');
	}
}

function toPublishManifest(source: Record<string, unknown>): Record<string, unknown> {
	const dependencies = { ...(source.dependencies as Record<string, string> | undefined) };
	for (const name of BUNDLED_DEPENDENCIES) {
		delete dependencies[name];
	}

	const manifest: Record<string, unknown> = {
		...source,
		main: './dist/cli.js',
		dependencies,
	};

	delete manifest.types;
	delete manifest.devDependencies;
	delete manifest.scripts;

	return manifest;
}

function parseArgs() {
	const args = process.argv.slice(2);
	const bump = args.includes('--minor') ? 'minor' : args.includes('--patch') ? 'patch' : null;
	const dryRun = args.includes('--dry-run');
	const otpArg = args.find((a) => a.startsWith('--otp='));
	const otp = otpArg ? otpArg.split('=')[1] : null;
	return { bump, dryRun, otp };
}

async function main() {
	const started = performance.now();
	const { bump, dryRun, otp } = parseArgs();
	const originalText = readFileSync(PKG_PATH, 'utf8');
	const source = readPkg();

	if (bump) {
		source.version = bumpVersion(String(source.version), bump);
		writePkg(source);
		console.log(`\x1b[35m[Publish]\x1b[0m Bumped version to v${source.version}`);
	}

	runBuild();

	const publishManifest = toPublishManifest(source);
	writePkg(publishManifest);

	console.log(
		`\x1b[36m[Publish]\x1b[0m Prepared manifest (removed bundled deps: ${[...BUNDLED_DEPENDENCIES].join(', ')})`,
	);

	try {
		const npmBin = process.platform === 'linux' && existsSync('/usr/local/bin/npm') ? '/usr/local/bin/npm' : 'npm';
		console.log(`\x1b[36m[Publish]\x1b[0m Using npm binary: ${npmBin}`);
		const versionProc = spawnSync([npmBin, '--version'], { cwd: ROOT });
		if (versionProc.exitCode === 0) {
			console.log(`\x1b[36m[Publish]\x1b[0m npm CLI version: ${versionProc.stdout.toString().trim()}`);
		}

		if (dryRun) {
			console.log(`\x1b[36m[Publish]\x1b[0m Running: ${npmBin} pack (dry-run, no auth required)`);
			const proc = spawnSync([npmBin, 'pack', '--dry-run'], {
				cwd: ROOT,
				stdout: 'inherit',
				stderr: 'inherit',
			});
			if (proc.exitCode !== 0) {
				throw new Error(`npm pack --dry-run failed with exit code ${proc.exitCode ?? 1}`);
			}
		} else {
			console.log(`\x1b[36m[Publish]\x1b[0m Running: ${npmBin} publish --access public`);
			const cmdArgs = ['publish', '--access', 'public'];
			if (otp) {
				cmdArgs.push('--otp', otp);
			}
			if (process.env.GITHUB_ACTIONS === 'true') {
				console.log(
					'\x1b[36m[Publish]\x1b[0m GitHub Actions detected. Adding --provenance for OIDC / Trusted Publisher.',
				);
				cmdArgs.push('--provenance');
			}
			const proc = spawnSync([npmBin, ...cmdArgs], {
				cwd: ROOT,
				stdout: 'inherit',
				stderr: 'inherit',
			});
			if (proc.exitCode !== 0) {
				throw new Error(`npm publish failed with exit code ${proc.exitCode ?? 1}`);
			}
		}

		const restored = JSON.parse(originalText) as Record<string, unknown>;
		restored.version = source.version;
		writePkg(restored);

		console.log(
			`\x1b[32m✔ [Publish]\x1b[0m @bataitools/bat-cli@${source.version} ${dryRun ? 'dry-run OK' : 'published'} in ${((performance.now() - started) / 1000).toFixed(1)}s`,
		);

		if (!dryRun) {
			console.log('\x1b[33m[Publish]\x1b[0m Remember to commit package.json version bump.');
		}
	} catch (err) {
		writeFileSync(PKG_PATH, originalText);
		throw err;
	}
}

main().catch((err) => {
	console.error('\x1b[31m✘ [Publish]\x1b[0m', err instanceof Error ? err.message : err);
	console.error('\x1b[33m[Publish]\x1b[0m package.json restored to pre-publish state.');
	process.exit(1);
});
