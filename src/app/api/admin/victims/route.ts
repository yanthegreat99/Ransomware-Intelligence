import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { asJson, getDb } from "@/lib/prisma";
import { normalizeDomain, normalizeName } from "@/lib/intelligence";
import { authorizeAdminRequest } from "@/lib/admin-auth";
import { normalizeCountry } from "@/lib/countries";

function authorize(request: NextRequest) {
  return authorizeAdminRequest(request);
}

const verificationEnum = z.enum([
  "VERIFIED",
  "PARTIALLY_VERIFIED",
  "UNVERIFIED",
  "DISPUTED",
  "REMOVED",
  "UNDER_REVIEW",
]);

const createSchema = z.object({
  name: z.string().trim().min(1).max(300),
  domain: z.string().trim().max(255).optional(),
  country: z.string().trim().max(100).optional(),
  region: z.string().trim().max(100).optional(),
  description: z.string().trim().max(5000).optional(),
  organisationType: z.string().trim().max(100).optional(),
  ransomwareGroup: z.string().trim().min(1).max(200).optional(),
  firstReportedAt: z.string().datetime({ offset: true }),
  verificationStatus: verificationEnum.optional(),
  legitimacyStatus: z.enum(["LEGITIMATE_ORGANISATION", "NOT_CONFIRMED", "DISPUTED", "UNKNOWN"]).optional(),
  incidentStatus: z.enum(["CORROBORATED_INCIDENT", "UNVERIFIED_CLAIM", "DISPUTED_CLAIM", "RETRACTED", "UNDER_REVIEW"]).optional(),
  confidenceScore: z.number().int().min(0).max(100).optional(),
  aliases: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
  sourceName: z.string().trim().max(200).optional(),
  sourceUrl: z.string().url().optional(),
  sourceIdentifier: z.string().trim().max(500).optional(),
  analyst: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(2000),
});

const updateSchema = z.object({
  victimId: z.string().cuid(),
  analyst: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(2000),
  name: z.string().trim().min(1).max(300).optional(),
  domain: z.string().trim().max(255).nullable().optional(),
  country: z.string().trim().max(100).nullable().optional(),
  region: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  organisationType: z.string().trim().max(100).nullable().optional(),
  ransomwareGroup: z.string().trim().max(200).nullable().optional(),
  verificationStatus: verificationEnum.optional(),
  legitimacyStatus: z.enum(["LEGITIMATE_ORGANISATION", "NOT_CONFIRMED", "DISPUTED", "UNKNOWN"]).optional(),
  incidentStatus: z.enum(["CORROBORATED_INCIDENT", "UNVERIFIED_CLAIM", "DISPUTED_CLAIM", "RETRACTED", "UNDER_REVIEW"]).optional(),
  confidenceScore: z.number().int().min(0).max(100).optional(),
  aliases: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
}).refine((input) => {
  const editable = ["name","domain","country","region","description","organisationType","ransomwareGroup","verificationStatus","legitimacyStatus","incidentStatus","confidenceScore","aliases"];
  return editable.some((field) => Object.prototype.hasOwnProperty.call(input, field));
}, { message: "At least one editable field is required" });

