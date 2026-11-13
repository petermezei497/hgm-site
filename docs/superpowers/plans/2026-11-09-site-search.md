# Site Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-language full-text search (Pagefind) to the Hugo blog, with a build-time index safety check and Playwright end-to-end tests that run locally and in GitHub Actions against Netlify deploys.

**Architecture:** Hugo builds `public/`; a Node script runs Pagefind's Node API over it, writes `public/pagefind/`, and fails the build below 100 indexed pages. A Search page per language (PaperMod `search` layout overridden) loads Pagefind UI. Playwright tests target a local static server by default or any URL via `BASE_URL`; a GitHub Actions workflow runs them on Netlify `deployment_status` success.

**Tech Stack:** Hugo 0.154.3 extended, PaperMod (vendored), Node 24, npm, Pagefind 1.x (Node API + Pagefind UI), Playwright Test (Chromium), GitHub Actions, Netlify.

**Spec:** `docs/superpowers/specs/2026-11-09-site-search-design.md`

## Global Constraints

- All work on branch `feature/site-search`; merge to `main` only via pull request after tests pass, and only with the owner's go-ahead.
- Exact dependency versions in `package.json` (`npm install --save-exact`); commit `package-lock.json`.
- Node 24 everywhere (local `node@24`, Netlify `NODE_VERSION = "24"`, CI `node-version: 24`); Netlify `HUGO_VERSION = "0.154.3"`.
- Never edit files under `themes/PaperMod/`; override in `layouts/`.
- Index safety threshold: fail if fewer than **100** pages indexed.
- Search URLs: `/en/search/`, `/hu/search/`. Menu names: `Search` (en), `Keresés` (hu), weight 17 (after Core Ideas at 15).
- Copy (via Hugo i18n): `search_unavailable` en "Search is currently unavailable." / hu "A keresés jelenleg nem érhető el."; `search_requires_js` en "Search requires JavaScript." / hu "A kereséshez JavaScript szükséges."
- CSP: add `'wasm-unsafe-eval'` to `script-src` in `netlify.toml`; change nothing else in the policy.
- Local preview server: `python3 -m http.server 8080 --directory public` (no extra npm dependency).

## Review Focus

- CSP blocks Pagefind's WebAssembly on Netlify (invisible locally, the Python server sends no headers) → search must still return results on the deploy preview. Pinned by running the whole suite against the preview URL in Task 6/7.
- Hungarian accented queries (`gazdasági`) → should match. Test `accented Hungarian query matches` in Task 3.
- Result links with the `/hu/` / `/en/` prefix → clicking a result must open that post. Assertion in test `hu: bizalom finds the Core Idea and opens it` in Task 3.
- Pagefind assets fail to load (blocked, network) → localized "unavailable" message, not a blank page. Test `shows unavailable message when Pagefind cannot load` in Task 3.
- Phone-width viewport → search box and results usable at 375px. Test `works at phone width` in Task 3.

---

### Task 1: Node tooling and build-time search index with safety check

