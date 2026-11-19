import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function normalizeDomain(value) {
  if (!value) return undefined;
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/^\*\./, "");
}

try {
  const disclosures = await prisma.sourceDisclosure.findMany({
    select: { id:true, sourceName:true, targetedDomain:true, rawData:true, normalizedData:true },
  });
  let disclosureCorrections = 0;
  for (const disclosure of disclosures) {
    if (disclosure.targetedDomain) continue;
    const raw = typeof disclosure.rawData === "object" && disclosure.rawData !== null
      ? disclosure.rawData
      : {};
    const normalized = typeof disclosure.normalizedData === "object" && disclosure.normalizedData !== null
      ? disclosure.normalizedData
      : {};
    const candidate =
      raw.website ??
      raw.domain ??
      normalized.targetedDomain ??
      normalized.domain;
    const targetedDomain = normalizeDomain(candidate);
    if (!targetedDomain) continue;
    await prisma.sourceDisclosure.update({
      where: { id: disclosure.id },
      data: { targetedDomain },
    });
    disclosureCorrections++;
  }

  const victims = await prisma.canonicalVictim.findMany({
    select: { id:true, domain:true, description:true, targetedDomain:true, targetedDomainNormalized:true },
  });
  let victimCorrections = 0;
  for (const victim of victims) {
    if (victim.targetedDomainNormalized) {
      if (!victim.description) {
        const disclosure = await prisma.sourceDisclosure.findFirst({
          where: { canonicalVictimId:victim.id },
          select: { rawData:true, normalizedData:true },
        });
        const raw = typeof disclosure?.rawData === "object" && disclosure.rawData !== null ? disclosure.rawData : {};
        const normalized = typeof disclosure?.normalizedData === "object" && disclosure.normalizedData !== null ? disclosure.normalizedData : {};
        const description = String(raw.description ?? normalized.description ?? "").trim();
        if (description) {
          await prisma.canonicalVictim.update({ where:{id:victim.id}, data:{description} });
          victimCorrections++;
        }
      }
      continue;
    }
    const disclosure = await prisma.sourceDisclosure.findFirst({
      where: { canonicalVictimId:victim.id, targetedDomain:{ not:null } },
      orderBy: [{ sourceName:"asc" }, { publishedAt:"desc" }],
      select: { targetedDomain:true, rawData:true, normalizedData:true },
    });
    const targetedDomain = normalizeDomain(disclosure?.targetedDomain ?? victim.domain);
    const raw = typeof disclosure?.rawData === "object" && disclosure.rawData !== null ? disclosure.rawData : {};
    const normalized = typeof disclosure?.normalizedData === "object" && disclosure.normalizedData !== null ? disclosure.normalizedData : {};
    const description = String(raw.description ?? normalized.description ?? victim.description ?? "").trim();
    if (!targetedDomain) continue;
    await prisma.canonicalVictim.update({
      where: { id:victim.id },
      data: {
        domain: victim.domain ?? targetedDomain,
        targetedDomain,
        targetedDomainNormalized: targetedDomain,
        ...(description ? { description } : {}),
      },
    });
    victimCorrections++;
  }

  console.log(JSON.stringify({
    disclosuresChecked: disclosures.length,
    disclosureCorrections,
    victimsChecked: victims.length,
    victimCorrections,
  }));
} finally {
  await prisma.$disconnect();
}
