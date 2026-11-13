# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Human Growth Model" — a personal bilingual (English / Hungarian) blog, live at https://www.human-growth-model.xyz/. Static site built with **Hugo** + the **PaperMod** theme, hosted on **Netlify**. The owner plans to enhance, develop and possibly replatform it, so keep changes understandable and well-explained (the owner is new to software engineering — see global instructions).

## Commands

```sh
hugo server -D                      # local dev server with live reload (http://localhost:1313), -D includes drafts
npm run build                       # production build (same as Netlify): hugo --gc --minify, then the Pagefind search index into public/pagefind/
npm run preview                     # build + serve public/ on http://localhost:8080 (the only local way to try search)
npm test                            # Playwright search tests (starts `npm run preview` itself)
BASE_URL=https://<deploy-url> npm test  # run the same tests against a deployed site instead
hugo --gc --minify -d <dir>         # Hugo only, elsewhere (no search index) to inspect output without touching public/
hugo new content/en/posts/<file>.md # new post from archetypes/default.md
```

Prerequisite: Node 24 (Homebrew `node@24`, keg-only, on PATH via `~/.zshrc`). One-time setup: `npm install`, then `npx playwright install chromium`. `hugo server` does not run Pagefind, so search doesn't work there.

No linters. Verification = a clean build (watch for `WARN` lines) plus `npm test` (`tests/search.spec.ts`, config in `playwright.config.ts`).

## Deployment

- Push to `main` on GitHub (`petermezei497/hgm-site`) → Netlify runs `npm run build` and publishes `public/`. Deploys go live within a minute or two.
- CI: `.github/workflows/e2e.yml` ("E2E tests") runs `npm test` against the live site on `pull_request` (opened/synchronize/reopened, base `main`), on push to `main` and on manual `workflow_dispatch` (`base_url` input). Netlify creates no GitHub deployments, so there is no `deployment_status`. For PRs and `main` it first polls `<target>/version.txt` (written at build by `scripts/write-version.mjs` from Netlify's `COMMIT_REF`) until it equals the commit under test (PR head SHA, or the pushed SHA), which proves that target is the new build. PR previews are at `https://deploy-preview-<PR number>--hgm-site.netlify.app`.
- `public/` is build output and is gitignored — never commit it.
- `netlify.toml` holds www/https redirects, security headers and the **Content-Security-Policy**. Any new external script, style, font or API (e.g. embeds, comments, analytics) must be allowed there or browsers will block it.
- Versions are pinned in `netlify.toml` `[build.environment]`: `HUGO_VERSION = "0.154.3"` (PaperMod requires ≥ 0.146), `NODE_VERSION = "24"`. Keep local Hugo (Homebrew extended) and Node close to these.
- The CSP `script-src` includes `'wasm-unsafe-eval'` because Pagefind runs WebAssembly in the browser.

## Architecture

- **Config:** single `hugo.toml`. Defines both languages, per-language main menus (Posts, Core Ideas, Search, About, Support) and PaperMod feature flags under `[params]`. `markup.goldmark.renderer.unsafe = true` is required — posts use inline HTML (`<br>` for line breaks).
- **Multilingual:** `contentDir` per language — `content/en/` and `content/hu/`, served under `/en/` and `/hu/` (`defaultContentLanguageInSubdir`). Each language tree has the same sections: `posts/`, `lessons/`, `support/`, `about.md`. Post filenames differ between languages and there are no `translationKey`s, so individual posts are **not** linked as translations of each other; only same-path pages (section indexes, `about.md`) are.
- **Sections:**
  - `posts/` — dated journal entries, sorted by date. Filenames `YYYY-MM-DD-Title.md`. Front matter: `title`, `date`, `draft`, `publishDate`.
  - `lessons/` — the "Core Ideas" series (`slug: "lessons"` in `_index.md`). Ordered by the `weight` front-matter field via the custom `layouts/lessons/list.html`, not by date.
  - `support/` — uses the `rawhtml` shortcode with `.support-grid` / `.support-card` CSS classes.
- **Theme customisation:** `themes/PaperMod/` is vendored (committed directly, not a submodule). Do not edit it; override instead — a file in `layouts/` at the same relative path as one in `themes/PaperMod/layouts/` replaces it. Custom CSS goes in `assets/css/extended/custom.css` (PaperMod auto-bundles everything in `assets/css/extended/`). Current override: `layouts/partials/translation_list.html` is a copy of PaperMod's that skips the `&nbsp;|&nbsp;` separator for the `search` and `pagefind` layouts, because search pages have no meta line before it (re-sync it if PaperMod changes).
- **Search:** Pagefind, built after Hugo by `scripts/build-search-index.mjs` (indexes `public/` into `public/pagefind/`, prints per-language page counts, fails the build below 100 pages). Search pages are `content/{en,hu}/search.md` (layout `pagefind`) → `layouts/_default/pagefind.html` (not named `search`, because PaperMod's head partial loads Fuse.js and its JSON index for the `search` layout), with menu entries at weight 17 and fallback text from `i18n/*.yaml` (`search_unavailable`, `search_requires_js`).
- **Closest-matches notice:** `pagefind.html` adds `<p id="search-notice" role="status">` between the search box and the results (inside Pagefind UI's form, re-attached after each re-render). After a 300 ms debounce it asks the Pagefind JS API for an exact search (`search('"word"')`, a quoted query) for each typed word; words with 0 exact results are named in the notice (`search_closest_matches` i18n), shown only if the normal search still finds results. Stale checks are ignored, errors are swallowed silently.
- **`layouts/_default/single.html`:** a verbatim copy of PaperMod's plus `data-pagefind-body` on `.post-content` and `data-pagefind-meta="title"` on the h1. Only pages rendered through it (posts, lessons, about) are indexed. If PaperMod is updated, re-sync this copy.
- **Shortcode:** `layouts/shortcodes/rawhtml.html` — `{{< rawhtml >}}…{{< /rawhtml >}}` outputs its inner HTML verbatim.

## Gotchas

- `publishDate` in the future hides a post until the site is rebuilt after that time. Netlify only rebuilds on push, so "scheduled" posts don't appear on their own.
- Existing content uses YAML front matter (`---`), but `archetypes/default.md` generates TOML (`+++`) with `draft = true` — remember to flip `draft` before publishing.
- Plausible is allowed in the CSP but no Plausible script is actually included in any template.
- Pagefind matches by prefix in both directions: a query matches longer indexed words (`pap` → `paper`) and also indexed words that are a prefix of the query (`PaperMod` → `paper`, `xqzvkjw` → `X` from "Gen X"). The search page tells the user about this with the closest-matches notice (e.g. `conservative` → co-creating). Pick test queries that can't collide (e.g. `qqqqwwww` for no results).
- Writing style: content is personal, reflective prose; don't edit post text unless asked.