**Files:**
- Create: `package.json`, `package-lock.json`, `scripts/build-search-index.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: npm scripts `build` (`hugo --gc --minify && node scripts/build-search-index.mjs`) and `preview` (`npm run build && python3 -m http.server 8080 --directory public`). `build-search-index.mjs` reads the site directory from env `SITE_DIR` (default `public`), writes `<SITE_DIR>/pagefind/`, prints `Indexed <n> pages`, exits 1 with `Search index too small: <n> pages (minimum 100)` when `n < 100`, and exits 1 on any Pagefind error.

- [ ] **Step 1: Install Node 24 locally**

Run: `brew install node@24`, then add `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` to `~/.zshrc` and open a new shell.
Expected: `node -v` prints `v24.x`.

- [ ] **Step 2: Create `package.json`**

`"private": true`, `"type": "module"`, `"engines": {"node": ">=24"}`, the two scripts above. Then `npm install --save-exact --save-dev pagefind`.

- [ ] **Step 3: Write the failing check (empty site must fail)**

Run: `SITE_DIR=$(mktemp -d) node scripts/build-search-index.mjs; echo "exit=$?"`
Expected: fails because the script does not exist yet.

- [ ] **Step 4: Implement `scripts/build-search-index.mjs`**

Use the Pagefind Node API: `createIndex()` → `index.addDirectory({ path: SITE_DIR })` (returns `{ errors, page_count }`) → threshold check → `index.writeFiles({ outputPath: SITE_DIR + "/pagefind" })` → `close()`. Check the threshold before writing files.

- [ ] **Step 5: Verify both paths**

Run: `SITE_DIR=$(mktemp -d) node scripts/build-search-index.mjs; echo "exit=$?"`
Expected: `Search index too small: 0 pages (minimum 100)`, `exit=1`.
Run: `npm run build`
Expected: Hugo builds without `WARN`, then `Indexed <n> pages` with n ≥ 100, and `public/pagefind/pagefind-ui.js` exists.

- [ ] **Step 6: Ignore generated folders**

Append to `.gitignore`: `node_modules/`, `playwright-report/`, `test-results/`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json scripts/build-search-index.mjs .gitignore
git commit -m "Add Pagefind index build step with page-count safety check"
```

### Task 2: Playwright setup and failing end-to-end tests

**Files:**
- Create: `playwright.config.ts`, `tests/search.spec.ts`
- Modify: `package.json` (script `test`: `playwright test`; dev dependency `@playwright/test`)

**Interfaces:**
- Consumes: `npm run preview` (Task 1) serving on `http://localhost:8080`.
- Produces: `npm test`. With `BASE_URL` set, tests run against it and no local server starts; otherwise `webServer` runs `npm run preview` on port 8080 (`reuseExistingServer: true`, timeout 120 s). Project: Chromium only. `retries: 1` in CI (`process.env.CI`), `trace: "retain-on-failure"`, `screenshot: "only-on-failure"`, reporter `html` + `list`.
- Pagefind UI selectors the tests rely on: `.pagefind-ui__search-input`, `.pagefind-ui__result-link`, `.pagefind-ui__message`.

- [ ] **Step 1: Install Playwright**

Run: `npm install --save-exact --save-dev @playwright/test && npx playwright install chromium`

- [ ] **Step 2: Write `playwright.config.ts`** per the Interfaces block.

- [ ] **Step 3: Write `tests/search.spec.ts`**

Helper `search(page, path, query)`: goto `path`, fill `.pagefind-ui__search-input` with `query`. Tests (`expect` auto-waits for async results):

