import { NextRequest, NextResponse } from "next/server";
import { detectAllDuplicates } from "@/lib/ingestion";
import { authorizeAdminRequest } from "@/lib/admin-auth";
import { getDb } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  if (!authorizeAdminRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const db = getDb();
    const [confirmed, potential, unique] = await Promise.all([
      db.orm.public.DuplicateMatch.where({ classification: "CONFIRMED_DUPLICATE" })
        .aggregate((aggregate) => ({ total: aggregate.count() })),
      db.orm.public.DuplicateMatch.where({ classification: "POTENTIAL_DUPLICATE" })
        .aggregate((aggregate) => ({ total: aggregate.count() })),
      db.orm.public.CanonicalVictim.where({ duplicateStatus: "UNIQUE_VICTIM" })
        .aggregate((aggregate) => ({ total: aggregate.count() })),
    ]);
    return NextResponse.json({
      confirmed: confirmed.total,
      potential: potential.total,
      unique: unique.total,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Duplicate query failed" }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!authorizeAdminRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await detectAllDuplicates();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Duplicate analysis failed" }, { status: 500 });
  }
}
