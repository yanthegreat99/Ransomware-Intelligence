import { fetchWithRetry } from "./http.ts";
import { normalizeCountry } from "./countries.ts";
import { normalizeDomain, safeDate } from "./intelligence.ts";
import { normalizeGroupName } from "./group-normalization.ts";

export type NormalizedDisclosure = {
  sourceName: string;
  sourceIdentifier?: string;
  sourceUrl?: string;
  victimName: string;
  groupName?: string;
  country?: string;
  industry?: string;
  domain?: string;
  targetedDomain?: string;
  description?: string;
  publishedAt?: Date;
  updatedAt?: Date;
  rawData?: Record<string, unknown>;
};

export type SourceAdapterRunStats = {
  recordsRetrieved: number;
  rejectedRecords: number;
  warnings: string[];
};

export interface SourceAdapter {
  name: string;
  runStats?: SourceAdapterRunStats;
  run(): Promise<NormalizedDisclosure[]>;
}

function emptyRunStats(): SourceAdapterRunStats {
  return { recordsRetrieved: 0, rejectedRecords: 0, warnings: [] };
}

function recordArray(payload: unknown, fields: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Source returned an invalid response shape");
  }
  const body = payload as Record<string, unknown>;
  for (const field of fields) {
    if (Array.isArray(body[field])) return body[field] as unknown[];
  }
  throw new Error("Source response did not contain a records array");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractDomain(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)/i);
  return match ? normalizeDomain(match[1]) : undefined;
}

export function parseRansomfeedPayloadWithStats(payload: unknown): {
  records: NormalizedDisclosure[];
  rejectedRecords: number;
} {
  const records = recordArray(payload, ["data", "results"]);
  const normalized: NormalizedDisclosure[] = [];
  let rejectedRecords = 0;
  for (const record of records) {
    if (!isRecord(record)) {
      rejectedRecords++;
      continue;
    }
    const row = record;
    const victimName = String(row.victim ?? "").trim();
    if (!victimName) {
      rejectedRecords++;
      continue;
    }
    const id = row.id === undefined || row.id === null ? undefined : String(row.id);
    const date = typeof row.date === "string" ? row.date : undefined;
    const country = normalizeCountry(
      typeof row.country === "string" && row.country !== "Non Disponibile"
        ? row.country
        : undefined,
    )?.name;
    const website = typeof row.website === "string" ? row.website : undefined;
    normalized.push({
      sourceName: "Ransomfeed",
      sourceIdentifier: id ? `rf-${id}` : undefined,
      sourceUrl: id ? `https://ransomfeed.it/frontend-core-v2/index.php?page=post_details&id_post=${id}` : undefined,
      victimName,
      groupName: normalizeGroupName(typeof row.gang === "string" ? row.gang : undefined) ?? undefined,
      country,
      industry: typeof row.work_sector === "string" && row.work_sector ? row.work_sector : undefined,
      domain: website,
      targetedDomain: website ? normalizeDomain(website) : undefined,
      description: typeof row.description === "string" ? row.description.trim() : undefined,
      publishedAt: date ? safeDate(date.replace(" ", "T")) : undefined,
      updatedAt: safeDate(row.updatedAt ?? row.updated_at ?? row.last_updated),
      rawData: row,
    });
  }
  return { records: normalized, rejectedRecords };
}

export function parseRansomfeedPayload(payload: unknown): NormalizedDisclosure[] {
  return parseRansomfeedPayloadWithStats(payload).records;
}

export function createRansomwareLiveUrl(
  endpoint: string,
  usePro: boolean,
  year: number,
  month: number,
): URL {
  const url = new URL(endpoint);
  const monthValue = String(month).padStart(2, "0");

  if (usePro) {
    url.pathname = url.pathname
      .replace(/\/recent\/?$/i, "")
      .replace(/\/recentvictims\/?$/i, "/victims")
      .replace(/\/+$/, "");
    if (!url.pathname.endsWith("/victims")) {
      url.pathname = `${url.pathname}/victims`;
    }
    url.pathname = `${url.pathname}/`;
    url.searchParams.set("year", String(year));
    url.searchParams.set("month", monthValue);
    return url;
  }

  url.pathname = url.pathname
    .replace(/\/recentvictims?\/?$/i, "/victims")
    .replace(/\/+$/, "");
  url.pathname = `${url.pathname}/${year}/${monthValue}`;
  return url;
}

export class RansomLookAdapter implements SourceAdapter {
  name = "RansomLook";
  runStats = emptyRunStats();

  async run(): Promise<NormalizedDisclosure[]> {
    this.runStats = emptyRunStats();
    const endpoint = process.env.RANSOMLOOK_API_URL;
    if (!endpoint) return [];

    const url = new URL(endpoint);
    url.searchParams.set("days", process.env.RANSOMLOOK_DAYS ?? "3650");
    const headers: Record<string, string> = { Accept: "application/json" };
    if (process.env.RANSOMLOOK_API_KEY) {
      headers.Authorization = process.env.RANSOMLOOK_API_KEY;
    }
    const response = await fetchWithRetry(url, {
      headers,
      next: { revalidate: 300 },
    });
    if (!response.ok) throw new Error(`RansomLook returned ${response.status}`);

    const payload = await response.json();
    const records = recordArray(payload, ["posts", "data"]);
    this.runStats.recordsRetrieved = records.length;
    const normalized: NormalizedDisclosure[] = [];

    for (const value of records) {
      if (!isRecord(value)) {
        this.runStats.rejectedRecords++;
        continue;
      }
      const record = value;
      const victimName = String(record.post_title ?? record.victim ?? record.name ?? record.title ?? "").trim();
      if (!victimName) {
        this.runStats.rejectedRecords++;
        continue;
      }
      const groupName = typeof record.group_name === "string"
        ? record.group_name
        : typeof record.group === "string"
          ? record.group
          : undefined;
      const discovered = record.discovered ?? record.date;
      const updated = record.updatedAt ?? record.updated_at ?? record.last_updated;
      normalized.push({
        sourceName: this.name,
        sourceIdentifier: String(record.id ?? record.slug ?? `${groupName ?? "group"}:${victimName}:${String(discovered ?? "")}`),
        sourceUrl: typeof record.url === "string" ? record.url : undefined,
        victimName,
        groupName: normalizeGroupName(groupName) ?? undefined,
        country: normalizeCountry(typeof record.country === "string" ? record.country : undefined)?.name,
        publishedAt: safeDate(discovered),
        updatedAt: safeDate(updated),
        targetedDomain: extractDomain(victimName),
        description: typeof record.description === "string" ? record.description.trim() : undefined,
        rawData: record,
      });
    }
    return normalized;
  }
}

