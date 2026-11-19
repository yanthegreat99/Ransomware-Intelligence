import { NextResponse } from "next/server";
import { getDashboardRange, loadDashboardData } from "@/lib/dashboard-data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let range;
  try {
    range = getDashboardRange({
      range: searchParams.get("range"),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid date range" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await loadDashboardData(range));
  } catch (error) {
    return NextResponse.json({
      error: "Database unavailable",
      detail: error instanceof Error ? error.message : "Unknown database error",
    }, { status: 503 });
  }
}
