# @bataitools/bat-cli

Submit AI tools to [BAT AI Tools](https://bataitools.com) via CLI or Cursor Skill — multi-language, zero platform crawl.

## Install

```bash
cd bat-cli && bun install && bun run build
```

Or link globally from monorepo root after `bun install`.

## Setup

```bash
# 正式账号：OAuth 设备授权（同 GitHub CLI `gh auth login`）
bat-cli login

# 或直接粘贴 API Key（CI / 高级）
bat-cli login <your-api-key>

# 匿名设备账号（无需浏览器）
bat-cli login-guest
# 别名: bat-cli login guest
```

首次 `submit` / `publish` 若无本地凭证也会自动 guest 登录。

## Per-site directory

Each website uses an isolated folder `./submits/<host>/` where `<host>` is the URL hostname lowercased only (e.g. `https://WWW.Foo.io` → `./submits/www.foo.io`). Different hosts never share a directory.

```bash
bat-cli site-dir https://www.example.com   # → ./submits/www.example.com
bat-cli init-site --website https://www.example.com
```

## Commands (single site)

Replace `<submit-dir>` with e.g. `./submits/www.example.com`:

```bash
bat-cli init-site --website https://www.example.com
bat-cli schema
bat-cli capture-screenshot --website https://www.example.com --dir <submit-dir>
bat-cli fetch-logo --url https://www.example.com/favicon.ico --dir <submit-dir>
# ... fill base.json + i18n/en.json
bat-cli validate-phase1 <submit-dir>
# ... translate all 28 required languages, then pack and submit
bat-cli pack <submit-dir> -o <submit-dir>/submit.bundle.json
bat-cli validate -f <submit-dir>/submit.bundle.json
bat-cli submit -f <submit-dir>/submit.bundle.json
# or: bat-cli submit --dir <submit-dir>
```

**Multiple sites:** repeat the same steps per URL, one site at a time, each in its own `<submit-dir>`. See `skills/bat-submit/SKILL.md`.

See `prompts/01-generate-en.md` and `prompts/02-translate-i18n.md` for the **English → translate → submit** workflow.

## Cursor Skills

Each skill lives in its own subdirectory under `skills/`:

| Skill | Path | Use when |
|-------|------|----------|
| Product submit | `skills/bat-submit/SKILL.md` | Submit or update an AI tool listing |

Reference in Cursor via `@bat-cli/skills/bat-submit/SKILL.md`, or symlink into your project:

```text
.cursor/skills/bat-submit/SKILL.md  →  bat-cli/skills/bat-submit/SKILL.md
```

Add future skills as `skills/<skill-name>/SKILL.md` (e.g. `skills/bat-traffic/SKILL.md`).

## Architecture

- **bat-cli** (this package): CLI + Skill + prompts — independently distributable
- **bat-worker/src/agent/**: `/bat/agent/*` API backend

## Publish to npm (maintainers)

Automated publish via `bun run release:prod` often fails silently (missing npm auth, or `workspace:*` deps in the tarball). Use the dedicated script instead.

### Prerequisites

1. npm account with publish access to `@bataitools` scope
2. Log in once per machine:

```bash
npm login --registry=https://registry.npmjs.org/
# or: bunx npm login
npm whoami   # verify
```

### Manual publish

From repo root or `bat-cli/`:

```bash
cd bat-cli

# Dry-run (pack only, no upload)
bun run publish:npm:dry-run

# Publish current version in package.json
bun run publish:npm

# Bump patch/minor, then publish
bun run publish:npm -- --patch
bun run publish:npm -- --minor
```

The script will:

1. Run `bun run build` (bundles `@bat/shared` + `decode-ico` into `dist/cli.js`)
2. Strip monorepo-only dependencies from the publish manifest
3. Run `bun publish --access public`
4. Restore `package.json` (keeping version if `--patch` / `--minor` was used)

After a successful publish, commit the version bump:

```bash
git add bat-cli/package.json
git commit -m "chore(agent): release @bataitools/bat-cli vX.Y.Z"
```

### Why not rely on release:prod alone?

`scripts/deploy.ts` calls `bun publish` directly but does not fix the publish manifest. The tarball would still declare `"@bat/shared": "workspace:*"`, which npm cannot resolve for end users. Use `publish:npm` for agent releases until the deploy pipeline is updated to call this script.