async function readJson(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });

  try {
    const input = parsed.data;
    const db = getDb();
    const result = await db.transaction(async (tx) => {
      let ransomwareGroupId: string | undefined;
      if (input.ransomwareGroup) {
        const group = await tx.orm.public.RansomwareGroup.upsert({
          create: {
            name: input.ransomwareGroup,
            firstObserved: new Date(input.firstReportedAt),
            lastObserved: new Date(input.firstReportedAt),
          },
          update: { lastObserved: new Date(input.firstReportedAt) },
          conflictOn: { name: input.ransomwareGroup },
        });
        ransomwareGroupId = group.id;
      }

      const domain = normalizeDomain(input.domain);
      const country = normalizeCountry(input.country);
      const victim = await tx.orm.public.CanonicalVictim.create({
          name: input.name,
          normalizedName: normalizeName(input.name),
          domain,
          normalizedDomain: domain,
          country: country?.name,
          countryCode: country?.alpha2,
          region: input.region,
          description: input.description,
          organisationType: input.organisationType,
          ransomwareGroupId,
          firstReportedAt: new Date(input.firstReportedAt),
          verificationStatus: input.verificationStatus ?? "UNDER_REVIEW",
          legitimacyStatus: input.legitimacyStatus ?? "UNKNOWN",
          incidentStatus: input.incidentStatus ?? "UNVERIFIED_CLAIM",
          confidenceScore: input.confidenceScore ?? 0,
          duplicateStatus: "UNIQUE_VICTIM",
          aliases: input.aliases ?? [],
      });

      await tx.orm.public.VictimEdit.create({
          victimId: victim.id,
          field: "manualCreation",
          oldValue: {},
          newValue: {
            name: victim.name,
            domain: victim.domain,
            country: victim.country,
            ransomwareGroupId: ransomwareGroupId ?? null,
          },
          analyst: input.analyst,
          reason: input.reason,
      });

      if (input.sourceName || input.sourceUrl || input.sourceIdentifier) {
        await tx.orm.public.SourceDisclosure.create({
            sourceName: input.sourceName ?? "Manual analyst entry",
            sourceIdentifier: input.sourceIdentifier,
            sourceUrl: input.sourceUrl,
            originalVictimName: input.name,
            originalGroupName: input.ransomwareGroup,
            originalCountry: input.country,
            publishedAt: new Date(input.firstReportedAt),
            rawData: asJson({ manualEntry: true }),
            normalizedData: asJson(input),
            canonicalVictimId: victim.id,
            ransomwareGroupId,
        });
      }
      return victim;
    });
    return NextResponse.json({ victim: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Victim creation failed" }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = updateSchema.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });

  try {
    const input = parsed.data;
    const db = getDb();
    const result = await db.transaction(async (tx) => {
      const existing = await tx.orm.public.CanonicalVictim.first({ id: input.victimId });
      if (!existing) throw new Error("Victim not found");

      const oldValue: Record<string, unknown> = {};
      const newValue: Record<string, unknown> = {};
      const data: {
        name?: string;
        normalizedName?: string;
        domain?: string | null;
        normalizedDomain?: string | null;
        country?: string | null;
        countryCode?: string | null;
        region?: string | null;
        description?: string | null;
        organisationType?: string | null;
        ransomwareGroupId?: string | null;
        verificationStatus?: z.infer<typeof verificationEnum>;
        legitimacyStatus?: string;
        incidentStatus?: string;
        confidenceScore?: number;
        aliases?: string[];
      } = {};
      const recordChange = (field: string, old: unknown, value: unknown) => {
        oldValue[field] = old;
        newValue[field] = value;
      };

      if (Object.prototype.hasOwnProperty.call(input, "name")) {
        data.name = input.name!;
        data.normalizedName = normalizeName(input.name!);
        recordChange("name", existing.name, input.name);
      }
      if (Object.prototype.hasOwnProperty.call(input, "domain")) {
        data.domain = normalizeDomain(input.domain);
        data.normalizedDomain = data.domain;
        recordChange("domain", existing.domain, data.domain);
      }
      if (Object.prototype.hasOwnProperty.call(input, "country")) {
        const country = normalizeCountry(input.country);
        data.country = country?.name ?? input.country ?? null;
        data.countryCode = country?.alpha2 ?? null;
        recordChange("country", existing.country, data.country);
      }
      if (Object.prototype.hasOwnProperty.call(input, "region")) {
        data.region = input.region;
        recordChange("region", existing.region, input.region);
      }
      if (Object.prototype.hasOwnProperty.call(input, "description")) {
        data.description = input.description;
        recordChange("description", existing.description, input.description);
      }
      if (Object.prototype.hasOwnProperty.call(input, "organisationType")) {
        data.organisationType = input.organisationType;
        recordChange("organisationType", existing.organisationType, input.organisationType);
      }
      if (Object.prototype.hasOwnProperty.call(input, "ransomwareGroup")) {
        if (input.ransomwareGroup === null) {
          data.ransomwareGroupId = null;
        } else if (input.ransomwareGroup) {
          const group = await tx.orm.public.RansomwareGroup.upsert({
            create: { name: input.ransomwareGroup },
            update: {},
            conflictOn: { name: input.ransomwareGroup },
          });
          data.ransomwareGroupId = group.id;
        }
        recordChange("ransomwareGroup", existing.ransomwareGroupId, input.ransomwareGroup);
      }
      if (Object.prototype.hasOwnProperty.call(input, "verificationStatus")) {
        data.verificationStatus = input.verificationStatus;
        recordChange("verificationStatus", existing.verificationStatus, input.verificationStatus);
      }
      if (Object.prototype.hasOwnProperty.call(input, "legitimacyStatus")) {
        data.legitimacyStatus = input.legitimacyStatus;
        recordChange("legitimacyStatus", existing.legitimacyStatus, input.legitimacyStatus);
      }
      if (Object.prototype.hasOwnProperty.call(input, "incidentStatus")) {
        data.incidentStatus = input.incidentStatus;
        recordChange("incidentStatus", existing.incidentStatus, input.incidentStatus);
      }
      if (Object.prototype.hasOwnProperty.call(input, "confidenceScore")) {
        data.confidenceScore = input.confidenceScore;
        recordChange("confidenceScore", existing.confidenceScore, input.confidenceScore);
      }
      if (Object.prototype.hasOwnProperty.call(input, "aliases")) {
        data.aliases = input.aliases;
        recordChange("aliases", existing.aliases, input.aliases);
      }

      await tx.orm.public.VictimEdit.create({
          victimId: existing.id,
          field: "analystEdit",
          oldValue: asJson(oldValue),
          newValue: asJson(newValue),
          analyst: input.analyst,
          reason: input.reason,
      });
      return tx.orm.public.CanonicalVictim.where({ id: existing.id }).update(data);
    });
    return NextResponse.json({ victim: result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Victim update failed" }, { status: 400 });
  }
}
