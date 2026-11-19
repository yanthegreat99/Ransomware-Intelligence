import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizeCountry } from "./countries";
import { groupNameKey, normalizeGroupName } from "./group-normalization";

export type DashboardRange = {
  from: Date;
  to: Date;
  label: string;
};

export type DashboardChartRow = {
  name: string;
  value: number;
};

export type DashboardData = {
  range: {
    from: string;
    to: string;
    label: string;
    bucket: string;
  };
  stats: Record<string, number>;
  charts: {
    trend: Array<{ date: string; count: number }>;
    countries: DashboardChartRow[];
    industries: DashboardChartRow[];
    groups: DashboardChartRow[];
    sources: DashboardChartRow[];
    verification: DashboardChartRow[];
  };
  recentVictims: Array<{
    id: string;
    name: string;
    country: string | null;
    firstReportedAt: string;
    verificationStatus: string;
    gicsSectorName: string | null;
    ransomwareGroupName: string | null;
  }>;
};

const presetDays: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "6m": 180,
  "1y": 365,
};

function parseDate(value: string, endOfDay: boolean): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Dates must use YYYY-MM-DD format");
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Invalid date range");
  }
  return date;
}

export function getDashboardRange(
  options: { range?: string | null; from?: string | null; to?: string | null } = {},
  now = new Date(),
): DashboardRange {
  const { range, from, to } = options;
  if (from || to) {
    if (!from || !to) throw new Error("Both start and end dates are required");
    const start = parseDate(from, false);
    const end = parseDate(to, true);
    if (start > end) throw new Error("Start date must be on or before end date");
    return { from: start, to: end, label: `${from} to ${to}` };
  }

  const selectedRange = range ?? "30d";
  const days = presetDays[selectedRange];
  if (!days) throw new Error("Unsupported dashboard date range");
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return {
    from: start,
    to: end,
    label: selectedRange.toUpperCase(),
  };
}

