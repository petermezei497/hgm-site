import { readFile } from "node:fs/promises";
import * as pagefind from "pagefind";

const siteDir = process.env.SITE_DIR || "public";
const minPages = 100;

const { index, errors: createErrors } = await pagefind.createIndex();
if (!index) {
  console.error(createErrors.join("\n"));
  process.exit(1);
}

const { errors } = await index.addDirectory({ path: siteDir });
if (errors.length > 0) {
  console.error(errors.join("\n"));
  await pagefind.close();
  process.exit(1);
}

const { errors: writeErrors } = await index.writeFiles({ outputPath: `${siteDir}/pagefind` });
await pagefind.close();
if (writeErrors.length > 0) {
  console.error(writeErrors.join("\n"));
  process.exit(1);
}

// addDirectory's page_count counts HTML files processed, not pages indexed.
// The entry file written by Pagefind has the real per-language counts.
const entry = JSON.parse(await readFile(`${siteDir}/pagefind/pagefind-entry.json`, "utf8"));
const counts = Object.entries(entry.languages).map(([lang, info]) => [lang, info.page_count]);
const total = counts.reduce((sum, [, n]) => sum + n, 0);

// A near-empty index means the build is broken; fail rather than deploy it
if (total < minPages) {
  console.error(`Search index too small: ${total} pages (minimum ${minPages})`);
  process.exit(1);
}

console.log(`Indexed ${total} pages (${counts.map(([lang, n]) => `${lang}: ${n}`).join(", ")})`);
