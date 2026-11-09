import * as pagefind from "pagefind";

const siteDir = process.env.SITE_DIR || "public";
const minPages = 100;

const { index, errors: createErrors } = await pagefind.createIndex();
if (!index) {
  console.error(createErrors.join("\n"));
  process.exit(1);
}

const { errors, page_count: pageCount } = await index.addDirectory({ path: siteDir });
if (errors.length > 0) {
  console.error(errors.join("\n"));
  await pagefind.close();
  process.exit(1);
}

// A near-empty index means the build is broken; fail rather than deploy it
if (pageCount < minPages) {
  console.error(`Search index too small: ${pageCount} pages (minimum ${minPages})`);
  await pagefind.close();
  process.exit(1);
}

const { errors: writeErrors } = await index.writeFiles({ outputPath: `${siteDir}/pagefind` });
await pagefind.close();
if (writeErrors.length > 0) {
  console.error(writeErrors.join("\n"));
  process.exit(1);
}

console.log(`Indexed ${pageCount} pages`);
