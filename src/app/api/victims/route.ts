import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeName } from "@/lib/intelligence";
import { normalizeCountry } from "@/lib/countries";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get("q")?.trim();
    const country = searchParams.get("country");
    const verification = searchParams.get("verification");
    const group = searchParams.get("group");
    const industry = searchParams.get("industry");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const sort = searchParams.get("sort");
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 25)));
    const skip = (page - 1) * pageSize;

    const where: Prisma.CanonicalVictimWhereInput = {};
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { normalizedName: { contains: normalizeName(q), mode: "insensitive" } },
        { domain: { contains: q, mode: "insensitive" } },
      ];
    }
    if (country) {
      const normalized = normalizeCountry(country);
      where.OR = [
        ...(where.OR ?? []),
        ...(normalized ? [
          { countryCode: normalized.alpha2 },
          { country: normalized.name },
        ] : [{ country: { contains: country, mode: "insensitive" as const } }]),
      ];
    }
    if (verification) where.verificationStatus = verification as Prisma.EnumVerificationStatusFilter;
    if (industry) where.gicsSectorName = industry;
    if (from || to) {
      where.firstReportedAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
      };
    }
    if (group) {
      where.ransomwareGroup = { name: { contains: group, mode: "insensitive" } };
    }

    const orderBy =
      sort === "name"
        ? { name: "asc" as const }
        : sort === "oldest"
          ? { firstReportedAt: "asc" as const }
          : sort === "updated"
            ? { lastUpdatedAt: "desc" as const }
            : { firstReportedAt: "desc" as const };

    const [items, total] = await Promise.all([
      prisma.canonicalVictim.findMany({
        where,
        include: { ransomwareGroup: true, disclosures: { select: { sourceName: true, sourceUrl: true } } },
        orderBy,
        skip,
        take: pageSize,
      }),
      prisma.canonicalVictim.count({ where }),
    ]);
    if (searchParams.get("format") === "csv") {
      const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
      const csv = [
        ["Victim ID","Victim","Domain","Country","Ransomware group","First reported","Verification","Duplicate status"].join(","),
        ...items.map((item) => [
          item.id,item.name,item.domain,item.country,item.ransomwareGroup?.name,item.firstReportedAt.toISOString(),item.verificationStatus,item.duplicateStatus,
        ].map(escape).join(",")),
      ].join("\n");
      return new NextResponse(csv, {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="victims.csv"' },
      });
    }
    if (searchParams.get("format") === "json") {
      return NextResponse.json({
        items,
        page,
        pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      }, {
        headers: {
          "Content-Disposition": 'attachment; filename="victims.json"',
        },
      });
    }
    return NextResponse.json({ items, page, pageSize, total, pages: Math.ceil(total / pageSize) });
  } catch (error) {
    return NextResponse.json({ error: "Database unavailable", detail: error instanceof Error ? error.message : "Unknown error" }, { status: 503 });
  }
}
