import { createRequire } from "node:module";
import { db } from "./db.mjs";

const require = createRequire(import.meta.url);
const taxonomy = require("../gics-taxonomy-april-2026.json");

try {
  for (const row of taxonomy) {
    await db.orm.public.GicsTaxonomy.where({ subIndustryCode: row.subIndustryCode })
      .upsert({
        update: row,
        create: row,
        conflictOn: { subIndustryCode: row.subIndustryCode },
      });
  }
  console.log(JSON.stringify({ seeded: taxonomy.length }));
} finally {
  await db.close();
}