```ts
test('en: search page shows a search box')            // goto /en/search/; input visible
test('en: trust finds the Core Idea')                  // results contain link text "Trust as an economic force"
test('hu: bizalom finds the Core Idea and opens it')   // result "A bizalom mint gazdasági erő"; click it → h1 has that text, URL contains /hu/
test('hu: inflected form matches (stemming)')          // query "bizalomról" → at least 1 .pagefind-ui__result-link (word confirmed in Task 4)
test('accented Hungarian query matches')               // /hu/search/ "gazdasági" → contains "A bizalom mint gazdasági erő"
test('en: Hungarian word finds nothing')               // /en/search/ "bizalom" → 0 result links, message visible
test('en: nonsense query shows no-results message')    // "xqzvkjw" → .pagefind-ui__message contains "No results"
test('footer text is not indexed')                     // /en/search/ "PaperMod" → 0 result links
test('hu: interface is in Hungarian')                  // input placeholder is not "Search"
test('menu links to search in both languages')         // /en/ link "Search" → /en/search/; /hu/ link "Keresés" → /hu/search/
test('shows unavailable message when Pagefind cannot load')  // page.route('**/pagefind/**', r => r.abort()) before goto /en/search/ → text "Search is currently unavailable."
test('works at phone width')                           // viewport 375×740, /en/search/ "trust" → result visible, input within viewport width
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test`
Expected: all fail (no search page yet; `/en/search/` returns 404).

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/search.spec.ts package.json package-lock.json
git commit -m "Add Playwright end-to-end tests for site search (failing)"
```

### Task 3: Search pages, menu, UI and styling

**Files:**
- Create: `layouts/_default/search.html`, `content/en/search.md`, `content/hu/search.md`, `i18n/en.yaml`, `i18n/hu.yaml`
- Modify: `hugo.toml` (menus), `assets/css/extended/custom.css`

**Interfaces:**
- Consumes: `public/pagefind/pagefind-ui.{js,css}` (Task 1), tests (Task 2).
- Produces: pages at `/en/search/`, `/hu/search/` with front matter `title` (`Search` / `Keresés`) and `layout: "search"`. They render through `search.html`, not `single.html`, so Task 4 keeps them out of the index.

- [ ] **Step 1: Override `layouts/_default/search.html`**

Keep PaperMod's `page-header` block (title + icon); replace `#searchbox` with: `<div id="search"></div>`, `<noscript>{{ i18n "search_requires_js" }}</noscript>`, links to `/pagefind/pagefind-ui.css` and `/pagefind/pagefind-ui.js`, and an inline script that on `DOMContentLoaded` runs `new PagefindUI({ element: "#search", showSubResults: true })` inside try/catch; if `PagefindUI` is undefined or throws, set `#search` text to `{{ i18n "search_unavailable" }}`.

- [ ] **Step 2: Add the i18n strings and the two content pages** (values in Global Constraints).

- [ ] **Step 3: Add menu entries** in `hugo.toml`: en `Search` → `pageRef = "search"`, hu `Keresés` → `pageRef = "search"`, weight 17.

- [ ] **Step 4: Theme Pagefind UI** in `custom.css` on `.pagefind-ui`: `--pagefind-ui-primary: var(--primary)`, `--pagefind-ui-text: var(--primary)`, `--pagefind-ui-background: var(--theme)`, `--pagefind-ui-border: var(--border)`, `--pagefind-ui-tag: var(--code-bg)`, `--pagefind-ui-font: inherit`. PaperMod swaps these variables in dark mode, so no separate dark rules.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS except possibly `footer text is not indexed` (fixed in Task 4) and `hu: inflected form matches`. If `hu: interface is in Hungarian` fails, pass Hungarian strings via the `translations` option of `PagefindUI` and re-run.

- [ ] **Step 6: Visual check** — `npm run preview`, open `http://localhost:8080/en/search/` in light and dark mode; results readable in both.

- [ ] **Step 7: Commit**

```bash
git add layouts/_default/search.html content/en/search.md content/hu/search.md i18n hugo.toml assets/css/extended/custom.css
git commit -m "Add Pagefind search pages in English and Hungarian"
```

### Task 4: Index only real writing

**Files:**
- Create: `layouts/_default/single.html` (copy of `themes/PaperMod/layouts/_default/single.html`)

**Interfaces:**
- Produces: `data-pagefind-body` on `<div class="post-content">`; `data-pagefind-meta="title"` on `<h1 class="post-title …">`. Pages without these (home, lists, search) are excluded from the index.

- [ ] **Step 1: Run the footer test to confirm it fails**

Run: `npx playwright test -g "footer text is not indexed"`
Expected: FAIL (footer "PaperMod" currently indexed on every page).

- [ ] **Step 2: Copy the template and add the two attributes.**

- [ ] **Step 3: Rebuild and check the count**

Run: `npm run build`
Expected: `Indexed <n> pages` with n between 100 and ~130 (posts + lessons + about, both languages). If below 100, the threshold has caught a real problem; investigate before continuing.

- [ ] **Step 4: Confirm the stemming word**

