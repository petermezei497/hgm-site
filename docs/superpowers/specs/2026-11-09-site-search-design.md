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
| `scripts/build-search-index.mjs` | New. Runs Pagefind via its Node API over `public/`, prints the page count, and **exits with an error if fewer than 100 pages were indexed** (current total ≈125). This is the in-build safety check. |
| `layouts/_default/single.html` | New override: copy of PaperMod's template with `data-pagefind-body` added to the post content element, so only real writing is indexed and pages without it (lists, search) are skipped. |
| `layouts/_default/search.html` | New override replacing PaperMod's Fuse.js search template with Pagefind's UI. |
| `content/en/search.md`, `content/hu/search.md` | New pages using `layout: "search"`. |
| `hugo.toml` | Add the Search menu entry per language. |
| `netlify.toml` | Build command → `npm run build`. Add `'wasm-unsafe-eval'` to the CSP `script-src` (Pagefind runs as WebAssembly). Pin `HUGO_VERSION = "0.154.3"` (matches local) and `NODE_VERSION = "24"` in `[build.environment]` so Netlify, CI and local use the same versions. |
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

Local prerequisite: Node.js via Homebrew (`brew install node`), then `npm install` and `npx playwright install chromium` once.

## Testing

**Layer 1 — build safety check.** `build-search-index.mjs` fails the build if the index has fewer than 100 pages. A failed Netlify build never replaces the live site.

**Layer 2 — Playwright end-to-end tests** (Chromium only, to keep runs fast):

1. English search page loads and shows a search box.
2. Query `trust` on `/en/search/` returns "Trust as an economic force".
3. Query `bizalom` on `/hu/search/` returns "A bizalom mint gazdasági erő".
4. Hungarian word endings: an inflected form (e.g. `bizalomról` or `bizalmat`) on `/hu/search/` returns at least one result. Exact word confirmed against the built index during implementation.
5. Language separation: `bizalom` on `/en/search/` returns no results (the word appears in no English page).
6. A nonsense query shows the no-results message.
7. Menu: the Search link is present on the English and Hungarian home pages and leads to the right search page.

On failure Playwright keeps a trace and screenshot; in CI they are uploaded as a downloadable artifact.

**CI (GitHub Actions, `.github/workflows/e2e.yml`).** Triggered by GitHub `deployment_status` events that Netlify sends when a deploy finishes successfully:
- Deploy preview of a pull request → run `npm test` with `BASE_URL` = the preview URL. The result shows as a check on the pull request.
- Production deploy of `main` → run the same tests against the live site, as a post-deploy check.

Testing deployed URLs (not a copy built inside GitHub) means tests see the real Netlify headers, including the Content-Security-Policy — the main risk in this feature.

Optional, owner's choice after this ships: enable branch protection on `main` requiring the e2e check, so failing pull requests cannot be merged.

Cost: GitHub Actions is free for public repositories. Deploy previews use Netlify free-tier build minutes; local testing before pushing keeps that low.

## Workflow for this feature

Work on branch `feature/site-search` → pull request → Netlify deploy preview → tests pass → merge to `main` → production deploy → post-deploy tests.

## To verify during implementation

- Pagefind's Hungarian stemming support (test 4). If unsupported, drop test 4 and note it here.
- Netlify reports `deployment_status` events to GitHub for this site. If not, the workflow falls back to polling the predictable preview URL for the pull request.
- Pagefind UI text appears in Hungarian on `/hu/search/`; if a translation is missing, supply the strings in the search template.

## Out of scope

Tags/topics, related posts, linking posts to Core Ideas, linking EN/HU translations, analytics. Candidates for later features.
