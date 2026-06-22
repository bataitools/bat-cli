---
name: bat-submit
description: Submit an AI tool to BAT AI Tools (bataitools.com) via bat-cli CLI. Use a continuous 3-phase workflow — English, translate, then pack and submit.
---

# BAT AI Tools — Agent Submit Skill

## Prerequisites

1. Install `bat-cli` CLI from the `bat-cli` package
2. **Authentication** (pick one):
   - **Guest (device):** `bat-cli login-guest` — or any submit command auto-creates a guest on first run (`login guest` alias)
   - **Formal account:** `bat-cli login` — OAuth device authorization at `/handshake/device` (like `gh auth login`); or `bat-cli login <api-key>`
3. API default `https://api.bataitools.com` (override via `BAT_API_URL` or `login --api`)


## Critical: do NOT generate all languages in one JSON

Large single-file JSON causes truncation and validation failures. Always use **3 sequential phases** — run them back-to-back without pausing for user confirmation:

| Phase | What | Output |
|-------|------|--------|
| **1. English** | Read website, taxonomy, logo, screenshot | `base.json` + `i18n/en.json` + `logo.webp` + `website-screenshot.png` |
| **2. Translate** | Translate from `i18n/en.json` only | `i18n/zh.json`, `i18n/ja.json`, … |
| **3. Submit** | Merge and POST once | `bat-cli pack` → `submit` → `publish` |

## Per-site directory (mandatory — A must not overwrite B)

**Every website gets its own directory keyed by URL host.** Isolation prevents site A's data from overwriting site B's.

```bash
bat-cli site-dir https://www.Example.com
# → ./submits/www.example.com

bat-cli init-site --website https://www.Example.com
# scaffolds ./submits/www.example.com/base.json + i18n/en.json
```

- Root: `./submits/` (override with `--root` on `site-dir` / `init-site`)
- Segment: URL `hostname` **lowercased only** — no stripping `www`, no other normalization
- Bundle output: inside that site dir, e.g. `./submits/www.example.com/submit.bundle.json`
- Re-running `init` / `init-site` on the **same** host overwrites that site's templates (OK for update / re-scaffold)

Throughout this skill, `<submit-dir>` means the directory for **one** site, e.g. `./submits/www.example.com`.

---

## Multiple sites in one user prompt

When the user lists **N websites**, treat each site exactly like a single-site job — **one site at a time, same phases, isolated directory**:

1. Parse all URLs from the prompt; do **not** batch-crawl or batch-translate multiple sites in one step.
2. For site 1: `init-site` → Phase 1 → Phase 2 → Phase 3 → done.
3. Only then start site 2 in its own `./submits/<host-2>/`, and so on.
4. **Never** write site B into site A's directory — resolve `<submit-dir>` with `bat-cli site-dir <url>` every time.

Single site and multi-site differ only in **how many times** you repeat the loop — not in steps per site.

---

## Phase 1 — English only

1. `bat-cli init-site --website <url>` (or `bat-cli init <submit-dir>` if dir is already known)
2. `bat-cli schema en`
3. `bat-cli capture-screenshot --website <url> --dir <submit-dir>` — saves `<submit-dir>/website-screenshot.png` locally (no upload)
4. Find logo URL on site; `bat-cli fetch-logo --url <absolute-logo-url> --dir <submit-dir>` — saves `<submit-dir>/logo.webp` (256×256 webp, no upload)
5. Read the user's website; write **only**:
   - `<submit-dir>/base.json` — shared fields including **full** `links` (login/register/about/pricing) and `social` (email + 7 profiles); use `""` for not found, never omit keys. Omit `logo` / `websiteScreenshot` unless user provided custom CDN URLs.
   - `<submit-dir>/i18n/en.json` — English text fields only
6. `bat-cli validate-phase1 <submit-dir>` — if it passes, **immediately continue to Phase 2** in the same run

See `prompts/01-generate-en.md` for the full crawl checklist (login/register URLs, footer socials, pricing page, etc.).

**Developer fields**: set `developerName` first (strict — no product names, no domains); derive `developerType` only from that name (`company` / `team` / `individual`); all four may be `""` if not disclosed. See `prompts/01-generate-en.md`.

**Copy voice**: extract tagline/features/FAQs from the site — factual and specific; no generic AI marketing language. See *Writing voice* in `prompts/01-generate-en.md`.

See `prompts/01-generate-en.md`. Write **only** English files in this phase — then proceed to Phase 2 without waiting.

---

## Phase 2 — Translate from English

1. Read `<submit-dir>/i18n/en.json` as the **sole source**
2. Translate text fields into other languages
3. Write **one file per language**: `<submit-dir>/i18n/zh.json`, `<submit-dir>/i18n/ja.json`, …
4. Translate in **batches of 3–4 languages** per LLM call (not all at once)

**All 28 languages are required** (en + 27). Run `bat-cli schema` for the live list from the API.

- Keep array lengths identical to `en.json`
- Do not translate category/tag/audience slugs (they live in `base.json`)
- Do not translate URLs, emails, or `chargeType` values
- **Localize, don't literal-translate** — rewrite for native fluency; keep facts/numbers/brand names unchanged (see `prompts/02-translate-i18n.md`)
- `priceNote`: translate period/label words only (`month` → localized period word in target language); keep currency symbols and amounts unchanged (`$19` stays `$19`)
- **Do not capture or upload per-language screenshots** — one website screenshot (local file or `websiteScreenshot` URL) is shared by all languages

See `prompts/02-translate-i18n.md`.

---

## Phase 3 — Pack and submit

`bat-cli submit` **auto-detects** new vs update by `website` in the bundle:
- not listed → `SUBMIT_AGENT` (new)
- already listed → `UPDATE_AGENT` (update)

Same commands for both:

```bash
bat-cli pack <submit-dir> -o <submit-dir>/submit.bundle.json
bat-cli validate -f <submit-dir>/submit.bundle.json
bat-cli submit -f <submit-dir>/submit.bundle.json
# or one step from directory (uploads local screenshot if base.json has no remote URL):
bat-cli submit --dir <submit-dir>
bat-cli status --id <submitId>
```

At `pack` / `submit --dir`, if `base.json` has no remote asset URLs, the CLI uploads local `logo.webp` and `website-screenshot.png` and writes CDN URLs back to `base.json`. If remote URLs are already set, upload is skipped (clear the field and replace the local file to re-upload).

---

## Logo & screenshot rules

- **Logo** — Phase 1: `bat-cli fetch-logo --url <url> --dir <submit-dir>` → `<submit-dir>/logo.webp` (256×256 webp, aligned with bat-crawl)
- **Screenshot** — Phase 1: `bat-cli capture-screenshot --website <url> --dir <submit-dir>` → `<submit-dir>/website-screenshot.png`
- Phase 3: `pack` / `submit --dir` uploads local files **only when** `base.json` has no remote `logo` / `websiteScreenshot` URL
- User may replace local files manually, or set custom `https://...` URLs in `base.json` to skip upload
- Do **not** use `screenshots[lang]` or per-language screenshot uploads

## Rules

- Taxonomy codes only from `bat-cli schema`
- `website` must not include query parameters
- Never skip Phase 1/2 and dump one giant `submit.json` with all languages at once
- Run Phase 1 → Phase 2 → Phase 3 continuously — do not pause for user confirmation between phases
- Never reuse or overwrite another site's `<submit-dir>` — always `bat-cli site-dir <url>` per site

## Prompt reference

- `prompts/01-generate-en.md` — Phase 1
- `prompts/02-translate-i18n.md` — Phase 2