Run: `npx playwright test -g "inflected"`. If it fails, check Pagefind's Hungarian stemming support; if supported, pick an inflected form that appears in the HU content and update the test; if unsupported, delete the test and record that under "To verify" in the spec.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add layouts/_default/single.html tests/search.spec.ts docs/superpowers/specs/2026-11-09-site-search-design.md
git commit -m "Index only post content in search"
```

### Task 5: Netlify build configuration and docs

**Files:**
- Modify: `netlify.toml`, `CLAUDE.md`

- [ ] **Step 1: Update `netlify.toml`**: `[build] command = "npm run build"`; add `[build.environment]` with `HUGO_VERSION = "0.154.3"`, `NODE_VERSION = "24"`; add `'wasm-unsafe-eval'` to the CSP `script-src`.

- [ ] **Step 2: Verify the build still works locally**

Run: `npm run build && npm test`
Expected: build OK, all tests PASS. (CSP is verified on the deploy preview in Task 7.)

- [ ] **Step 3: Update `CLAUDE.md`**: Commands (`npm run build`, `npm run preview`, `npm test`, `BASE_URL=… npm test`, Node prerequisite), Deployment (new build pipeline, pinned versions, `wasm-unsafe-eval` reason), Architecture (search pages, `single.html` override and `data-pagefind-body`), remove "There are no tests".

- [ ] **Step 4: Commit**

```bash
git add netlify.toml CLAUDE.md
git commit -m "Build search index on Netlify and pin Hugo/Node versions"
```

### Task 6: GitHub Actions end-to-end workflow

**Files:**
- Create: `.github/workflows/e2e.yml`

**Interfaces:**
- Consumes: `npm test` with `BASE_URL` (Task 2).
- Produces: workflow `E2E tests`, job `e2e`.

- [ ] **Step 1: Write the workflow**

Trigger `deployment_status`; job runs only when `github.event.deployment_status.state == 'success'`. Steps: checkout at `github.event.deployment.sha`; setup Node 24 with npm cache; `npm ci`; `npx playwright install --with-deps chromium`; `npm test` with `BASE_URL: ${{ github.event.deployment_status.environment_url || github.event.deployment_status.target_url }}` and `CI: true`; on failure upload `playwright-report/` and `test-results/` as artifact `playwright-report`. Use current major versions of `actions/checkout`, `actions/setup-node`, `actions/upload-artifact`.

- [ ] **Step 2: Validate syntax locally**

Run: `npx --yes action-validator .github/workflows/e2e.yml` (or `brew install actionlint && actionlint`).
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/e2e.yml
git commit -m "Run end-to-end tests against Netlify deploys in GitHub Actions"
```

### Task 7: Ship via pull request

Each step needing push, PR creation or merge waits for the owner's go-ahead.

- [ ] **Step 1: Push the branch and open a pull request** to `main` (`git push -u origin feature/site-search`, `gh pr create`).

- [ ] **Step 2: Verify the deploy preview** — Netlify check goes green; open `<preview>/en/search/` and `<preview>/hu/search/`, search works (proves the CSP change).

- [ ] **Step 3: Verify CI** — `E2E tests` workflow runs against the preview URL and passes.
If no workflow run appears, Netlify is not sending `deployment_status`: switch the trigger to `pull_request`, wait for and test `https://deploy-preview-<PR number>--<netlify site name>.netlify.app` (site name from the owner's Netlify dashboard), update the spec's "To verify" note, commit, push.

- [ ] **Step 4: Merge** after the owner approves (`gh pr merge --merge`), then pull `main` locally.

- [ ] **Step 5: Verify production** — Netlify production deploy succeeds; `E2E tests` runs against `https://www.human-growth-model.xyz` and passes; spot-check `/en/search/` and `/hu/search/` by hand.

- [ ] **Step 6: Offer branch protection** on `main` requiring the `e2e` check (owner's choice, per spec).
