import { expect, test, type Page } from "@playwright/test";

const INPUT = ".pagefind-ui__search-input";
const LINK = ".pagefind-ui__result-link";
const MESSAGE = ".pagefind-ui__message";

const EN_TITLE = "Trust as an economic force";
const HU_TITLE = "A bizalom mint gazdasági erő";

async function search(page: Page, path: string, query: string) {
  await page.goto(path);
  await page.locator(INPUT).fill(query);
}

test("en: search page shows a search box", async ({ page }) => {
  await page.goto("/en/search/");
  await expect(page.locator(INPUT)).toBeVisible();
});

test("en: trust finds the Core Idea", async ({ page }) => {
  await search(page, "/en/search/", "trust");
  await expect(page.locator(LINK).filter({ hasText: EN_TITLE }).first()).toBeVisible();
});

test("hu: bizalom finds the Core Idea and opens it", async ({ page }) => {
  await search(page, "/hu/search/", "bizalom");
  await page.locator(LINK).filter({ hasText: HU_TITLE }).first().click();
  await expect(page.locator("h1")).toHaveText(HU_TITLE);
  expect(page.url()).toContain("/hu/");
});

test("hu: inflected form matches (stemming)", async ({ page }) => {
  await search(page, "/hu/search/", "bizalmat");
  await expect(page.locator(LINK).first()).toBeVisible();
});

test("accented Hungarian query matches", async ({ page }) => {
  await search(page, "/hu/search/", "gazdasági");
  await expect(page.locator(LINK).filter({ hasText: HU_TITLE }).first()).toBeVisible();
});

test("en: Hungarian word finds nothing", async ({ page }) => {
  await search(page, "/en/search/", "bizalom");
  await expect(page.locator(MESSAGE)).toContainText("No results");
  await expect(page.locator(LINK)).toHaveCount(0);
});

test("en: nonsense query shows no-results message", async ({ page }) => {
  await search(page, "/en/search/", "qqqqwwww");
  await expect(page.locator(MESSAGE)).toContainText("No results");
});

test("only content pages appear in results", async ({ page }) => {
  await search(page, "/en/search/", "paper");
  await expect(page.locator(LINK).first()).toBeVisible();
  // Wait until the search has finished ("N results for ...", not "Searching for ...").
  await expect(page.locator(MESSAGE)).toContainText(/\d+ results? for/);
  const hrefs = await page
    .locator(LINK)
    .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href") || ""));
  const allowed = /^\/en\/(posts|lessons)\/[^/]+\/$|^\/en\/about\/$/;
  const bad = hrefs
    .map((h) => h.split("#")[0])
    .filter((h) => !allowed.test(h) || h.includes("/page/"));
  expect(bad, `Non-content pages in results: ${bad.join(", ")}`).toEqual([]);
});

test("hu: interface is in Hungarian", async ({ page }) => {
  await page.goto("/hu/search/");
  await expect(page.locator(INPUT)).toBeVisible();
  await expect(page.locator(INPUT)).not.toHaveAttribute("placeholder", "Search");
});

test("menu links to search in both languages", async ({ page }) => {
  await page.goto("/en/");
  await page.getByRole("link", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/search\/$/);

  await page.goto("/hu/");
  await page.getByRole("link", { name: "Keresés", exact: true }).click();
  await expect(page).toHaveURL(/\/hu\/search\/$/);
});

test("shows unavailable message when Pagefind cannot load", async ({ page }) => {
  await page.route("**/pagefind/**", (route) => route.abort());
  await page.goto("/en/search/");
  await expect(page.locator("#search")).toHaveText("Search is currently unavailable.");
});

test("works at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await search(page, "/en/search/", "trust");
  await expect(page.locator(LINK).first()).toBeVisible();
  const box = await page.locator(INPUT).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
});

test("search page loads no legacy search and has no JS errors", async ({ page }) => {
  const errors: string[] = [];
  const urls: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => urls.push(r.url()));
  for (const [path, query] of [
    ["/en/search/", "trust"],
    ["/hu/search/", "bizalom"],
  ]) {
    await search(page, path, query);
    await expect(page.locator(LINK).first()).toBeVisible();
  }
  expect(errors).toEqual([]);
  expect(urls.filter((u) => new URL(u).pathname.endsWith("index.json"))).toEqual([]);
});
