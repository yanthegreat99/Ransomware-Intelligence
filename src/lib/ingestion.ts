import { asJson, getDb } from "./prisma";
import { and, or } from "@prisma/orm-postgres/orm-client";
import { normalizeDomain, normalizeName, similarityScore, hasDistinctOrganisationRoots } from "./intelligence";
import { createHash, randomUUID } from "node:crypto";
import type { SourceAdapter } from "./source-adapter";
import { normalizeCountry } from "./countries";
import { groupNameKey, normalizeGroupName } from "./group-normalization";
import { appendSourceDisclosureHistory } from "./source-history";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function isUniqueViolation(error: unknown): boolean {
  let current = error;
  while (typeof current === "object" && current !== null) {
    const details = current as { sqlState?: unknown; cause?: unknown };
    if (details.sqlState === "23505") return true;
    current = details.cause;
  }
  return false;
}

export async function ingestAdapter(adapter: SourceAdapter) {
  const db = getDb();
  const ownerToken = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await db.orm.public.IngestionLease
    .where((lease) => lease.expiresAt.lt(new Date()))
    .deleteAll();
  let leaseCreated = false;
  try {
    await db.orm.public.IngestionLease.create({ sourceName: adapter.name, ownerToken, expiresAt });
    leaseCreated = true;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return null;
    }
    throw error;
  }

  const run = await db.orm.public.IngestionRun.create({ sourceName: adapter.name, status: "RUNNING" });

  let recordsRead = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;
  let newDisclosures = 0;
  let existingDisclosures = 0;
  let updatedDisclosures = 0;
  let repeatedSourceIdentifiers = 0;
  let rejectedRecords = 0;
  const errors: string[] = [];
  let adapterStats = adapter.runStats ?? {
    recordsRetrieved: 0,
    rejectedRecords: 0,
    warnings: [],
  };
  const seenIdentifiers = new Set<string>();
  const groupCache = new Map<string, {
    id: string;
    firstObserved: Date | null;
    lastObserved: Date | null;
    persistedFirstObserved: Date | null;
    persistedLastObserved: Date | null;
  }>();

  try {
    const records = await adapter.run();
    recordsRead = records.length;
    adapterStats = adapter.runStats ?? {
      recordsRetrieved: records.length,
      rejectedRecords: 0,
      warnings: [],
    };
    const persistedGroups = await db.orm.public.RansomwareGroup
      .select("id", "name", "firstObserved", "lastObserved")
      .all();
    for (const persisted of persistedGroups) {
      groupCache.set(groupNameKey(persisted.name), {
        ...persisted,
        persistedFirstObserved: persisted.firstObserved,
        persistedLastObserved: persisted.lastObserved,
      });
    }

    for (const record of records) {
      try {
        if (!record.sourceIdentifier) {
          const fallback = createHash("sha256")
            .update(JSON.stringify(record.rawData ?? record))
            .digest("hex");
          record.sourceIdentifier = fallback;
        }

        const identifierKey = `${record.sourceName}:${record.sourceIdentifier}`;
        if (seenIdentifiers.has(identifierKey)) repeatedSourceIdentifiers++;
        else seenIdentifiers.add(identifierKey);

        const { rawData, ...normalizedRecord } = record;
        const normalizedData = asJson(JSON.parse(JSON.stringify(normalizedRecord)));
        const originalData = asJson(JSON.parse(JSON.stringify(rawData ?? normalizedRecord)));
        const existingDisclosure = await db.orm.public.SourceDisclosure
          .where({ sourceName: record.sourceName, sourceIdentifier: record.sourceIdentifier })
          .first();

        let groupId: string | undefined;
        if (record.groupName) {
          const normalizedGroupName = normalizeGroupName(record.groupName) ?? record.groupName;
          const normalizedGroupKey = groupNameKey(normalizedGroupName);
          let group = groupCache.get(normalizedGroupKey);
          if (!group) {
            const persisted = await db.orm.public.RansomwareGroup.upsert({
              create: {
                name: normalizedGroupName,
                firstObserved: record.publishedAt,
                lastObserved: record.publishedAt,
              },
              update: {},
              conflictOn: { name: normalizedGroupName },
            });
            group = {
              id: persisted.id,
              firstObserved: persisted.firstObserved,
              lastObserved: persisted.lastObserved,
              persistedFirstObserved: persisted.firstObserved,
              persistedLastObserved: persisted.lastObserved,
            };
            groupCache.set(normalizedGroupKey, group);
          }
          if (record.publishedAt) {
            group.firstObserved = !group.firstObserved || record.publishedAt < group.firstObserved
              ? record.publishedAt
              : group.firstObserved;
            group.lastObserved = !group.lastObserved || record.publishedAt > group.lastObserved
              ? record.publishedAt
              : group.lastObserved;
          }
          groupCache.set(normalizedGroupKey, group);
          groupId = group.id;
        }

        const normalizedName = normalizeName(record.victimName);
        const normalizedDomain = normalizeDomain(record.domain);
        const targetedDomain = normalizeDomain(record.targetedDomain) ?? normalizedDomain;
        const country = normalizeCountry(record.country);
        const victimQuery = db.orm.public.CanonicalVictim.where((victim) =>
          normalizedDomain
            ? or(victim.normalizedName.eq(normalizedName), victim.normalizedDomain.eq(normalizedDomain))
            : victim.normalizedName.eq(normalizedName),
        );
        let victim = await victimQuery.first();

        if (!victim) {
          victim = await db.orm.public.CanonicalVictim.create({
              name: record.victimName,
              normalizedName,
              country: country?.name,
              countryCode: country?.alpha2,
              normalizedDomain,
              targetedDomain,
              targetedDomainNormalized: targetedDomain,
              description: record.description,
              ransomwareGroupId: groupId,
              firstReportedAt: record.publishedAt ?? new Date(),
          });
          recordsCreated++;
        } else {
          recordsUpdated++;
          if (!victim.normalizedDomain) {
            const normalizedDomain = normalizeDomain(record.domain);
            if (normalizedDomain) {
              await db.orm.public.CanonicalVictim.where({ id: victim.id })
                .update({ normalizedDomain, domain: normalizedDomain });
            }
          }
          if (country && !victim.countryCode) {
            await db.orm.public.CanonicalVictim.where({ id: victim.id })
              .update({ country: country.name, countryCode: country.alpha2 });
          }
          if (targetedDomain && !victim.targetedDomainNormalized) {
            await db.orm.public.CanonicalVictim.where({ id: victim.id }).update({
                targetedDomain,
                targetedDomainNormalized: targetedDomain,
            });
          }
          if (record.description && !victim.description) {
            await db.orm.public.CanonicalVictim.where({ id: victim.id })
              .update({ description: record.description });
          }
        }

        if (existingDisclosure) {
          existingDisclosures++;
          const nextUpdatedAtSource = record.updatedAt ?? existingDisclosure.updatedAtSource;
          const nextGroupId = groupId ?? existingDisclosure.ransomwareGroupId;
          const nextTargetedDomain = targetedDomain ?? existingDisclosure.targetedDomain;
          const changed =
            stableJson(existingDisclosure.normalizedData) !== stableJson(normalizedData) ||
            existingDisclosure.canonicalVictimId !== victim.id ||
            existingDisclosure.ransomwareGroupId !== nextGroupId ||
            existingDisclosure.targetedDomain !== nextTargetedDomain ||
            existingDisclosure.updatedAtSource?.getTime() !== nextUpdatedAtSource?.getTime();
          if (changed) {
            await db.orm.public.SourceDisclosure.where({ id: existingDisclosure.id }).update({
                rawData: asJson(appendSourceDisclosureHistory(existingDisclosure.rawData, {
                  sourceName: existingDisclosure.sourceName,
                  sourceIdentifier: existingDisclosure.sourceIdentifier,
                  sourceUrl: existingDisclosure.sourceUrl,
                  normalizedData: existingDisclosure.normalizedData,
                  publishedAt: existingDisclosure.publishedAt,
                  updatedAtSource: existingDisclosure.updatedAtSource,
                  targetedDomain: existingDisclosure.targetedDomain,
                  canonicalVictimId: existingDisclosure.canonicalVictimId,
                  ransomwareGroupId: existingDisclosure.ransomwareGroupId,
                })),
                updatedAtSource: nextUpdatedAtSource,
                normalizedData,
                canonicalVictimId: victim.id,
                ransomwareGroupId: nextGroupId,
                targetedDomain: nextTargetedDomain,
            });
            updatedDisclosures++;
          }
        } else {
          await db.orm.public.SourceDisclosure.create({
              sourceName: record.sourceName,
              sourceIdentifier: record.sourceIdentifier,
              sourceUrl: record.sourceUrl,
              targetedDomain,
              originalVictimName: record.victimName,
              originalGroupName: record.groupName,
              originalCountry: record.country,
              originalIndustry: record.industry,
              publishedAt: record.publishedAt,
              updatedAtSource: record.updatedAt,
              rawData: originalData,
              normalizedData,
              canonicalVictimId: victim.id,
              ransomwareGroupId: groupId,
          });
          newDisclosures++;
        }
      } catch (error) {
        rejectedRecords++;
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    for (const group of groupCache.values()) {
      const firstChanged = group.firstObserved?.getTime() !== group.persistedFirstObserved?.getTime();
      const lastChanged = group.lastObserved?.getTime() !== group.persistedLastObserved?.getTime();
      if (!firstChanged && !lastChanged) continue;
      await db.orm.public.RansomwareGroup.where({ id: group.id }).update({
          firstObserved: group.firstObserved,
          lastObserved: group.lastObserved,
      });
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  adapterStats = adapter.runStats ?? adapterStats;
  const allRejectedRecords = adapterStats.rejectedRecords + rejectedRecords;
  const hasWarnings = adapterStats.warnings.length > 0;
  const hasProblems = errors.length > 0 || allRejectedRecords > 0 || hasWarnings;
  const completedRun = await db.orm.public.IngestionRun.where({ id: run.id }).update({
      status: hasProblems
        ? (recordsRead || adapterStats.recordsRetrieved ? "PARTIAL" : "FAILED")
        : "SUCCESS",
      completedAt: new Date(),
      recordsRead,
      recordsCreated,
      recordsUpdated,
      errorCount: errors.length,
      errors,
      metadata: asJson({
        reconciliation: {
          recordsRetrieved: adapterStats.recordsRetrieved || recordsRead,
          normalizedRecords: recordsRead,
          newDisclosures,
          existingDisclosures,
          updatedDisclosures,
          repeatedSourceIdentifiers,
          canonicalVictimsCreated: recordsCreated,
          canonicalVictimsMatched: recordsUpdated,
          rejectedRecords: allRejectedRecords,
          ingestionErrors: errors.length,
          warnings: adapterStats.warnings,
        },
      }),
  });
  if (leaseCreated) {
    await db.orm.public.IngestionLease.where({ sourceName: adapter.name, ownerToken }).deleteAll();
  }
  return completedRun;
}

export async function detectDuplicates(victimId: string) {
  const db = getDb();
  const victim = await db.orm.public.CanonicalVictim.first({ id: victimId });
  if (!victim) return [];

  const candidates = await db.orm.public.CanonicalVictim
    .where((candidate) => candidate.id.neq(victimId))
    .all();
  const matches = [];

  for (const candidate of candidates) {
    const nameScore = similarityScore(victim.name, candidate.name);
    const aliasMatch = (candidate.aliases ?? []).some((alias) =>
      typeof alias === "string" && normalizeName(alias) === victim.normalizedName,
    ) || (victim.aliases ?? []).some((alias) =>
      typeof alias === "string" && normalizeName(alias) === candidate.normalizedName,
    );
    const domainMatch =
      Boolean(victim.normalizedDomain && candidate.normalizedDomain) &&
      victim.normalizedDomain === candidate.normalizedDomain;
    const [victimSources, candidateSources] = await Promise.all([
      db.orm.public.SourceDisclosure.where({ canonicalVictimId: victim.id }).select("sourceIdentifier", "sourceUrl").all(),
      db.orm.public.SourceDisclosure.where({ canonicalVictimId: candidate.id }).select("sourceIdentifier", "sourceUrl").all(),
    ]);
    const sourceIdentifierMatch = victimSources.some((source) =>
      Boolean(source.sourceIdentifier) && candidateSources.some((candidateSource) =>
        candidateSource.sourceIdentifier === source.sourceIdentifier,
      ),
    );
    const sourceUrlMatch = victimSources.some((source) =>
      Boolean(source.sourceUrl) && candidateSources.some((candidateSource) =>
        candidateSource.sourceUrl === source.sourceUrl,
      ),
    );
    if (hasDistinctOrganisationRoots(victim.name, candidate.name) &&
        !domainMatch &&
        !aliasMatch &&
        !sourceUrlMatch &&
        !sourceIdentifierMatch) {
      continue;
    }
    const hasStrongEvidence = domainMatch || sourceIdentifierMatch || sourceUrlMatch;
    const score = hasStrongEvidence ? 100 : aliasMatch ? 95 : nameScore >= 95 ? 90 : nameScore;
    if (score >= 85) {
      const explanation = asJson({
        nameScore,
        domainMatch,
        aliasMatch,
        sourceIdentifierMatch,
        sourceUrlMatch,
        methods: [
          ...(domainMatch ? ["domain_exact"] : []),
          ...(aliasMatch ? ["alias_match"] : []),
          ...(sourceIdentifierMatch ? ["source_identifier_exact"] : []),
          ...(sourceUrlMatch ? ["source_url_exact"] : []),
          ...(nameScore >= 85 ? ["normalized_name_fuzzy"] : []),
        ],
      });
      matches.push(
        await db.orm.public.DuplicateMatch
          .upsert({
          update: {
            classification: score === 100 ? "CONFIRMED_DUPLICATE" : "POTENTIAL_DUPLICATE",
            similarityScore: score,
            explanation,
          },
          conflictOn: {
            primaryVictimId: victim.id,
            candidateVictimId: candidate.id,
          },
          create: {
            primaryVictimId: victim.id,
            candidateVictimId: candidate.id,
            classification: score === 100 ? "CONFIRMED_DUPLICATE" : "POTENTIAL_DUPLICATE",
            similarityScore: score,
            explanation,
          },
        }),
      );
    }
  }
  return matches;
}

export async function detectAllDuplicates() {
  const db = getDb();
  const victims = await db.orm.public.CanonicalVictim
    .select("id", "name", "normalizedName", "normalizedDomain", "aliases")
    .all();

  const disclosures = await db.orm.public.SourceDisclosure
    .select("canonicalVictimId", "sourceIdentifier", "sourceUrl")
    .all();
  const sourceMap = new Map<string, Array<{ sourceIdentifier: string | null; sourceUrl: string | null }>>();
  for (const disclosure of disclosures) {
    if (!disclosure.canonicalVictimId) continue;
    const existing = sourceMap.get(disclosure.canonicalVictimId) ?? [];
    existing.push(disclosure);
    sourceMap.set(disclosure.canonicalVictimId, existing);
  }

  const exactNames = new Map<string, string[]>();
  const exactDomains = new Map<string, string[]>();
  for (const victim of victims) {
    if (victim.normalizedName) {
      const ids = exactNames.get(victim.normalizedName) ?? [];
      ids.push(victim.id);
      exactNames.set(victim.normalizedName, ids);
    }
    if (victim.normalizedDomain) {
      const ids = exactDomains.get(victim.normalizedDomain) ?? [];
      ids.push(victim.id);
      exactDomains.set(victim.normalizedDomain, ids);
    }
  }

  let potential = 0;
  let confirmed = 0;
  let compared = 0;
  const checked = new Set<string>();

  for (let i = 0; i < victims.length; i++) {
    const primary = victims[i];
    for (let j = i + 1; j < victims.length; j++) {
      const candidate = victims[j];
      if (primary.normalizedName && candidate.normalizedName &&
        primary.normalizedName !== candidate.normalizedName &&
        primary.normalizedName.slice(0, 3) !== candidate.normalizedName.slice(0, 3)) {
        continue;
      }
      compared++;

      const nameScore = similarityScore(primary.name, candidate.name);
      const domainMatch = Boolean(primary.normalizedDomain && candidate.normalizedDomain &&
        primary.normalizedDomain === candidate.normalizedDomain);
      const aliasMatch =
        (candidate.aliases ?? []).some((alias) => typeof alias === "string" && normalizeName(alias) === primary.normalizedName) ||
        (primary.aliases ?? []).some((alias) => typeof alias === "string" && normalizeName(alias) === candidate.normalizedName);
      const primarySources = sourceMap.get(primary.id) ?? [];
      const candidateSources = sourceMap.get(candidate.id) ?? [];
      const sourceUrlMatch = primarySources.some((source) =>
        Boolean(source.sourceUrl) && candidateSources.some((candidateSource) =>
          candidateSource.sourceUrl === source.sourceUrl,
        ),
      );
      const sourceIdentifierMatch = primarySources.some((source) =>
        Boolean(source.sourceIdentifier) && candidateSources.some((candidateSource) =>
          candidateSource.sourceIdentifier === source.sourceIdentifier,
        ),
      );
      if (hasDistinctOrganisationRoots(primary.name, candidate.name) &&
          !domainMatch &&
          !aliasMatch &&
          !sourceUrlMatch &&
          !sourceIdentifierMatch) {
        continue;
      }

      const exactNameMatch = primary.normalizedName === candidate.normalizedName;
      const score = domainMatch || sourceUrlMatch || sourceIdentifierMatch
        ? 100
        : exactNameMatch
          ? 100
          : aliasMatch
            ? 95
            : nameScore;
      if (score < 85) continue;

      const key = `${primary.id}:${candidate.id}`;
      if (checked.has(key)) continue;
      checked.add(key);

      const hasStrongEvidence = domainMatch || sourceUrlMatch || sourceIdentifierMatch;
      const classification = hasStrongEvidence || exactNameMatch
        ? "CONFIRMED_DUPLICATE"
        : "POTENTIAL_DUPLICATE";
      const explanation = asJson({
        nameScore,
        exactNameMatch,
        domainMatch,
        aliasMatch,
        sourceUrlMatch,
        sourceIdentifierMatch,
        methods: [
          ...(exactNameMatch ? ["normalized_name_exact"] : []),
          ...(domainMatch ? ["domain_exact"] : []),
          ...(aliasMatch ? ["alias_match"] : []),
          ...(sourceUrlMatch ? ["source_url_exact"] : []),
          ...(sourceIdentifierMatch ? ["source_identifier_exact"] : []),
          ...(nameScore >= 85 ? ["normalized_name_fuzzy"] : []),
        ],
      });
      await db.orm.public.DuplicateMatch
        .upsert({
        update: {
          classification,
          similarityScore: score,
          explanation,
          reviewedAt: null,
          reviewedBy: null,
          resolution: null,
        },
        conflictOn: {
          primaryVictimId: primary.id,
          candidateVictimId: candidate.id,
        },
        create: {
          primaryVictimId: primary.id,
          candidateVictimId: candidate.id,
          classification,
          similarityScore: score,
          explanation,
        },
      });
      if (classification === "CONFIRMED_DUPLICATE") confirmed++;
      else potential++;
    }
  }

  await db.orm.public.CanonicalVictim.where((victim) =>
    victim.duplicateMatches.some((match) =>
      and(match.classification.eq("CONFIRMED_DUPLICATE"), match.reviewedAt.isNull()),
    ),
  ).updateAll({ duplicateStatus: "CONFIRMED_DUPLICATE" });
  await db.orm.public.CanonicalVictim.where((victim) =>
    victim.duplicateMatches.some((match) =>
      and(match.classification.eq("POTENTIAL_DUPLICATE"), match.reviewedAt.isNull()),
    ),
  ).updateAll({ duplicateStatus: "POTENTIAL_DUPLICATE" });

  return {
    victims: victims.length,
    compared,
    confirmed,
    potential,
  };
}
