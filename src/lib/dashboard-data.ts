import { getDb } from "./prisma";
import { normalizeCountry } from "./countries";
import { groupNameKey, normalizeGroupName } from "./group-normalization";
import { and } from "@prisma/orm-postgres/orm-client";
import { unstable_cache } from "next/cache";

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

const loadDashboardDataUncached = async (range: DashboardRange): Promise<DashboardData> => {
  const db = getDb();
  const count = async (result: PromiseLike<{ total: number }>) => (await result).total;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const days = (range.to.getTime() - range.from.getTime()) / 86400000;
  const bucket = days <= 90 ? "day" : days <= 730 ? "week" : "month";

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
    count(db.orm.public.CanonicalVictim.aggregate((aggregate) => ({ total: aggregate.count() }))),
    count(db.orm.public.CanonicalVictim.where((victim) =>
      and(victim.firstReportedAt.gte(range.from), victim.firstReportedAt.lte(range.to)),
    ).aggregate((aggregate) => ({ total: aggregate.count() }))),
    count(db.orm.public.CanonicalVictim.where((victim) => victim.firstReportedAt.gte(today)).aggregate((aggregate) => ({ total: aggregate.count() }))),
    count(db.orm.public.CanonicalVictim.where((victim) => victim.firstReportedAt.gte(new Date(Date.now() - 7 * 86400000))).aggregate((aggregate) => ({ total: aggregate.count() }))),
    count(db.orm.public.CanonicalVictim.where((victim) => victim.firstReportedAt.gte(new Date(Date.now() - 30 * 86400000))).aggregate((aggregate) => ({ total: aggregate.count() }))),
    count(db.orm.public.RansomwareGroup.aggregate((aggregate) => ({ total: aggregate.count() }))),
    count(db.orm.public.RansomwareGroup.where({ operationalStatus: "ACTIVE" }).aggregate((aggregate) => ({ total: aggregate.count() }))),
    db.orm.public.CanonicalVictim.groupBy("country").aggregate((aggregate) => ({ count: aggregate.count() })),
    db.orm.public.CanonicalVictim.where((victim) => victim.gicsSectorName.isNotNull())
      .groupBy("gicsSectorName")
      .aggregate((aggregate) => ({ count: aggregate.count() })),
    count(db.orm.public.DuplicateMatch.where({ classification: "CONFIRMED_DUPLICATE" }).aggregate((aggregate) => ({ total: aggregate.count() }))),
    count(db.orm.public.DuplicateMatch.where((match) => match.reviewedAt.isNull()).aggregate((aggregate) => ({ total: aggregate.count() }))),
    count(db.orm.public.CanonicalVictim.where({ verificationStatus: "UNVERIFIED" }).aggregate((aggregate) => ({ total: aggregate.count() }))),
    count(db.orm.public.CanonicalVictim.where({ verificationStatus: "UNDER_REVIEW" }).aggregate((aggregate) => ({ total: aggregate.count() }))),
    count(db.orm.public.CanonicalVictim.where((victim) => victim.verificationStatus.in(["VERIFIED", "PARTIALLY_VERIFIED"])).aggregate((aggregate) => ({ total: aggregate.count() }))),
    count(db.orm.public.CanonicalVictim.where({ verificationStatus: "DISPUTED" }).aggregate((aggregate) => ({ total: aggregate.count() }))),
    db.orm.public.CanonicalVictim.where((victim) =>
      and(victim.firstReportedAt.gte(range.from), victim.firstReportedAt.lte(range.to)),
    )
      .where((victim) => victim.country.isNotNull())
      .groupBy("country")
      .aggregate((aggregate) => ({ count: aggregate.count() })),
    db.orm.public.CanonicalVictim.where((victim) =>
      and(victim.firstReportedAt.gte(range.from), victim.firstReportedAt.lte(range.to)),
    )
      .groupBy("gicsSectorName")
      .aggregate((aggregate) => ({ count: aggregate.count() })),
    db.orm.public.CanonicalVictim.where((victim) =>
      and(victim.firstReportedAt.gte(range.from), victim.firstReportedAt.lte(range.to)),
    )
      .groupBy("ransomwareGroupId")
      .aggregate((aggregate) => ({ count: aggregate.count() })),
    count(db.orm.public.SourceDisclosure.aggregate((aggregate) => ({ total: aggregate.count() }))),
    db.orm.public.SourceDisclosure.groupBy("sourceName").aggregate((aggregate) => ({ count: aggregate.count() })),
    db.orm.public.CanonicalVictim.groupBy("verificationStatus").aggregate((aggregate) => ({ count: aggregate.count() })),
    db.orm.public.CanonicalVictim.where((victim) =>
      and(victim.firstReportedAt.gte(range.from), victim.firstReportedAt.lte(range.to)),
    )
      .groupBy("firstReportedAt")
      .aggregate((aggregate) => ({ count: aggregate.count() })),
    db.orm.public.CanonicalVictim.where((victim) =>
      and(victim.firstReportedAt.gte(range.from), victim.firstReportedAt.lte(range.to)),
    )
      .include("ransomwareGroup", (group) => group.select("name"))
      .select("id", "name", "country", "firstReportedAt", "verificationStatus", "gicsSectorName")
      .orderBy((victim) => victim.firstReportedAt.desc())
      .limit(10)
      .all(),
  ]);

  const countryCodes = new Set<string>();
  for (const row of allCountries) {
    const alpha2 = normalizeCountry(row.country)?.alpha2;
    if (alpha2) countryCodes.add(alpha2);
  }

  const groupIds = groupRows
    .map((row) => row.ransomwareGroupId)
    .filter((id): id is string => Boolean(id));
  const groups = groupIds.length
    ? await db.orm.public.RansomwareGroup.where((group) => group.id.in(groupIds)).select("id", "name").all()
    : [];
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const countries = new Map<string, DashboardChartRow>();
  for (const row of countryRows) {
    const country = normalizeCountry(row.country);
    if (!country) continue;
    const current = countries.get(country.alpha2);
    countries.set(country.alpha2, {
      name: country.name,
      value: (current?.value ?? 0) + row.count,
    });
  }

  const actors = new Map<string, DashboardChartRow>();
  for (const row of groupRows) {
    const rawName = row.ransomwareGroupId ? groupNames.get(row.ransomwareGroupId) : null;
    const name = normalizeGroupName(rawName) ?? "Unknown";
    const key = groupNameKey(name) || "unknown";
    const current = actors.get(key);
    actors.set(key, { name, value: (current?.value ?? 0) + row.count });
  }

  const sourceRows = sourceDisclosureRows.map((row) => ({
    name: row.sourceName,
    value: row.count,
  })).sort((left, right) => right.value - left.value);
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
      trend: (() => {
        const totals = new Map<string, number>();
        for (const row of trendRows) {
          const date = new Date(row.firstReportedAt);
          date.setUTCHours(0, 0, 0, 0);
          if (bucket === "week") date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
          if (bucket === "month") date.setUTCDate(1);
          const key = date.toISOString();
          totals.set(key, (totals.get(key) ?? 0) + row.count);
        }
        return [...totals].sort(([left], [right]) => left.localeCompare(right))
          .map(([date, count]) => ({ date, count }));
      })(),
      countries: [...countries.values()].sort((left, right) => right.value - left.value).slice(0, 10),
      industries: industryRows
        .map((row) => ({ name: row.gicsSectorName ?? "Unclassified", value: row.count }))
        .sort((left, right) => right.value - left.value)
        .slice(0, 8),
      groups: [...actors.values()].sort((left, right) => right.value - left.value).slice(0, 10),
      sources: sourceRows,
      verification: verificationRows.map((row) => ({
        name: verificationLabels[row.verificationStatus] ?? row.verificationStatus,
        value: row.count,
      })).sort((left, right) => right.value - left.value),
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
};

const loadCachedDashboardData = unstable_cache(
  async (from: string, to: string | null, label: string) =>
    loadDashboardDataUncached({
      from: parseDate(from, false),
      to: to ? parseDate(to, true) : new Date(),
      label,
    }),
  ["public-dashboard-analytics-v1"],
  { revalidate: 300 },
);

export async function loadDashboardData(range: DashboardRange): Promise<DashboardData> {
  const isPresetRange = Object.hasOwn(presetDays, range.label.toLowerCase());
  return loadCachedDashboardData(
    range.from.toISOString().slice(0, 10),
    isPresetRange ? null : range.to.toISOString().slice(0, 10),
    range.label,
  );
}
