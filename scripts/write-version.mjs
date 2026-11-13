import { writeFile } from "node:fs/promises";

const siteDir = process.env.SITE_DIR || "public";

// Netlify sets COMMIT_REF to the deployed commit SHA. CI polls /version.txt to
// know when the live site is the new build.
await writeFile(`${siteDir}/version.txt`, process.env.COMMIT_REF || "local");