export class RansomwareLiveAdapter implements SourceAdapter {
  name = "ransomware.live";
  runStats = emptyRunStats();

  async run(): Promise<NormalizedDisclosure[]> {
    this.runStats = emptyRunStats();
    const apiKey = process.env.RANSOMWARELIVE_API_KEY?.trim();
    const all: NormalizedDisclosure[] = [];
    const currentYear = new Date().getUTCFullYear();
    const startYear = 2019;
    const usePro = Boolean(apiKey);
    const configuredEndpoint = (
      usePro
        ? process.env.RANSOMWARELIVE_PRO_API_URL
        : process.env.RANSOMWARELIVE_API_URL
    )?.trim() || (
      usePro
        ? "https://api-pro.ransomware.live/victims/recent"
        : "https://api.ransomware.live/v2/recentvictims"
    );
    if (configuredEndpoint.toLowerCase() === "false") {
      throw new Error("ransomware.live ingestion is disabled");
    }
    for (let year = startYear; year <= currentYear; year++) {
      for (let month = 1; month <= 12; month++) {
        if (year === currentYear && month > new Date().getUTCMonth() + 1) break;
        const endpoint = createRansomwareLiveUrl(configuredEndpoint, usePro, year, month);
        const headers: Record<string, string> = { Accept: "application/json" };
        if (apiKey) headers["X-API-KEY"] = apiKey;
        const response = await fetchWithRetry(endpoint, {
          headers,
          next: { revalidate: 300 },
        });
        if (response.status === 404) continue;
        if (response.status === 429) throw new Error(`ransomware.live rate limited at ${year}-${month}`);
        if (!response.ok) throw new Error(`ransomware.live returned ${response.status} at ${year}-${month}`);
        const payload = await response.json();
        const records = recordArray(payload, ["victims", "data"]);
        this.runStats.recordsRetrieved += records.length;
        for (const value of records) {
          if (!isRecord(value)) {
            this.runStats.rejectedRecords++;
            continue;
          }
          const record = value;
          const victimName = String(record.victim ?? record.name ?? "").trim();
          if (!victimName) {
            this.runStats.rejectedRecords++;
            continue;
          }
          const groupName = normalizeGroupName(typeof record.group === "string" ? record.group : undefined) ?? undefined;
          const published = typeof record.discovered === "string"
            ? record.discovered
            : typeof record.attackdate === "string"
              ? record.attackdate
              : undefined;
          const sourceUrl = typeof record.url === "string" ? record.url : undefined;
          const permalink = typeof record.permalink === "string" ? record.permalink : sourceUrl;
          const website = typeof record.website === "string" ? record.website : undefined;
          const activity = typeof record.activity === "string" ? record.activity : undefined;
          all.push({
            sourceName: this.name,
            sourceIdentifier: String(record.id ?? record.uuid ?? record.slug ?? `${victimName}:${groupName}:${published ?? ""}`),
            sourceUrl: permalink,
            domain: website,
            targetedDomain: website ? normalizeDomain(website) : undefined,
            victimName,
            groupName,
            country: normalizeCountry(typeof record.country === "string" ? record.country : undefined)?.name,
            industry: activity,
            publishedAt: safeDate(published),
            updatedAt: safeDate(record.updatedAt ?? record.updated_at ?? record.last_updated),
            description: typeof record.description === "string" ? record.description.trim() : undefined,
            rawData: record,
          });
        }
      }
    }
    return all;
  }
}

export class RansomfeedAdapter implements SourceAdapter {
  name = "Ransomfeed";
  runStats = emptyRunStats();

  async run(): Promise<NormalizedDisclosure[]> {
    this.runStats = emptyRunStats();
    const baseUrl = process.env.RANSOMFEED_API_URL ?? "https://api.ransomfeed.it";
    const all: NormalizedDisclosure[] = [];
    const currentYear = new Date().getUTCFullYear();
    for (let year = 2019; year <= currentYear; year++) {
      const response = await fetchWithRetry(`${baseUrl.replace(/\/$/, "")}/date/${year}/offset/1000`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 300 },
      });
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "60");
        throw new Error(`Ransomfeed rate limited; retry after ${retryAfter} seconds`);
      }
      if (response.status === 404) continue;
      if (!response.ok) throw new Error(`Ransomfeed returned ${response.status} for ${year}`);
      const payload = await response.json();
      const records = recordArray(payload, ["data", "results"]);
      this.runStats.recordsRetrieved += records.length;
      const normalized = parseRansomfeedPayloadWithStats(records);
      this.runStats.rejectedRecords += normalized.rejectedRecords;
      if (records.length >= 1000) {
        this.runStats.warnings.push(
          `Ransomfeed ${year} reached the documented 1,000-record request maximum; additional records may be omitted.`,
        );
      }
      all.push(...normalized.records);
    }
    return all;
  }
}
