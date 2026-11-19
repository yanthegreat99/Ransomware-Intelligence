import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const taxonomy = require("../gics-taxonomy-april-2026.json");
const prisma = new PrismaClient();

try {
  for (const row of taxonomy) {
    await prisma.gicsTaxonomy.upsert({
      where: { subIndustryCode: row.subIndustryCode },
      update: row,
      create: row,
    });
  }
  console.log(JSON.stringify({ seeded: taxonomy.length }));
} finally {
  await prisma.$disconnect();
}
