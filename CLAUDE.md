# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Human Growth Model" — a personal bilingual (English / Hungarian) blog, live at https://www.human-growth-model.xyz/. Static site built with **Hugo** + the **PaperMod** theme, hosted on **Netlify**. The owner plans to enhance, develop and possibly replatform it, so keep changes understandable and well-explained (the owner is new to software engineering — see global instructions).

## Commands

```sh
hugo server -D                      # local dev server with live reload (http://localhost:1313), -D includes drafts
hugo --gc --minify                  # production build (same as Netlify) into public/
hugo --gc --minify -d <dir>         # build elsewhere to inspect output without touching public/
hugo new content/en/posts/<file>.md # new post from archetypes/default.md
```

There are no tests or linters. Verification = a clean `hugo` build (watch for `WARN` lines) and inspecting generated HTML / the live site.

## Deployment

- Push to `main` on GitHub (`petermezei497/hgm-site`) → Netlify runs `hugo --gc --minify` and publishes `public/`. Deploys go live in ~30s.
- `public/` is build output and is gitignored — never commit it.
- `netlify.toml` holds www/https redirects, security headers and the **Content-Security-Policy**. Any new external script, style, font or API (e.g. embeds, comments, analytics) must be allowed there or browsers will block it.
- Netlify's Hugo version is not pinned (no `HUGO_VERSION` env in `netlify.toml`). PaperMod requires Hugo ≥ 0.146; local is Homebrew Hugo extended.

## Architecture

- **Config:** single `hugo.toml`. Defines both languages, per-language main menus (Posts, Core Ideas, About, Support) and PaperMod feature flags under `[params]`. `markup.goldmark.renderer.unsafe = true` is required — posts use inline HTML (`<br>` for line breaks).
- **Multilingual:** `contentDir` per language — `content/en/` and `content/hu/`, served under `/en/` and `/hu/` (`defaultContentLanguageInSubdir`). Each language tree has the same sections: `posts/`, `lessons/`, `support/`, `about.md`. Post filenames differ between languages and there are no `translationKey`s, so individual posts are **not** linked as translations of each other; only same-path pages (section indexes, `about.md`) are.
- **Sections:**
  - `posts/` — dated journal entries, sorted by date. Filenames `YYYY-MM-DD-Title.md`. Front matter: `title`, `date`, `draft`, `publishDate`.
  - `lessons/` — the "Core Ideas" series (`slug: "lessons"` in `_index.md`). Ordered by the `weight` front-matter field via the custom `layouts/lessons/list.html`, not by date.
  - `support/` — uses the `rawhtml` shortcode with `.support-grid` / `.support-card` CSS classes.
- **Theme customisation:** `themes/PaperMod/` is vendored (committed directly, not a submodule). Do not edit it; override instead — a file in `layouts/` at the same relative path as one in `themes/PaperMod/layouts/` replaces it. Custom CSS goes in `assets/css/extended/custom.css` (PaperMod auto-bundles everything in `assets/css/extended/`).
- **Shortcode:** `layouts/shortcodes/rawhtml.html` — `{{< rawhtml >}}…{{< /rawhtml >}}` outputs its inner HTML verbatim.

## Gotchas

- `publishDate` in the future hides a post until the site is rebuilt after that time. Netlify only rebuilds on push, so "scheduled" posts don't appear on their own.
- Existing content uses YAML front matter (`---`), but `archetypes/default.md` generates TOML (`+++`) with `draft = true` — remember to flip `draft` before publishing.
- Plausible is allowed in the CSP but no Plausible script is actually included in any template.
- Writing style: content is personal, reflective prose; don't edit post text unless asked.
