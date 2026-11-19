import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const [victims, disclosures, groups, runs, sourceDisclosures] = await Promise.all([
      prisma.canonicalVictim.count(),
      prisma.sourceDisclosure.count(),
      prisma.ransomwareGroup.count(),
      prisma.ingestionRun.count(),
      prisma.sourceDisclosure.groupBy({
        by: ["sourceName"],
        _count: { _all: true },
        orderBy: { _count: { sourceName: "desc" } },
      }),
    ]);
    return NextResponse.json({
      status: "healthy",
      database: "connected",
      counts: {
        victims,
        disclosures,
        groups,
        ingestionRuns: runs,
        sourceDisclosures: Object.fromEntries(
          sourceDisclosures.map((row) => [row.sourceName, row._count._all]),
        ),
      },
    });
  } catch (error) {
    return NextResponse.json({
      status: "degraded",
      database: "unavailable",
      error: error instanceof Error ? error.message : "Unknown database error",
    }, { status: 503 });
  }
}
