---
name: bat-submit
description: Submit an AI tool to BAT AI Tools (bataitools.com) via bat-cli CLI. Use a continuous 3-phase workflow — English, translate, then pack and submit.
agent_created: true
triggers:
    - submit AI tool to bataitools
    - bat-cli submit
    - 提交 AI 工具到 bataitools
    - publish to BAT AI Tools directory
    - add tool to bataitools.com
---

# BAT AI Tools — Submit Skill

Submit or update an AI tool listing on [bataitools.com](https://bataitools.com) using the `bat-cli` command-line tool. The workflow always runs in **3 sequential phases** without pausing for user confirmation between them.

## Prerequisites

1. **Install bat-cli:**
    ```bash
    npm install -g @bataitools/bat-cli
    # or
    bun add -g @bataitools/bat-cli
    ```
2. **Authenticate** (pick one):
    - Guest (auto-created on first submit): `bat-cli login-guest`
    - Formal account (OAuth, like `gh auth login`): `bat-cli login`
    - API key (CI): `bat-cli login <your-api-key>`
3. API endpoint default: `https://api.bataitools.com` (override via `BAT_API_URL`)

---

## Core Rule: Never generate all languages in one step

Large single-file JSON causes truncation and validation failures. Always run the 3 phases back-to-back:

| Phase                | What happens                                                           | Output                                                             |
| -------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **1. English**       | Crawl site, fill `base.json` + `i18n/en.json`, fetch logo + screenshot | `base.json`, `i18n/en.json`, `logo.webp`, `website-screenshot.png` |
| **2. Translate**     | Translate `en.json` into 27 other languages (batches of 3–4)           | `i18n/zh.json`, `i18n/ja.json`, … (28 total)                       |
| **3. Pack & Submit** | Merge, validate, upload assets, POST                                   | `submit.bundle.json`, submission confirmed                         |

---

## Per-site directory isolation (mandatory)

Every website gets its own directory keyed by URL hostname (lowercased only — no stripping `www`).

```bash
bat-cli site-dir https://www.Example.com   # → ./submits/www.example.com
bat-cli init-site --website https://www.Example.com
```

Throughout this skill, `<submit-dir>` = `./submits/<hostname>`, e.g. `./submits/www.example.com`.

**Never write site B's data into site A's directory.** Always call `bat-cli site-dir <url>` per site.

---

## Multiple sites

When the user lists N websites, process **one site at a time** — full Phase 1→2→3 per site before starting the next. Never batch-crawl or batch-translate across sites.

---

## Phase 1 — English only

See `references/01-generate-en.md` for the complete crawl checklist, field guides, and voice rules.

**Steps:**

```bash
bat-cli init-site --website <url>
bat-cli schema en
bat-cli capture-screenshot --website <url> --dir <submit-dir>
bat-cli fetch-logo --url <absolute-logo-url> --dir <submit-dir>
```

Then write:

- `<submit-dir>/base.json` — shared metadata (links, social, developer identity, taxonomy)
- `<submit-dir>/i18n/en.json` — English text fields only

Validate and continue immediately:

```bash
bat-cli validate-phase1 <submit-dir>
# → proceed to Phase 2 without waiting
```

**Key rules:**

- Taxonomy codes (`categorys`, `tags`, `audiences`) must come from `bat-cli schema en` — never invent
- `website` must be canonical URL without query parameters
- `social` object must always include all 8 keys (`email`, `twitter`, `facebook`, `linkedin`, `instagram`, `youtube`, `tiktok`, `github`); use `""` when not found, never omit keys
- Do **not** set `logo` or `websiteScreenshot` in `base.json` during Phase 1 (local files upload automatically at pack/submit)
- Developer fields: extract `developerName` first (verbatim maker name from site); derive `developerType` only from that name; `""` when not found — never guess

---

## Phase 2 — Translate from English

See `references/02-translate-i18n.md` for localization rules, priceNote rules, and examples.

All 28 languages required: `en zh tw es ar id pt fr ja ru de ko tr vi it nl pl th hi uk fa bn ur sv no da fi he`

Run `bat-cli schema` to fetch the current list from the API.

**Translate in batches of 3–4 languages per LLM call:**

1. `zh`, `tw`, `ja`, `ko`
2. `de`, `fr`, `it`, `nl`
3. `es`, `pt`, `ru`, `tr`
4. `ar`, `vi`, `id`, `th`
5. `hi`, `bn`, `ur`, `fa`
6. `pl`, `uk`
7. `sv`, `no`, `da`, `fi`, `he`

**Key rules:**

- Read only `i18n/en.json` as source — never re-crawl
- Keep array lengths identical to `en.json`
- Never translate `chargeType` values, JSON keys, URLs, or taxonomy slugs
- `priceNote`: translate period/label words only (`month`→`月`); keep currency symbols and amounts unchanged (`$19 /month` → `$19 /月`)
- Localize naturally — rewrite for fluency, not word-for-word

---

## Phase 3 — Pack and Submit

`bat-cli submit` auto-detects new vs update by checking if `website` is already listed.

```bash
bat-cli pack <submit-dir> -o <submit-dir>/submit.bundle.json
bat-cli validate -f <submit-dir>/submit.bundle.json
bat-cli submit -f <submit-dir>/submit.bundle.json
# or one-step from directory:
bat-cli submit --dir <submit-dir>

# Check submission status:
bat-cli status --id <submitId>
```

At `pack` / `submit --dir`: if `base.json` has no remote asset URLs, the CLI uploads local `logo.webp` and `website-screenshot.png` to CDN and writes the URLs back to `base.json`. Already-set remote URLs skip the upload.

---

## Reference files

- `references/01-generate-en.md` — Full Phase 1 crawl checklist, `base.json` field guide, `i18n/en.json` field guide, voice rules, pricing tier guide, developer identity rules
- `references/02-translate-i18n.md` — Full Phase 2 localization rules, batching strategy, `priceNote` translation rules with examples
