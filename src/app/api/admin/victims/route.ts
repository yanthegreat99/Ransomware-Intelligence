import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
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
    const result = await prisma.$transaction(async (tx) => {
      let ransomwareGroupId: string | undefined;
      if (input.ransomwareGroup) {
        const group = await tx.ransomwareGroup.upsert({
          where: { name: input.ransomwareGroup },
          update: { lastObserved: new Date(input.firstReportedAt) },
          create: {
            name: input.ransomwareGroup,
            firstObserved: new Date(input.firstReportedAt),
            lastObserved: new Date(input.firstReportedAt),
          },
        });
        ransomwareGroupId = group.id;
      }

      const domain = normalizeDomain(input.domain);
      const country = normalizeCountry(input.country);
      const victim = await tx.canonicalVictim.create({
        data: {
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
        },
      });

      await tx.victimEdit.create({
        data: {
          victimId: victim.id,
          field: "manualCreation",
          oldValue: {},
          newValue: {
            name: victim.name,
            domain: victim.domain,
            country: victim.country,
            ransomwareGroupId,
          },
          analyst: input.analyst,
          reason: input.reason,
        },
      });

      if (input.sourceName || input.sourceUrl || input.sourceIdentifier) {
        await tx.sourceDisclosure.create({
          data: {
            sourceName: input.sourceName ?? "Manual analyst entry",
            sourceIdentifier: input.sourceIdentifier,
            sourceUrl: input.sourceUrl,
            originalVictimName: input.name,
            originalGroupName: input.ransomwareGroup,
            originalCountry: input.country,
            publishedAt: new Date(input.firstReportedAt),
            rawData: { manualEntry: true },
            normalizedData: input as unknown as Prisma.InputJsonValue,
            canonicalVictimId: victim.id,
            ransomwareGroupId,
          },
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
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.canonicalVictim.findUnique({ where: { id: input.victimId } });
      if (!existing) throw new Error("Victim not found");

      const fields = [
        "name","domain","country","region","description","organisationType","ransomwareGroup",
        "verificationStatus","legitimacyStatus","incidentStatus","confidenceScore","aliases",
      ] as const;
      const oldValue: Record<string, unknown> = {};
      const newValue: Record<string, unknown> = {};
      const data: Record<string, unknown> = {};

      for (const field of fields) {
        if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
        let value = input[field as keyof typeof input];
        if (field === "domain" && typeof value === "string") value = normalizeDomain(value);
        if (field === "country" && typeof value === "string") {
          const country = normalizeCountry(value);
          if (country) {
            data.countryCode = country.alpha2;
            value = country.name;
          }
        }
        if (field === "name" && typeof value === "string") {
          data.normalizedName = normalizeName(value);
        }
        if (field === "ransomwareGroup") {
          if (value === null) {
            data.ransomwareGroupId = null;
          } else if (typeof value === "string") {
            const group = await tx.ransomwareGroup.upsert({
              where: { name: value },
              update: {},
              create: { name: value },
            });
            data.ransomwareGroupId = group.id;
          }
          continue;
        }
        if (field === "domain") data.normalizedDomain = typeof value === "string" ? normalizeDomain(value) : null;
        oldValue[field] = existing[field as keyof typeof existing];
        newValue[field] = value;
        data[field] = value;
      }

      await tx.victimEdit.create({
        data: {
          victimId: existing.id,
          field: "analystEdit",
          oldValue: oldValue as Prisma.InputJsonValue,
          newValue: newValue as Prisma.InputJsonValue,
          analyst: input.analyst,
          reason: input.reason,
        },
      });
      return tx.canonicalVictim.update({
        where: { id: existing.id },
        data: data as Prisma.CanonicalVictimUpdateInput,
      });
    });
    return NextResponse.json({ victim: result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Victim update failed" }, { status: 400 });
  }
}
