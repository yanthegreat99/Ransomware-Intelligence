import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
require("dotenv").config({ path: ".env.local" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function key(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const groupAliases = JSON.parse(readFileSync(new URL("../src/lib/group-name-aliases.json", import.meta.url), "utf8"));
const aliases = new Map(Object.entries(groupAliases).map(([name, canonical]) => [key(name), canonical]));

function values(value) {
  return Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
}

function uniqueJson(...inputs) {
  const result = [];
  const seen = new Set();
  for (const value of inputs.flatMap(values)) {
    const serialized = JSON.stringify(value);
    if (seen.has(serialized)) continue;
    seen.add(serialized);
    result.push(value);
  }
  return result;
}

function mergeObject(target, source) {
  const left = target && typeof target === "object" && !Array.isArray(target) ? target : {};
  const right = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  return { ...right, ...left };
}

function dateMinimum(left, right) {
  if (!left) return right;
  if (!right) return left;
  return left < right ? left : right;
}

function dateMaximum(left, right) {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function profileSnapshot(group) {
  return {
    kind: "merged-group-profile",
    originalGroupId: group.id,
    originalGroupName: group.name,
    aliases: group.aliases,
    description: group.description,
    firstObserved: group.firstObserved?.toISOString() ?? null,
    lastObserved: group.lastObserved?.toISOString() ?? null,
    operationalStatus: group.operationalStatus,
    leakSiteUrls: group.leakSiteUrls,
    sourceRefs: group.sourceRefs,
    relationships: group.relationships,
    parserStatus: group.parserStatus,
    uptime30d: group.uptime30d,
    contactEmails: group.contactEmails,
    sessionIds: group.sessionIds,
    knownLocations: group.knownLocations,
    profileUrls: group.profileUrls,
    profileUpdatedAt: group.profileUpdatedAt?.toISOString() ?? null,
  };
}

async function mergeIntoTarget(source, canonicalName) {
  await prisma.$transaction(async (tx) => {
    const currentSource = await tx.ransomwareGroup.findUnique({ where: { id: source.id } });
    if (!currentSource) return;
    const target = await tx.ransomwareGroup.findUnique({ where: { name: canonicalName } });

    if (!target) {
      await tx.ransomwareGroup.update({
        where: { id: currentSource.id },
        data: {
          name: canonicalName,
          aliases: Array.from(new Set([...currentSource.aliases, currentSource.name])),
        },
      });
      return;
    }

    if (target.id === currentSource.id) return;

    const archivedSource = profileSnapshot(currentSource);
    const targetRefs = values(target.sourceRefs);
    const sourceRefs = values(currentSource.sourceRefs);
    const mergedSourceRefs = uniqueJson(targetRefs, sourceRefs, archivedSource);
    const data = {
      aliases: Array.from(new Set([
        ...target.aliases,
        ...currentSource.aliases,
        currentSource.name,
      ])),
      description: target.description ?? currentSource.description,
      firstObserved: dateMinimum(target.firstObserved, currentSource.firstObserved),
      lastObserved: dateMaximum(target.lastObserved, currentSource.lastObserved),
      operationalStatus: target.operationalStatus === "UNKNOWN"
        ? currentSource.operationalStatus
        : target.operationalStatus,
      leakSiteUrls: Array.from(new Set([...target.leakSiteUrls, ...currentSource.leakSiteUrls])),
      sourceRefs: mergedSourceRefs,
      relationships: uniqueJson(target.relationships, currentSource.relationships),
      parserStatus: target.parserStatus ?? currentSource.parserStatus,
      uptime30d: target.uptime30d ?? currentSource.uptime30d,
      contactEmails: Array.from(new Set([...target.contactEmails, ...currentSource.contactEmails])),
      sessionIds: Array.from(new Set([...target.sessionIds, ...currentSource.sessionIds])),
      knownLocations: uniqueJson(target.knownLocations, currentSource.knownLocations),
      profileUrls: mergeObject(target.profileUrls, currentSource.profileUrls),
      profileUpdatedAt: dateMaximum(target.profileUpdatedAt, currentSource.profileUpdatedAt),
    };

    await tx.canonicalVictim.updateMany({
      where: { ransomwareGroupId: currentSource.id },
      data: { ransomwareGroupId: target.id },
    });
    await tx.sourceDisclosure.updateMany({
      where: { ransomwareGroupId: currentSource.id },
      data: { ransomwareGroupId: target.id },
    });
    await tx.ransomwareGroup.update({ where: { id: target.id }, data });
    await tx.ransomwareGroup.delete({ where: { id: currentSource.id } });
  });
}

try {
  const apply = process.argv.includes("--apply");
  const groups = await prisma.ransomwareGroup.findMany({
    include: { _count: { select: { victims: true, disclosures: true } } },
    orderBy: { name: "asc" },
  });
  const disclosures = await prisma.sourceDisclosure.findMany({
    select: { ransomwareGroupId: true, sourceName: true, originalGroupName: true },
    where: { ransomwareGroupId: { not: null }, originalGroupName: { not: null } },
  });
  const disclosuresByGroup = new Map();
  for (const disclosure of disclosures) {
    const bucket = disclosuresByGroup.get(disclosure.ransomwareGroupId) ?? [];
    bucket.push(disclosure);
    disclosuresByGroup.set(disclosure.ransomwareGroupId, bucket);
  }
  for (const group of groups) {
    group.disclosures = disclosuresByGroup.get(group.id) ?? [];
  }
  const groupsByName = new Map(groups.map((group) => [group.name, group]));
  const groupsByKey = new Map();
  for (const group of groups) {
    const normalized = key(group.name);
    const bucket = groupsByKey.get(normalized) ?? [];
    bucket.push(group);
    groupsByKey.set(normalized, bucket);
  }

  const consensus = new Map();
  const ambiguous = [];
  for (const [normalized, bucket] of groupsByKey) {
    if (bucket.length < 2) continue;
    const sourceNames = new Map();
    for (const group of bucket) {
      for (const disclosure of group.disclosures) {
        if (disclosure.sourceName !== "ransomware.live" || !disclosure.originalGroupName) continue;
        const name = disclosure.originalGroupName;
        sourceNames.set(name, (sourceNames.get(name) ?? 0) + 1);
      }
    }
    const ranked = [...sourceNames.entries()].sort((left, right) => right[1] - left[1]);
    if (ranked.length && (!ranked[1] || ranked[0][1] > ranked[1][1])) {
      consensus.set(normalized, ranked[0][0]);
      continue;
    }
    const preferred = [...bucket].sort((left, right) => {
      const sourceCount = (group) => group.disclosures
        .filter((disclosure) => disclosure.sourceName === "ransomware.live")
        .length;
      return sourceCount(right) - sourceCount(left)
        || right._count.victims - left._count.victims
        || right._count.disclosures - left._count.disclosures
        || left.name.localeCompare(right.name);
    })[0];
    consensus.set(normalized, preferred.name);
  }

  const candidates = [];
  for (const group of groups) {
    const canonicalName = aliases.get(key(group.name)) ?? consensus.get(key(group.name));
    if (!canonicalName || canonicalName === group.name) continue;
    candidates.push({ id: group.id, name: group.name, canonicalName });
  }

  const plans = candidates.map((candidate) => ({
    ...candidate,
    merge: groupsByName.has(candidate.canonicalName) &&
      groupsByName.get(candidate.canonicalName).id !== candidate.id,
  }));
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    candidates: plans.length,
    mergeCount: plans.filter((item) => item.merge).length,
    renameCount: plans.filter((item) => !item.merge).length,
    ambiguous,
    plan: plans,
  }, null, 2));

  if (apply) {
    for (const candidate of plans) {
      await mergeIntoTarget(groupsByName.get(candidate.name), candidate.canonicalName);
    }
  }
} finally {
  await prisma.$disconnect();
}
