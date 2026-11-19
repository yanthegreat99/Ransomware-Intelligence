import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizeDomain, normalizeName, similarityScore, hasDistinctOrganisationRoots } from "./intelligence";
import { createHash, randomUUID } from "node:crypto";
import { SourceAdapter } from "./source-adapter";
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

export async function ingestAdapter(adapter: SourceAdapter) {
  const ownerToken = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await prisma.ingestionLease.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  let leaseCreated = false;
  try {
    await prisma.ingestionLease.create({
      data: { sourceName: adapter.name, ownerToken, expiresAt },
    });
    leaseCreated = true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return null;
    }
    throw error;
  }

  const run = await prisma.ingestionRun.create({
    data: { sourceName: adapter.name, status: "RUNNING" },
  });

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
    const persistedGroups = await prisma.ransomwareGroup.findMany({
      select: { id: true, name: true, firstObserved: true, lastObserved: true },
    });
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
        const normalizedData = JSON.parse(JSON.stringify(normalizedRecord)) as Prisma.InputJsonValue;
        const originalData = JSON.parse(JSON.stringify(rawData ?? normalizedRecord)) as Prisma.InputJsonValue;
        const existingDisclosure = await prisma.sourceDisclosure.findUnique({
          where: {
            sourceName_sourceIdentifier: {
              sourceName: record.sourceName,
              sourceIdentifier: record.sourceIdentifier,
            },
          },
        });

        let groupId: string | undefined;
        if (record.groupName) {
          const normalizedGroupName = normalizeGroupName(record.groupName) ?? record.groupName;
          const normalizedGroupKey = groupNameKey(normalizedGroupName);
          let group = groupCache.get(normalizedGroupKey);
          if (!group) {
            const persisted = await prisma.ransomwareGroup.upsert({
              where: { name: normalizedGroupName },
              update: {},
              create: {
                name: normalizedGroupName,
                firstObserved: record.publishedAt,
                lastObserved: record.publishedAt,
              },
              select: { id: true, firstObserved: true, lastObserved: true },
            });
            group = {
              ...persisted,
              persistedFirstObserved: persisted.firstObserved,
              persistedLastObserved: persisted.lastObserved,
            };
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
        let victim = await prisma.canonicalVictim.findFirst({
          where: {
            OR: [
              { normalizedName },
              ...(normalizedDomain ? [{ normalizedDomain }] : []),
            ],
          },
        });

        if (!victim) {
          victim = await prisma.canonicalVictim.create({
            data: {
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
            },
          });
          recordsCreated++;
        } else {
          recordsUpdated++;
          if (!victim.normalizedDomain) {
            const normalizedDomain = normalizeDomain(record.domain);
            if (normalizedDomain) {
              await prisma.canonicalVictim.update({
                where: { id: victim.id },
                data: { normalizedDomain, domain: normalizedDomain },
              });
            }
          }
          if (country && !victim.countryCode) {
            await prisma.canonicalVictim.update({
              where: { id: victim.id },
              data: { country: country.name, countryCode: country.alpha2 },
            });
          }
          if (targetedDomain && !victim.targetedDomainNormalized) {
            await prisma.canonicalVictim.update({
              where: { id: victim.id },
              data: {
                targetedDomain,
                targetedDomainNormalized: targetedDomain,
              },
            });
          }
          if (record.description && !victim.description) {
            await prisma.canonicalVictim.update({
              where: { id: victim.id },
              data: { description: record.description },
            });
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
            await prisma.sourceDisclosure.update({
              where: { id: existingDisclosure.id },
              data: {
                rawData: appendSourceDisclosureHistory(existingDisclosure.rawData, {
                  sourceName: existingDisclosure.sourceName,
                  sourceIdentifier: existingDisclosure.sourceIdentifier,
                  sourceUrl: existingDisclosure.sourceUrl,
                  normalizedData: existingDisclosure.normalizedData,
                  publishedAt: existingDisclosure.publishedAt,
                  updatedAtSource: existingDisclosure.updatedAtSource,
                  targetedDomain: existingDisclosure.targetedDomain,
                  canonicalVictimId: existingDisclosure.canonicalVictimId,
                  ransomwareGroupId: existingDisclosure.ransomwareGroupId,
                }) as Prisma.InputJsonValue,
                updatedAtSource: nextUpdatedAtSource,
                normalizedData,
                canonicalVictimId: victim.id,
                ransomwareGroupId: nextGroupId,
                targetedDomain: nextTargetedDomain,
              },
            });
            updatedDisclosures++;
          }
        } else {
          await prisma.sourceDisclosure.create({
            data: {
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
            },
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
      await prisma.ransomwareGroup.update({
        where: { id: group.id },
        data: {
          firstObserved: group.firstObserved,
          lastObserved: group.lastObserved,
        },
      });
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  adapterStats = adapter.runStats ?? adapterStats;
  const allRejectedRecords = adapterStats.rejectedRecords + rejectedRecords;
  const hasWarnings = adapterStats.warnings.length > 0;
  const hasProblems = errors.length > 0 || allRejectedRecords > 0 || hasWarnings;
  const completedRun = await prisma.ingestionRun.update({
    where: { id: run.id },
    data: {
      status: hasProblems
        ? (recordsRead || adapterStats.recordsRetrieved ? "PARTIAL" : "FAILED")
        : "SUCCESS",
      completedAt: new Date(),
      recordsRead,
      recordsCreated,
      recordsUpdated,
      errorCount: errors.length,
      errors,
      metadata: {
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
      },
    },
  });
  if (leaseCreated) {
    await prisma.ingestionLease.deleteMany({
      where: { sourceName: adapter.name, ownerToken },
    });
  }
  return completedRun;
}

export async function detectDuplicates(victimId: string) {
  const victim = await prisma.canonicalVictim.findUnique({ where: { id: victimId } });
  if (!victim) return [];

  const candidates = await prisma.canonicalVictim.findMany({
    where: { id: { not: victimId } },
  });
  const matches = [];

  for (const candidate of candidates) {
    const nameScore = similarityScore(victim.name, candidate.name);
    const aliasMatch = candidate.aliases.some((alias) =>
      normalizeName(alias) === victim.normalizedName,
    ) || victim.aliases.some((alias) =>
      normalizeName(alias) === candidate.normalizedName,
    );
    const domainMatch =
      Boolean(victim.normalizedDomain && candidate.normalizedDomain) &&
      victim.normalizedDomain === candidate.normalizedDomain;
    const [victimSources, candidateSources] = await Promise.all([
      prisma.sourceDisclosure.findMany({ where: { canonicalVictimId: victim.id }, select: { sourceIdentifier: true, sourceUrl: true } }),
      prisma.sourceDisclosure.findMany({ where: { canonicalVictimId: candidate.id }, select: { sourceIdentifier: true, sourceUrl: true } }),
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
      matches.push(
        await prisma.duplicateMatch.upsert({
          where: {
            primaryVictimId_candidateVictimId: {
              primaryVictimId: victim.id,
              candidateVictimId: candidate.id,
            },
          },
          update: {
            classification: score === 100 ? "CONFIRMED_DUPLICATE" : "POTENTIAL_DUPLICATE",
            similarityScore: score,
            explanation: {
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
            },
          },
          create: {
            primaryVictimId: victim.id,
            candidateVictimId: candidate.id,
            classification: score === 100 ? "CONFIRMED_DUPLICATE" : "POTENTIAL_DUPLICATE",
            similarityScore: score,
            explanation: {
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
            },
          },
        }),
      );
    }
  }
  return matches;
}

export async function detectAllDuplicates() {
  const victims = await prisma.canonicalVictim.findMany({
    select: {
      id: true,
      name: true,
      normalizedName: true,
      normalizedDomain: true,
      aliases: true,
    },
  });

  const disclosures = await prisma.sourceDisclosure.findMany({
    select: {
      canonicalVictimId: true,
      sourceIdentifier: true,
      sourceUrl: true,
    },
  });
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
        candidate.aliases.some((alias) => normalizeName(alias) === primary.normalizedName) ||
        primary.aliases.some((alias) => normalizeName(alias) === candidate.normalizedName);
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
      await prisma.duplicateMatch.upsert({
        where: {
          primaryVictimId_candidateVictimId: {
            primaryVictimId: primary.id,
            candidateVictimId: candidate.id,
          },
        },
        update: {
          classification,
          similarityScore: score,
          explanation: {
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
          },
          reviewedAt: null,
          reviewedBy: null,
          resolution: null,
        },
        create: {
          primaryVictimId: primary.id,
          candidateVictimId: candidate.id,
          classification,
          similarityScore: score,
          explanation: {
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
          },
        },
      });
      if (classification === "CONFIRMED_DUPLICATE") confirmed++;
      else potential++;
    }
  }

  await prisma.canonicalVictim.updateMany({
    where: {
      duplicateMatches: { some: { classification: "CONFIRMED_DUPLICATE", reviewedAt: null } },
    },
    data: { duplicateStatus: "CONFIRMED_DUPLICATE" },
  });
  await prisma.canonicalVictim.updateMany({
    where: {
      duplicateMatches: { some: { classification: "POTENTIAL_DUPLICATE", reviewedAt: null } },
    },
    data: { duplicateStatus: "POTENTIAL_DUPLICATE" },
  });

  return {
    victims: victims.length,
    compared,
    confirmed,
    potential,
  };
}
