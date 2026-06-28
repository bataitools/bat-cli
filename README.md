# @bataitools/bat-cli

[![npm version](https://img.shields.io/npm/v/@bataitools/bat-cli.svg?style=flat-square)](https://www.npmjs.com/package/@bataitools/bat-cli)
[![npm downloads](https://img.shields.io/npm/dm/@bataitools/bat-cli.svg?style=flat-square)](https://www.npmjs.com/package/@bataitools/bat-cli)

[BAT AI Tools](https://bataitools.com) — Scoped CLI to submit and publish multi-language AI Agents & Skills to the AI Directory Platform.

## Installation

### Global CLI Tool (recommended for users):

```bash
npm install -g @bataitools/bat-cli
# or using bun
bun add -g @bataitools/bat-cli
```

### From Source (for developers):

```bash
git clone https://github.com/bataitools/bat-cli.git
cd bat-cli
bun install
bun run build
```

## Setup

```bash
# Formal account: OAuth device authorization (similar to GitHub CLI `gh auth login`)
bat-cli login

# Or paste API Key directly (CI / Advanced)
bat-cli login <your-api-key>

# Anonymous guest account (no browser required)
bat-cli login guest
```

If no credentials exist locally, the first `submit` or `publish` command will trigger an automatic guest login.

## Per-site Directory

Each website uses an isolated folder `./submits/<host>/` where `<host>` is the URL hostname lowercased only (e.g. `https://WWW.Foo.io` → `./submits/www.foo.io`). Different hosts never share a directory.

```bash
bat-cli site-dir https://www.example.com   # → ./submits/www.example.com
bat-cli init-site --website https://www.example.com
```

## Step-by-Step Workflow (Single Site)

To submit or update an AI tool, follow this step-by-step pipeline. Replace `<submit-dir>` with your site directory (e.g., `./submits/www.example.com`):

### 1. Initialize Site Directory

Generate the required directory structure and draft configuration files for the site:

```bash
bat-cli init-site --website https://www.example.com
```

### 2. Fetch Metadata & Assets

Download the validation schemas for product submissions:

```bash
bat-cli schema
```

Automatically fetch the favicon/logo and take full-page screenshots of the website:

```bash
bat-cli fetch-logo --url https://www.example.com/favicon.ico --dir <submit-dir>
bat-cli capture-screenshot --website https://www.example.com --dir <submit-dir>
```

### 3. Fill Content & Basic Validation

Fill in the basic metadata in `<submit-dir>/base.json` and the English product information in `<submit-dir>/i18n/en.json`. Once filled, perform a local structure check:

```bash
bat-cli validate-phase1 <submit-dir>
```

### 4. Translation & Package Packing

Translate the product details into all 28 required languages (refer to the translation guidelines in `skills/bat-submit/references/` for the workflow). Once translations are ready, pack everything into a single distribution bundle:

```bash
bat-cli pack <submit-dir> -o <submit-dir>/submit.bundle.json
```

### 5. Final Validation & Submission

Perform a final deep validation against the schema, and submit the product to the directory platform:

```bash
# Validate the package bundle locally
bat-cli validate -f <submit-dir>/submit.bundle.json

# Submit the package bundle to the platform
bat-cli submit -f <submit-dir>/submit.bundle.json
# Or directly submit using the directory path
bat-cli submit --dir <submit-dir>
```

**Multiple sites:** repeat the same steps per URL, one site at a time, each in its own `<submit-dir>`.

For detailed guidelines on the **English → Translate → Submit** workflow, refer to the [bat-skills](https://github.com/bataitools/bat-skills) repository.

## AI Agent Skills

We maintain a collection of Agent Skills (instructions and workflows) for AI coding agents (such as Cursor, Claude Code, etc.) in a dedicated repository: [bataitools/bat-skills](https://github.com/bataitools/bat-skills).

### Installation via `npx skills`

You can automatically install the `bat-submit` skill into your local project environment by running:

```bash
npx skills add https://github.com/bataitools/bat-skills --skill bat-submit
```

This will download and configure the skill in your local AI directories (such as `.cursor/skills/`), allowing your AI assistant to assist you with the submission workflow.

## Publishing (for maintainers)

We use OIDC (Trusted Publisher) for publishing new versions via GitHub Actions automatically.

### Automated Release (Recommended)

1. Bump the package version and generate the `CHANGELOG.md`:
    ```bash
    bun run release
    ```
2. Push the generated git tags to GitHub:
    ```bash
    git push --follow-tags
    ```
3. The GitHub Actions workflow will trigger automatically and publish the package to npmjs.com using OIDC (Trusted Publisher).

### Local Verification (Dry Run)

If you need to inspect the compiled release package locally without publishing:

1. Build the project and assemble the release assets into the temporary `./pkg` folder:
    ```bash
    bun run build:pkg
    ```
2. Verify the package output structure locally:
    ```bash
    cd pkg
    npm pack --dry-run
    ```
