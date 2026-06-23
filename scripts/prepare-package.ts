import { writeFileSync, readFileSync, copyFileSync, mkdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const PKG_DIR = join(ROOT, 'pkg');

// 1. 创建发布临时目录 pkg/
mkdirSync(PKG_DIR, { recursive: true });

// 2. 读取并剥离依赖，生成发布 Manifest
const originalPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const BUNDLED_DEPENDENCIES = new Set(['@bat/shared', 'decode-ico']);
const dependencies = { ...originalPkg.dependencies };
for (const dep of BUNDLED_DEPENDENCIES) {
	delete dependencies[dep];
}

const publishManifest = {
	...originalPkg,
	main: './dist/cli.js',
	dependencies,
};
delete publishManifest.devDependencies;
delete publishManifest.scripts;
delete publishManifest.types;

// 写入干净的 package.json
writeFileSync(join(PKG_DIR, 'package.json'), JSON.stringify(publishManifest, null, 2) + '\n');

// 3. 拷贝必需的文件与目录
const filesToCopy = ['README.md', 'LICENSE'];
for (const file of filesToCopy) {
	copyFileSync(join(ROOT, file), join(PKG_DIR, file));
}

const dirsToCopy = ['dist', 'skills', 'prompts', 'examples'];
for (const dir of dirsToCopy) {
	cpSync(join(ROOT, dir), join(PKG_DIR, dir), { recursive: true });
}

console.log('✓ [Prepare] Release package compiled successfully inside ./pkg');
