import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authorizeAdminRequest } from "@/lib/admin-auth";
import { normalizeCountry } from "@/lib/countries";

function authorize(request: NextRequest) {
  return authorizeAdminRequest(request);
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { searchParams } = request.nextUrl;
    const queue = searchParams.get("queue") ?? "overview";
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 50)));
    const offsetValue = Number(searchParams.get("offset") ?? 0);
    if (!Number.isSafeInteger(offsetValue) || offsetValue < 0) {
      return NextResponse.json({ error: "Invalid queue offset" }, { status: 400 });
    }
    const [duplicateCount, verificationCount, classificationCount, runs, taxonomy, mergeHistory] = await Promise.all([
      prisma.duplicateMatch.count({ where: { reviewedAt: null } }),
      prisma.canonicalVictim.count({ where: { verificationStatus: { in: ["UNDER_REVIEW", "UNVERIFIED"] } } }),
      prisma.canonicalVictim.count({ where: { gicsConfidence: "UNCLASSIFIED" } }),
      prisma.ingestionRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
      queue === "classification"
        ? prisma.gicsTaxonomy.findMany({ orderBy: [{ sectorCode:"asc" }, { industryGroupCode:"asc" }, { industryCode:"asc" }, { subIndustryCode:"asc" }] })
        : Promise.resolve([]),
      prisma.victimEdit.findMany({
        where: { field: { in: ["mergedVictim","confirmedDuplicate","gicsAndVerification"] } },
        include: { victim: { select: { id:true,name:true } } },
        orderBy: { createdAt:"desc" },
        take:20,
      }),
    ]);

    const [duplicates, verification, classifications] = await Promise.all([
      queue === "duplicates"
        ? prisma.duplicateMatch.findMany({
            where: { reviewedAt: null },
            include: {
              primaryVictim: { select: { id:true,name:true,domain:true,targetedDomain:true,country:true,description:true,firstReportedAt:true,ransomwareGroup:{select:{name:true}} } },
              candidateVictim: { select: { id:true,name:true,domain:true,targetedDomain:true,country:true,description:true,firstReportedAt:true,ransomwareGroup:{select:{name:true}} } },
            },
            orderBy: { similarityScore: "desc" },
            take:limit,
          })
        : Promise.resolve([]),
      queue === "verification"
        ? prisma.canonicalVictim.findMany({
            where: { verificationStatus: { in: ["UNDER_REVIEW", "UNVERIFIED"] } },
            select: { id:true,name:true,domain:true,region:true,country:true,description:true,verificationStatus:true,legitimacyStatus:true,incidentStatus:true,confidenceScore:true },
            orderBy: { lastCheckedAt: "desc" },
            take:limit,
          })
        : Promise.resolve([]),
      queue === "classification"
        ? prisma.canonicalVictim.findMany({
            where: { gicsConfidence: "UNCLASSIFIED" },
            select: {
              id:true,name:true,domain:true,targetedDomain:true,country:true,description:true,
              verificationStatus:true,legitimacyStatus:true,incidentStatus:true,confidenceScore:true,
              disclosures: { select: { sourceName:true,sourceUrl:true,targetedDomain:true,originalIndustry:true }, take:5 },
            },
            orderBy: { firstReportedAt: "desc" },
            skip: offsetValue,
            take:limit,
          })
        : Promise.resolve([]),
    ]);
    return NextResponse.json({
      duplicates,
      verification,
      classifications,
      runs,
      taxonomy,
      mergeHistory,
      classificationOffset: offsetValue,
      classificationLimit: limit,
      counts: {
        duplicates: duplicateCount,
        verification: verificationCount,
        classification: classificationCount,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Database unavailable", detail: error instanceof Error ? error.message : "Unknown error" }, { status: 503 });
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("classify_and_verify"),
    victimId: z.string().cuid(),
    subIndustryCode: z.string().trim().min(1).max(20),
    country: z.string().trim().max(100).nullable().optional(),
    confidence: z.enum(["HIGH","MEDIUM","LOW","UNCLASSIFIED"]),
    analyst: z.string().trim().min(1).max(100),
    reason: z.string().trim().min(1).max(2000),
  }),
  z.object({
    action: z.literal("resolve_duplicate"),
    matchId: z.string().cuid(),
    classification: z.enum(["CONFIRMED_DUPLICATE", "POTENTIAL_DUPLICATE", "UNIQUE_VICTIM"]),
    analyst: z.string().trim().min(1).max(100),
    reason: z.string().trim().max(2000).optional(),
  }),
  z.object({
    action: z.literal("merge_victims"),
    canonicalId: z.string().cuid(),
    duplicateId: z.string().cuid(),
    analyst: z.string().trim().min(1).max(100),
    reason: z.string().trim().min(1).max(2000),
  }),
  z.object({
    action: z.literal("verify_victim"),
    victimId: z.string().cuid(),
    status: z.enum(["VERIFIED", "PARTIALLY_VERIFIED", "UNVERIFIED", "DISPUTED", "REMOVED", "UNDER_REVIEW"]),
    legitimacyStatus: z.enum(["LEGITIMATE_ORGANISATION", "NOT_CONFIRMED", "DISPUTED", "UNKNOWN"]).optional(),
    incidentStatus: z.enum(["CORROBORATED_INCIDENT", "UNVERIFIED_CLAIM", "DISPUTED_CLAIM", "RETRACTED", "UNDER_REVIEW"]).optional(),
    confidenceScore: z.number().int().min(0).max(100).optional(),
    analyst: z.string().trim().min(1).max(100),
    reason: z.string().trim().min(1).max(2000),
    evidence: z.array(z.object({
      sourceUrl: z.string().url().optional(),
      sourceName: z.string().trim().max(200).optional(),
      evidenceType: z.string().trim().min(1).max(100),
      evidence: z.string().trim().min(1).max(5000),
      supports: z.boolean(),
    })).max(50).optional(),
  }),
  z.object({
    action: z.literal("classify_victim"),
    victimId: z.string().cuid(),
    sectorCode: z.string().trim().min(1).max(20),
    sectorName: z.string().trim().min(1).max(200),
    industryGroupCode: z.string().trim().optional(),
    industryGroupName: z.string().trim().optional(),
    industryCode: z.string().trim().optional(),
    industryName: z.string().trim().optional(),
    subIndustryCode: z.string().trim().min(1).max(20),
    subIndustryName: z.string().trim().min(1).max(200),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW", "UNCLASSIFIED"]),
    method: z.string().trim().min(1).max(200),
    evidence: z.array(z.object({
      sourceUrl: z.string().url().optional(),
      sourceName: z.string().trim().max(200).optional(),
      description: z.string().trim().min(1).max(5000),
    })).max(50),
    analyst: z.string().trim().min(1).max(100),
    reason: z.string().trim().max(2000).optional(),
  }),
]);

