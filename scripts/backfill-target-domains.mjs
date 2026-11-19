import { db } from "./db.mjs";

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
  const disclosures = await db.orm.public.SourceDisclosure
    .select("id", "sourceName", "targetedDomain", "rawData", "normalizedData")
    .all();
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
    await db.orm.public.SourceDisclosure.where({ id: disclosure.id }).update({ targetedDomain });
    disclosureCorrections++;
  }

  const victims = await db.orm.public.CanonicalVictim
    .select("id", "domain", "description", "targetedDomain", "targetedDomainNormalized")
    .all();
  let victimCorrections = 0;
  for (const victim of victims) {
    if (victim.targetedDomainNormalized) {
      if (!victim.description) {
        const disclosure = await db.orm.public.SourceDisclosure
          .where({ canonicalVictimId: victim.id })
          .select("rawData", "normalizedData")
          .first();
        const raw = typeof disclosure?.rawData === "object" && disclosure.rawData !== null ? disclosure.rawData : {};
        const normalized = typeof disclosure?.normalizedData === "object" && disclosure.normalizedData !== null ? disclosure.normalizedData : {};
        const description = String(raw.description ?? normalized.description ?? "").trim();
        if (description) {
          await db.orm.public.CanonicalVictim.where({ id: victim.id }).update({ description });
          victimCorrections++;
        }
      }
      continue;
    }
    const disclosure = await db.orm.public.SourceDisclosure
      .where({ canonicalVictimId: victim.id })
      .where((source) => source.targetedDomain.isNotNull())
      .orderBy([(source) => source.sourceName.asc(), (source) => source.publishedAt.desc()])
      .select("targetedDomain", "rawData", "normalizedData")
      .first();
    const targetedDomain = normalizeDomain(disclosure?.targetedDomain ?? victim.domain);
    const raw = typeof disclosure?.rawData === "object" && disclosure.rawData !== null ? disclosure.rawData : {};
    const normalized = typeof disclosure?.normalizedData === "object" && disclosure.normalizedData !== null ? disclosure.normalizedData : {};
    const description = String(raw.description ?? normalized.description ?? victim.description ?? "").trim();
    if (!targetedDomain) continue;
    await db.orm.public.CanonicalVictim.where({ id: victim.id }).update({
        domain: victim.domain ?? targetedDomain,
        targetedDomain,
        targetedDomainNormalized: targetedDomain,
        ...(description ? { description } : {}),
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
  await db.close();
}
