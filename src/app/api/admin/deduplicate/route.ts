import { NextRequest, NextResponse } from "next/server";
import { detectAllDuplicates } from "@/lib/ingestion";
import { authorizeAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  if (!authorizeAdminRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const [confirmed, potential, unique] = await Promise.all([
      prisma.duplicateMatch.count({ where: { classification: "CONFIRMED_DUPLICATE" } }),
      prisma.duplicateMatch.count({ where: { classification: "POTENTIAL_DUPLICATE" } }),
      prisma.canonicalVictim.count({ where: { duplicateStatus: "UNIQUE_VICTIM" } }),
    ]);
    return NextResponse.json({ confirmed, potential, unique });
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
