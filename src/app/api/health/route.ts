import { NextResponse } from "next/server";
import { getDb } from "@/lib/prisma";

export async function GET() {
  try {
    const db = getDb();
    const [victims, disclosures, groups, runs, sourceDisclosures] = await Promise.all([
      db.orm.public.CanonicalVictim.aggregate((aggregate) => ({ total: aggregate.count() })),
      db.orm.public.SourceDisclosure.aggregate((aggregate) => ({ total: aggregate.count() })),
      db.orm.public.RansomwareGroup.aggregate((aggregate) => ({ total: aggregate.count() })),
      db.orm.public.IngestionRun.aggregate((aggregate) => ({ total: aggregate.count() })),
      db.orm.public.SourceDisclosure.groupBy("sourceName")
        .aggregate((aggregate) => ({ count: aggregate.count() })),
    ]);
    return NextResponse.json({
      status: "healthy",
      database: "connected",
      counts: {
        victims: victims.total,
        disclosures: disclosures.total,
        groups: groups.total,
        ingestionRuns: runs.total,
        sourceDisclosures: Object.fromEntries(
          sourceDisclosures.map((row) => [row.sourceName, row.count]),
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