export async function POST(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  const input = parsed.data;
  try {
    if (input.action === "classify_and_verify") {
      const result = await prisma.$transaction(async (tx) => {
        const victim = await tx.canonicalVictim.findUnique({ where: { id: input.victimId } });
        if (!victim) throw new Error("Victim not found");
        const taxonomy = await tx.gicsTaxonomy.findUnique({ where: { subIndustryCode: input.subIndustryCode } });
        if (!taxonomy) throw new Error("GICS sub-industry not found");
        const hasCountry = Object.prototype.hasOwnProperty.call(input, "country");
        const countryValue = input.country?.trim() || null;
        const country = hasCountry ? normalizeCountry(countryValue) : null;
        const nextCountry = hasCountry ? country?.name ?? countryValue : victim.country;

        await tx.classificationHistory.create({
          data: {
            victimId: victim.id,
            method: "Manual analyst GICS classification",
            confidence: input.confidence,
            evidence: [{ sourceName:"Analyst review", description:input.reason }],
            reviewedBy: input.analyst,
            reason: input.reason,
          },
        });
        await tx.victimEdit.create({
          data: {
            victimId: victim.id,
            field: "gicsAndVerification",
            oldValue: {
              gicsSubIndustryCode: victim.gicsSubIndustryCode,
              verificationStatus: victim.verificationStatus,
              country: victim.country,
            },
            newValue: {
              gicsSubIndustryCode: taxonomy.subIndustryCode,
              verificationStatus: "VERIFIED",
              country: nextCountry,
            },
            analyst: input.analyst,
            reason: input.reason,
          },
        });
        return tx.canonicalVictim.update({
          where: { id: victim.id },
          data: {
            gicsSectorCode: taxonomy.sectorCode,
            gicsSectorName: taxonomy.sectorName,
            gicsIndustryGroupCode: taxonomy.industryGroupCode,
            gicsIndustryGroupName: taxonomy.industryGroupName,
            gicsIndustryCode: taxonomy.industryCode,
            gicsIndustryName: taxonomy.industryName,
            gicsSubIndustryCode: taxonomy.subIndustryCode,
            gicsSubIndustryName: taxonomy.subIndustryName,
            gicsConfidence: input.confidence,
            gicsEvidence: [{ sourceName:"Analyst review", description:input.reason }],
            gicsMethod: "Manual analyst GICS classification",
            gicsReviewedAt: new Date(),
            verificationStatus: "VERIFIED",
            legitimacyStatus: "LEGITIMATE_ORGANISATION",
            incidentStatus: "CORROBORATED_INCIDENT",
            confidenceScore: 90,
            lastCheckedAt: new Date(),
            ...(hasCountry ? {
              country: nextCountry,
              countryCode: country?.alpha2 ?? null,
            } : {}),
          },
        });
      });
      return NextResponse.json({ victim: result, classifiedAndVerified: true });
    }

    if (input.action === "resolve_duplicate") {
      if (input.classification === "CONFIRMED_DUPLICATE") {
        const result = await prisma.$transaction(async (tx) => {
          const match = await tx.duplicateMatch.findUnique({
            where: { id: input.matchId },
            include: { primaryVictim: true, candidateVictim: true },
          });
          if (!match) throw new Error("Duplicate match not found");
          const canonical = match.primaryVictim;
          const duplicate = match.candidateVictim;
          if (canonical.id === duplicate.id) throw new Error("Victim records are identical");

          await tx.sourceDisclosure.updateMany({
            where: { canonicalVictimId: duplicate.id },
            data: { canonicalVictimId: canonical.id },
          });
          await tx.verificationEvidence.updateMany({
            where: { victimId: duplicate.id },
            data: { victimId: canonical.id },
          });
          await tx.classificationHistory.updateMany({
            where: { victimId: duplicate.id },
            data: { victimId: canonical.id },
          });
          await tx.victimEdit.updateMany({
            where: { victimId: duplicate.id },
            data: { victimId: canonical.id },
          });
          await tx.victimEdit.create({
            data: {
              victimId: canonical.id,
              field: "confirmedDuplicate",
              oldValue: { duplicateId: duplicate.id, duplicateName: duplicate.name },
              newValue: { removedDuplicateId: duplicate.id },
              analyst: input.analyst,
              reason: input.reason ?? "Confirmed duplicate; duplicate record removed",
            },
          });
          await tx.duplicateMatch.deleteMany({
            where: {
              OR: [
                { primaryVictimId: duplicate.id },
                { candidateVictimId: duplicate.id },
              ],
            },
          });
          await tx.canonicalVictim.update({
            where: { id: canonical.id },
            data: {
              aliases: Array.from(new Set([...canonical.aliases, duplicate.name, ...duplicate.aliases].filter(Boolean))),
              duplicateStatus: "CONFIRMED_DUPLICATE",
              lastCheckedAt: new Date(),
            },
          });
          await tx.canonicalVictim.delete({ where: { id: duplicate.id } });
          return { canonicalId: canonical.id, removedVictimId: duplicate.id };
        });
        return NextResponse.json({ merged: true, ...result });
      }

      const match = await prisma.$transaction(async (tx) => {
        const resolved = await tx.duplicateMatch.update({
          where: { id: input.matchId },
          data: {
            classification: input.classification,
            reviewedBy: input.analyst,
            reviewedAt: new Date(),
            resolution: input.reason ?? "Analyst reviewed duplicate match",
          },
          include: { primaryVictim: true, candidateVictim: true },
        });
        await tx.canonicalVictim.updateMany({
          where: {
            id: { in: [resolved.primaryVictimId, resolved.candidateVictimId] },
          },
          data: {
            duplicateStatus: input.classification,
          },
        });
        return resolved;
      });
      return NextResponse.json({ match });
    }

    if (input.action === "merge_victims") {
      if (input.canonicalId === input.duplicateId) {
        return NextResponse.json({ error: "Canonical and duplicate victim must be different" }, { status: 400 });
      }

      const result = await prisma.$transaction(async (tx) => {
        const canonical = await tx.canonicalVictim.findUnique({ where: { id: input.canonicalId } });
        const duplicate = await tx.canonicalVictim.findUnique({ where: { id: input.duplicateId } });
        if (!canonical || !duplicate) throw new Error("Victim not found");

        const duplicateDisclosures = await tx.sourceDisclosure.findMany({
          where: { canonicalVictimId: duplicate.id },
          orderBy: { publishedAt: "asc" },
        });
        const claimHistory = duplicateDisclosures.map((disclosure) => ({
          sourceName: disclosure.sourceName,
          sourceIdentifier: disclosure.sourceIdentifier,
          sourceUrl: disclosure.sourceUrl,
          originalVictimName: disclosure.originalVictimName,
          originalGroupName: disclosure.originalGroupName,
          publishedAt: disclosure.publishedAt?.toISOString() ?? null,
          updatedAtSource: disclosure.updatedAtSource?.toISOString() ?? null,
          retrievedAt: disclosure.retrievedAt.toISOString(),
        }));
        const publicationDates = duplicateDisclosures
          .map((disclosure) => disclosure.publishedAt)
          .filter((date): date is Date => Boolean(date));
        const earliestClaim = publicationDates.length
          ? publicationDates.reduce((earliest, date) => date < earliest ? date : earliest, publicationDates[0])
          : duplicate.firstReportedAt;
        const disclosureDates = duplicateDisclosures
          .flatMap((disclosure) => [disclosure.publishedAt, disclosure.updatedAtSource, disclosure.retrievedAt])
          .filter((date): date is Date => Boolean(date));
        const latestClaim = disclosureDates.length
          ? disclosureDates.reduce((latest, date) => date > latest ? date : latest, disclosureDates[0])
          : duplicate.lastUpdatedAt;

        await tx.victimEdit.create({
          data: {
            victimId: canonical.id,
            field: "mergedVictim",
            oldValue: {
              duplicateId: duplicate.id,
              duplicateName: duplicate.name,
              duplicateFirstReportedAt: duplicate.firstReportedAt.toISOString(),
            },
            newValue: {
              canonicalId: canonical.id,
              canonicalName: canonical.name,
              retainedClaimCount: duplicateDisclosures.length,
              retainedClaims: claimHistory,
            },
            analyst: input.analyst,
            reason: input.reason,
          },
        });

        await tx.sourceDisclosure.updateMany({
          where: { canonicalVictimId: duplicate.id },
          data: { canonicalVictimId: canonical.id },
        });
        await tx.verificationEvidence.updateMany({
          where: { victimId: duplicate.id },
          data: { victimId: canonical.id },
        });
        await tx.classificationHistory.updateMany({
          where: { victimId: duplicate.id },
          data: { victimId: canonical.id },
        });
        await tx.duplicateMatch.deleteMany({
          where: { OR: [{ primaryVictimId: duplicate.id }, { candidateVictimId: duplicate.id }] },
        });
        await tx.canonicalVictim.update({
          where: { id: canonical.id },
          data: {
            aliases: Array.from(new Set([...canonical.aliases, duplicate.name, ...duplicate.aliases].filter(Boolean))),
            duplicateStatus: "CONFIRMED_DUPLICATE",
            lastCheckedAt: new Date(),
            firstReportedAt: earliestClaim < canonical.firstReportedAt ? earliestClaim : canonical.firstReportedAt,
            lastUpdatedAt: latestClaim > canonical.lastUpdatedAt ? latestClaim : canonical.lastUpdatedAt,
            description: canonical.description ?? duplicate.description,
            targetedDomain: canonical.targetedDomain ?? duplicate.targetedDomain,
            targetedDomainNormalized: canonical.targetedDomainNormalized ?? duplicate.targetedDomainNormalized,
            domain: canonical.domain ?? duplicate.domain,
            normalizedDomain: canonical.normalizedDomain ?? duplicate.normalizedDomain,
          },
        });
        await tx.canonicalVictim.delete({ where: { id: duplicate.id } });
        return { canonical, retainedClaimCount: duplicateDisclosures.length };
      });
      return NextResponse.json({
        merged: true,
        canonicalId: result.canonical.id,
        retainedClaimCount: result.retainedClaimCount,
      });
    }

    if (input.action === "verify_victim") {
      const evidence = input.evidence ?? [];
      const result = await prisma.$transaction(async (tx) => {
        const old = await tx.canonicalVictim.findUnique({ where: { id: input.victimId } });
        if (!old) throw new Error("Victim not found");

        await tx.victimEdit.create({
          data: {
            victimId: old.id,
            field: "verificationStatus",
            oldValue: { status: old.verificationStatus, legitimacyStatus: old.legitimacyStatus, incidentStatus: old.incidentStatus },
            newValue: { status: input.status, legitimacyStatus: input.legitimacyStatus, incidentStatus: input.incidentStatus },
            analyst: input.analyst,
            reason: input.reason,
          },
        });
        const victim = await tx.canonicalVictim.update({
          where: { id: old.id },
          data: {
            verificationStatus: input.status,
            legitimacyStatus: input.legitimacyStatus ?? old.legitimacyStatus,
            incidentStatus: input.incidentStatus ?? old.incidentStatus,
            confidenceScore: input.confidenceScore ?? old.confidenceScore,
            lastCheckedAt: new Date(),
          },
        });
        if (evidence.length) {
          await tx.verificationEvidence.createMany({
            data: evidence.map((item) => ({
              victimId: victim.id,
              sourceUrl: item.sourceUrl,
              sourceName: item.sourceName,
              evidenceType: item.evidenceType,
              evidence: item.evidence,
              supports: item.supports,
              createdBy: input.analyst,
            })),
          });
        }
        return victim;
      });
      return NextResponse.json({ victim: result });
    }

    const result = await prisma.$transaction(async (tx) => {
      const old = await tx.canonicalVictim.findUnique({ where: { id: input.victimId } });
      if (!old) throw new Error("Victim not found");
      const taxonomy = await tx.gicsTaxonomy.findUnique({
        where: { subIndustryCode: input.subIndustryCode },
      });
      if (
        !taxonomy ||
        taxonomy.sectorCode !== input.sectorCode ||
        taxonomy.sectorName !== input.sectorName ||
        taxonomy.subIndustryName !== input.subIndustryName
      ) {
        throw new Error("GICS code and hierarchy names do not match the stored taxonomy");
      }

      await tx.classificationHistory.create({
        data: {
          victimId: old.id,
          method: input.method,
          confidence: input.confidence,
          evidence: input.evidence,
          reviewedBy: input.analyst,
          reason: input.reason,
        },
      });
      await tx.victimEdit.create({
        data: {
          victimId: old.id,
          field: "gicsClassification",
          oldValue: {
            sectorCode: old.gicsSectorCode,
            sectorName: old.gicsSectorName,
            subIndustryCode: old.gicsSubIndustryCode,
          },
          newValue: {
            sectorCode: input.sectorCode,
            sectorName: input.sectorName,
            subIndustryCode: input.subIndustryCode,
          },
          analyst: input.analyst,
          reason: input.reason,
        },
      });
      return tx.canonicalVictim.update({
        where: { id: old.id },
        data: {
          gicsSectorCode: input.sectorCode,
          gicsSectorName: input.sectorName,
          gicsIndustryGroupCode: input.industryGroupCode,
          gicsIndustryGroupName: input.industryGroupName,
          gicsIndustryCode: input.industryCode,
          gicsIndustryName: input.industryName,
          gicsSubIndustryCode: input.subIndustryCode,
          gicsSubIndustryName: input.subIndustryName,
          gicsConfidence: input.confidence,
          gicsEvidence: input.evidence,
          gicsMethod: input.method,
          gicsReviewedAt: new Date(),
        },
      });
    });
    return NextResponse.json({ victim: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review operation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