export async function loadDashboardData(range: DashboardRange): Promise<DashboardData> {
  const rangeWhere: Prisma.CanonicalVictimWhereInput = {
    firstReportedAt: { gte: range.from, lte: range.to },
  };
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const days = (range.to.getTime() - range.from.getTime()) / 86400000;
  const bucket = days <= 90 ? "day" : days <= 730 ? "week" : "month";
  const bucketExpression = bucket === "day"
    ? Prisma.sql`date_trunc('day', "firstReportedAt")`
    : bucket === "week"
      ? Prisma.sql`date_trunc('week', "firstReportedAt")`
      : Prisma.sql`date_trunc('month', "firstReportedAt")`;

  const [
    totalVictims,
    rangeVictims,
    todayVictims,
    last7,
    last30,
    groupCount,
    activeGroups,
    allCountries,
    industryCountRows,
    confirmedDuplicates,
    duplicateReviews,
    unverified,
    underReview,
    verified,
    disputed,
    countryRows,
    industryRows,
    groupRows,
    sourceDisclosureCount,
    sourceDisclosureRows,
    verificationRows,
    trendRows,
    recentRows,
  ] = await Promise.all([
    prisma.canonicalVictim.count(),
    prisma.canonicalVictim.count({ where: rangeWhere }),
    prisma.canonicalVictim.count({ where: { firstReportedAt: { gte: today } } }),
    prisma.canonicalVictim.count({ where: { firstReportedAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
    prisma.canonicalVictim.count({ where: { firstReportedAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
    prisma.ransomwareGroup.count(),
    prisma.ransomwareGroup.count({ where: { operationalStatus: "ACTIVE" } }),
    prisma.canonicalVictim.groupBy({ by: ["country"] }),
    prisma.canonicalVictim.groupBy({ by: ["gicsSectorName"], where: { gicsSectorName: { not: null } } }),
    prisma.duplicateMatch.count({ where: { classification: "CONFIRMED_DUPLICATE" } }),
    prisma.duplicateMatch.count({ where: { reviewedAt: null } }),
    prisma.canonicalVictim.count({ where: { verificationStatus: "UNVERIFIED" } }),
    prisma.canonicalVictim.count({ where: { verificationStatus: "UNDER_REVIEW" } }),
    prisma.canonicalVictim.count({ where: { verificationStatus: { in: ["VERIFIED", "PARTIALLY_VERIFIED"] } } }),
    prisma.canonicalVictim.count({ where: { verificationStatus: "DISPUTED" } }),
    prisma.canonicalVictim.groupBy({
      by: ["country"],
      where: { ...rangeWhere, country: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { country: "desc" } },
    }),
    prisma.canonicalVictim.groupBy({
      by: ["gicsSectorName"],
      where: rangeWhere,
      _count: { _all: true },
      orderBy: { _count: { gicsSectorName: "desc" } },
    }),
    prisma.canonicalVictim.groupBy({
      by: ["ransomwareGroupId"],
      where: rangeWhere,
      _count: { _all: true },
      orderBy: { _count: { ransomwareGroupId: "desc" } },
    }),
    prisma.sourceDisclosure.count(),
    prisma.sourceDisclosure.groupBy({
      by: ["sourceName"],
      _count: { _all: true },
      orderBy: { _count: { sourceName: "desc" } },
    }),
    prisma.canonicalVictim.groupBy({
      by: ["verificationStatus"],
      _count: { _all: true },
      orderBy: { _count: { verificationStatus: "desc" } },
    }),
    prisma.$queryRaw<Array<{ bucket: Date; count: number }>>(Prisma.sql`
      SELECT ${bucketExpression} AS "bucket", COUNT(*)::int AS "count"
      FROM "CanonicalVictim"
      WHERE "firstReportedAt" >= ${range.from} AND "firstReportedAt" <= ${range.to}
      GROUP BY 1
      ORDER BY 1
    `),
    prisma.canonicalVictim.findMany({
      where: rangeWhere,
      select: {
        id: true,
        name: true,
        country: true,
        firstReportedAt: true,
        verificationStatus: true,
        gicsSectorName: true,
        ransomwareGroup: { select: { name: true } },
      },
      orderBy: { firstReportedAt: "desc" },
      take: 10,
    }),
  ]);

  const countryCodes = new Set<string>();
  for (const row of allCountries) {
    const alpha2 = normalizeCountry(row.country)?.alpha2;
    if (alpha2) countryCodes.add(alpha2);
  }

  const groupIds = groupRows
    .map((row) => row.ransomwareGroupId)
    .filter((id): id is string => Boolean(id));
  const groups = await prisma.ransomwareGroup.findMany({
    where: { id: { in: groupIds } },
    select: { id: true, name: true },
  });
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const countries = new Map<string, DashboardChartRow>();
  for (const row of countryRows) {
    const country = normalizeCountry(row.country);
    if (!country) continue;
    const current = countries.get(country.alpha2);
    countries.set(country.alpha2, {
      name: country.name,
      value: (current?.value ?? 0) + row._count._all,
    });
  }

  const actors = new Map<string, DashboardChartRow>();
  for (const row of groupRows) {
    const rawName = row.ransomwareGroupId ? groupNames.get(row.ransomwareGroupId) : null;
    const name = normalizeGroupName(rawName) ?? "Unknown";
    const key = groupNameKey(name) || "unknown";
    const current = actors.get(key);
    actors.set(key, { name, value: (current?.value ?? 0) + row._count._all });
  }

  const sourceRows = sourceDisclosureRows.map((row) => ({
    name: row.sourceName,
    value: row._count._all,
  }));
  const verificationLabels: Record<string, string> = {
    VERIFIED: "Verified",
    PARTIALLY_VERIFIED: "Partially verified",
    UNVERIFIED: "Unverified",
    UNDER_REVIEW: "Under review",
    DISPUTED: "Disputed",
    REMOVED: "Removed",
  };

  return {
    range: {
      from: range.from.toISOString().slice(0, 10),
      to: range.to.toISOString().slice(0, 10),
      label: range.label,
      bucket,
    },
    stats: {
      totalVictims,
      rangeVictims,
      todayVictims,
      last7,
      last30,
      groupCount,
      activeGroups,
      countryCount: countryCodes.size,
      industryCount: industryCountRows.length,
      sourceDisclosureCount,
      confirmedDuplicates,
      duplicateReviews,
      unverified,
      underReview,
      verificationNeeded: unverified + underReview,
      verified,
      disputed,
    },
    charts: {
      trend: trendRows.map((row) => ({
        date: row.bucket.toISOString(),
        count: row.count,
      })),
      countries: [...countries.values()].sort((left, right) => right.value - left.value).slice(0, 10),
      industries: industryRows
        .map((row) => ({ name: row.gicsSectorName ?? "Unclassified", value: row._count._all }))
        .slice(0, 8),
      groups: [...actors.values()].sort((left, right) => right.value - left.value).slice(0, 10),
      sources: sourceRows,
      verification: verificationRows.map((row) => ({
        name: verificationLabels[row.verificationStatus] ?? row.verificationStatus,
        value: row._count._all,
      })),
    },
    recentVictims: recentRows.map((victim) => ({
      id: victim.id,
      name: victim.name,
      country: victim.country,
      firstReportedAt: victim.firstReportedAt.toISOString(),
      verificationStatus: victim.verificationStatus,
      gicsSectorName: victim.gicsSectorName,
      ransomwareGroupName: normalizeGroupName(victim.ransomwareGroup?.name) ?? null,
    })),
  };
}
