# Phase 2 — Translate from English

**Prerequisite:** Phase 1 completed (`base.json` + `i18n/en.json` + local `logo.webp` and `website-screenshot.png`, or remote URLs in `base.json`) and `bat-cli validate-phase1` passed.

Read **only** `<submit-dir>/i18n/en.json`. Translate text fields into other languages. Write **one file per language** under `<submit-dir>/i18n/`.

Do **not** capture or upload screenshots per language — one website screenshot (local file or `websiteScreenshot` in `base.json`) is shared by all languages. Upload to CDN happens at `pack` / `submit`, not during translation.

## Target languages — all required (28 total)

`en` plus:

`zh, tw, es, ar, id, pt, fr, ja, ru, de, ko, tr, vi, it, nl, pl, th, hi, uk, fa, bn, ur, sv, no, da, fi, he`

**Every language above must be present** before `bat-cli validate` / `submit` will pass.

Run `bat-cli schema` to fetch the current list from the API.

## Recommended batching (stability)

Translate in batches of **3–4 languages per LLM call**, not all at once:

1. Batch A: `zh`, `tw`, `ja`, `ko`
2. Batch B: `de`, `fr`, `it`, `nl`
3. Batch C: `es`, `pt`, `ru`, `tr`
4. Batch D: `ar`, `vi`, `id`, `th`
5. Batch E: `hi`, `bn`, `ur`, `fa`
6. Batch F: `pl`, `uk`
7. Batch G: `sv`, `no`, `da`, `fi`, `he`

Each batch output: separate files `i18n/zh.json`, `i18n/ja.json`, etc.

## Localization — rewrite for the target language (not word-for-word)

**Yes — natural localization reads better than literal translation.** Your job is to produce copy a native speaker would write on a product page in that language, not an English sentence with words swapped.

> **Note:** Non-English text in the tables below is **expected target-locale output** (e.g. `zh.json`, `ja.json`), not instruction language. Instructions in this file stay in English.

| Do                                                                                                    | Don't                                                  |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Rewrite sentence structure for natural word order in the target language                              | Translate English idiom word-by-word                   |
| Use common product/SaaS phrasing locals expect (pricing labels, CTA tone, FAQ style)                  | Keep awkward calques ("利用…的力量", "无缝的工作流程") |
| Split or merge sentences when the target language reads better that way                               | Mirror English punctuation and clause length slavishly |
| Adapt `tagline` / `seo.title` to local SEO habits (shorter for `ja`/`zh`, natural compounds for `de`) | Expand into new claims or hype not in `en.json`        |

**Faithful ≠ literal.** Preserve **meaning and facts** from `en.json`; **surface form** should be native.

### Must stay identical across all locales (never "localize away")

- Numbers, limits, file formats, integration names (`PNG`, `STL`, `Slack`, `API`)
- Brand / product `name` (unless the site officially uses a localized brand name — rare)
- `chargeType` values (`free`, `recurring`, `flat`, `contact`)
- Currency symbols and amounts in `priceNote` (localize period words only — see below)
- Array lengths and JSON structure
- Factual claims — do not add benefits; do not remove limits stated in English

### Voice (carry over from Phase 1)

Keep the same **factual, plain** tone as `en.json`. Natural rewrite is encouraged; marketing fluff is not. Do not add superlatives or AI-isms that are not in the English source.

### Literal vs natural — examples

**Tagline** — `en`: `"Convert PNG and JPG images to STL files for 3D printing"`

| ❌ Literal (zh)                                 | ✅ Natural (zh)                   |
| ----------------------------------------------- | --------------------------------- |
| 将 PNG 和 JPG 图像转换为用于 3D 打印的 STL 文件 | 把 PNG/JPG 转成 3D 打印可用的 STL |

**Feature** — `en`: `"Exports watertight STL meshes; height scale from 0.1× to 10×"`

| ❌ Literal (ja)                                               | ✅ Natural (ja)                                |
| ------------------------------------------------------------- | ---------------------------------------------- |
| 水密の STL メッシュをエクスポート；高さスケール 0.1× から 10× | 水密 STL メッシュを出力。高さ倍率は 0.1〜10 倍 |

**FAQ answer** — rewrite as a native help-doc answer, not English clause order.

**`developerName`**: keep as on site (often Latin script); do not transliterate company names unless the English source already does.

## What to translate

Translate all string text in:

- `name`, `tagline`, `description`, `instruction`
- `developerName` — only if non-empty in `en.json`; otherwise keep `""` in all languages (do not invent)
- `coreFeatures[].title`, `coreFeatures[].description`
- `useCases[]` (if string items)
- `pricing[].priceNote` — **partial translation** (see rules below)
- `pricing[].features[]`
- `faqs[].question`, `faqs[].answer`
- `seo.title`, `seo.description`

### `priceNote` translation rules

Translate **billing period words and labels only**. **Never change currency symbols, amounts, or digits.**

| ✅ Translate                                  | ❌ Do NOT translate                    |
| --------------------------------------------- | -------------------------------------- |
| `month` → `月`, `year` → `年`                 | `$19`, `￥20`, `€9`, `£29`             |
| `one-time` → `一次性`                         | Any numeric amount (`19`, `59`, `199`) |
| `Free` → `免费` (when `chargeType` is `free`) | Currency codes (`USD`, `CNY`)          |
| `/month` → `/月`, `/year` → `/年`             | Decimal separators in prices (`19.99`) |
| `Contact sales` → localized equivalent        |                                        |

**Examples (zh):**

| `en.json`         | `zh.json`      |
| ----------------- | -------------- |
| `"$19 /month"`    | `"$19 /月"`    |
| `"$29 /month"`    | `"$29 /月"`    |
| `"$59 one-time"`  | `"$59 一次性"` |
| `"Free"`          | `"免费"`       |
| `"Contact sales"` | `"联系销售"`   |

Each `priceNote` must still be a non-empty string (max 100 chars).

## What NOT to translate or change

- JSON keys
- Array lengths (must match `en.json` exactly)
- URLs, emails, product names that are proper nouns (keep brand name consistent)
- `chargeType` in each `pricing[]` item (must match `en.json` exactly)

## Per-file output shape

Each `i18n/<lang>.json` has the **same structure** as `i18n/en.json`, only with translated text.

## After all languages

```bash
bat-cli pack <submit-dir> -o <submit-dir>/submit.bundle.json
bat-cli validate -f <submit-dir>/submit.bundle.json
bat-cli submit -f <submit-dir>/submit.bundle.json
```
