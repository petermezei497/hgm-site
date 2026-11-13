# Site search — design

Date: 2026-11-09
Status: draft, awaiting owner review

## Goal

Help readers **find posts by keyword** across ~100 English and Hungarian posts. Today there is no search, no tags and no related posts; the only way in is the chronological list.

Secondary goal: the owner learns modern static-site tooling (npm, build pipelines, CI, end-to-end testing).

## Decisions made during brainstorming

- Reader value first; technology chosen per feature (React not required).
- Search tool: **Pagefind** (static search, index built at deploy time, runs in the browser).
  Rejected: PaperMod's built-in Fuse.js search (titles only, no snippets, downloads all content, no Hungarian word-ending handling); hosted search such as Algolia (external account/API keys, overkill at this size).
- Automated tests: **Playwright** end-to-end tests, runnable locally with one command; GitHub Actions calls the same command.
- Not using `act` (local GitHub Actions simulator): unnecessary when CI only calls local commands.

## Reader experience

- A **Search** page per language: `/en/search/` and `/hu/search/`, linked in the main menu (`Search` / `Keresés`) after Core Ideas.
- Results appear as you type: title, snippet with matched words highlighted, link to the page.
- Each language searches only its own content (Pagefind separates indexes by the page's `<html lang>`, which PaperMod sets to `en` / `hu`).
- Indexed: posts, lessons (Core Ideas) and About. Not indexed: menus, footers, list/section pages, the search page itself.
- Search UI matches the theme, including dark mode.
- If search cannot load in the browser, the page shows a short "search unavailable" message; with JavaScript disabled, a `<noscript>` message. If nothing matches, a "no results" message.

## Architecture

Build pipeline (Netlify and local are identical):

```
hugo --gc --minify  →  public/  →  index step (Pagefind)  →  public/pagefind/  →  publish public/
```

Repo changes:

| File | Change |
|---|---|
| `package.json` + `package-lock.json` | New. Pins exact versions of `pagefind` and `@playwright/test`. Defines npm scripts (below). |
| `scripts/build-search-index.mjs` | New. Runs Pagefind via its Node API over `public/`, prints the page count, and **exits with an error if fewer than 100 pages were indexed** (current total 123). It counts pages actually indexed (from `pagefind-entry.json`), not HTML files processed. This is the in-build safety check. |
| `layouts/_default/single.html` | New override: copy of PaperMod's template with `data-pagefind-body` added to the post content element, so only real writing is indexed and pages without it (lists, search) are skipped. |
| `layouts/_default/pagefind.html` | New template with Pagefind's UI. Deliberately not `search.html`: PaperMod's head partial loads Fuse.js and downloads the full-text `index.json` for any page with `layout: search`. |
| `content/en/search.md`, `content/hu/search.md` | New pages using `layout: "pagefind"`. |
| `scripts/write-version.mjs` | New. Writes `public/version.txt` (Netlify's `COMMIT_REF`) so CI can tell which commit is live. |
| `i18n/en.yaml`, `i18n/hu.yaml` | New. Fallback strings (`search_unavailable`, `search_requires_js`). |
| `hugo.toml` | Add the Search menu entry per language. Remove the `JSON` home output (only the old Fuse.js search used `index.json`). |
| `netlify.toml` | Build command → `npm run build`. Add `'wasm-unsafe-eval'` to the CSP `script-src` (Pagefind runs as WebAssembly). Pin `HUGO_VERSION = "0.154.3"` (matches local) and `NODE_VERSION = "24"` in `[build.environment]` so Netlify, CI and local use the same versions. The `/*.js` and `/*.css` immutable-cache rules were removed: Pagefind's files are not fingerprinted; Hugo's are under `/assets/`, which keeps its rule. |
| `tests/search.spec.ts`, `playwright.config.ts` | New. End-to-end tests (below). |
| `.github/workflows/e2e.yml` | New. CI workflow (below). |
| `.gitignore` | Add `node_modules/`, Playwright reports/results. |
| `CLAUDE.md` | Update commands, build pipeline and testing sections. |

npm scripts:

| Command | Does |
|---|---|
| `npm run build` | `hugo --gc --minify` then `scripts/build-search-index.mjs`. Used by Netlify. |
| `npm run preview` | Build, then serve `public/` locally so search works (the `hugo server` live preview does not run Pagefind). |
| `npm test` | Playwright tests. Default target: a local build that Playwright starts automatically. With `BASE_URL=<url>`: tests that URL instead (deploy preview or live site). |

Local prerequisite: Node.js 24 via Homebrew (`brew install node@24`), then `npm install` and `npx playwright install chromium` once.

## Testing

**Layer 1 — build safety check.** `build-search-index.mjs` fails the build if the index has fewer than 100 pages. A failed Netlify build never replaces the live site.

**Layer 2 — Playwright end-to-end tests** (Chromium only, to keep runs fast):

1. English search page loads and shows a search box.
2. Query `trust` on `/en/search/` returns "Trust as an economic force".
3. Query `bizalom` on `/hu/search/` returns "A bizalom mint gazdasági erő".
4. Hungarian word endings: the inflected form `bizalmat` (not a prefix extension of `bizalom`) on `/hu/search/` returns at least one result.
5. Language separation: `bizalom` on `/en/search/` returns no results (the word appears in no English page).
6. A nonsense query (`qqqqwwww`) shows the no-results message.
7. Menu: the Search link is present on the English and Hungarian home pages and leads to the right search page.
8. Only content pages (posts, lessons, About) appear in results.
9. The search pages load no legacy search (no `index.json` request) and raise no JS errors.

Also covered: the Hungarian UI, the "search unavailable" fallback, and phone width.

On failure Playwright keeps a trace and screenshot; in CI they are uploaded as a downloadable artifact.

**CI (GitHub Actions, `.github/workflows/e2e.yml`).**
- Production: on push to `main` the workflow polls `/version.txt` on the live site until it matches the commit, then runs `npm test` against it.
- PR previews: the workflow triggers on `pull_request` (opened, synchronize, reopened; base `main`), polls `https://deploy-preview-<PR number>--hgm-site.netlify.app/version.txt` until it equals the PR head SHA, then runs `npm test` against the preview; the result shows as a check on the pull request.
- Manual: `workflow_dispatch` with a `base_url` input.

Testing deployed URLs (not a copy built inside GitHub) means tests see the real Netlify headers, including the Content-Security-Policy — the main risk in this feature.

Optional, owner's choice after this ships: enable branch protection on `main` requiring the e2e check, so failing pull requests cannot be merged.

Cost: GitHub Actions is free for public repositories. Deploy previews use Netlify free-tier build minutes; local testing before pushing keeps that low.

## Workflow for this feature

Work on branch `feature/site-search` → pull request → Netlify deploy preview → tests pass → merge to `main` → production deploy → post-deploy tests.

## To verify

- Hungarian stemming: verified. `bizalmat` returns results on `/hu/search/`, so inflected forms match.
- Hungarian UI: verified. Pagefind UI text is localized on `/hu/search/`.
- Netlify `deployment_status` for PR previews: resolved. Netlify creates no GitHub deployments, so the event never fires; the polling fallback (`pull_request` trigger + preview `version.txt`) was adopted.

## Out of scope

Tags/topics, related posts, linking posts to Core Ideas, linking EN/HU translations, analytics. Candidates for later features.
