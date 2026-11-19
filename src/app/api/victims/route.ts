import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/prisma";
import { or } from "@prisma/orm-postgres/orm-client";
import { normalizeName } from "@/lib/intelligence";
import { normalizeCountry } from "@/lib/countries";

type VerificationStatus = "VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED" | "DISPUTED" | "REMOVED" | "UNDER_REVIEW";

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

    const db = getDb();
    let query = db.orm.public.CanonicalVictim;
    if (q) {
      const normalizedName = normalizeName(q);
      query = query.where((victim) => or(
        victim.name.ilike(`%${q}%`),
        victim.normalizedName.ilike(`%${normalizedName}%`),
        victim.domain.ilike(`%${q}%`),
      ));
    }
    if (country) {
      const normalized = normalizeCountry(country);
      query = query.where((victim) => normalized
        ? or(victim.countryCode.eq(normalized.alpha2), victim.country.eq(normalized.name))
        : victim.country.ilike(`%${country}%`));
    }
    if (verification && !["VERIFIED", "PARTIALLY_VERIFIED", "UNVERIFIED", "DISPUTED", "REMOVED", "UNDER_REVIEW"].includes(verification)) {
      return NextResponse.json({ error: "Invalid verification status" }, { status: 400 });
    }
    if (verification) {
      query = query.where((victim) =>
        victim.verificationStatus.eq(verification as VerificationStatus),
      );
    }
    if (industry) query = query.where({ gicsSectorName: industry });
    if (from) query = query.where((victim) => victim.firstReportedAt.gte(new Date(from)));
    if (to) query = query.where((victim) => victim.firstReportedAt.lte(new Date(`${to}T23:59:59.999Z`)));
    if (group) {
      const groups = await db.orm.public.RansomwareGroup
        .where((ransomwareGroup) => ransomwareGroup.name.ilike(`%${group}%`))
        .select("id")
        .all();
      query = query.where((victim) =>
        victim.ransomwareGroupId.in(groups.map((ransomwareGroup) => ransomwareGroup.id)),
      );
    }

    const [items, total] = await Promise.all([
      query
        .include("ransomwareGroup")
        .include("disclosures", (disclosures) => disclosures.select("sourceName", "sourceUrl"))
        .orderBy(sort === "name"
          ? (victim) => victim.name.asc()
          : sort === "oldest"
            ? (victim) => victim.firstReportedAt.asc()
            : sort === "updated"
              ? (victim) => victim.lastUpdatedAt.desc()
              : (victim) => victim.firstReportedAt.desc())
        .offset(skip)
        .limit(pageSize)
        .all(),
      query.aggregate((aggregate) => ({ total: aggregate.count() })).then((result) => result.total),
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
