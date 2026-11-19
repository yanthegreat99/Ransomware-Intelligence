import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { ingestAdapter } from "@/lib/ingestion";
import { RansomLookAdapter, RansomfeedAdapter, RansomwareLiveAdapter } from "@/lib/source-adapter";
import { authorizeAdminRequest } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const secret = process.env.INGESTION_JOB_SECRET;
  if ((!secret || request.headers.get("authorization") !== `Bearer ${secret}`) && !authorizeAdminRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const source = request.nextUrl.searchParams.get("source")?.toLowerCase();
    const adapters = [
      ...(!source || source === "ransomlook"
        ? (process.env.RANSOMLOOK_API_URL ? [new RansomLookAdapter()] : [])
        : []),
      ...(!source || source === "ransomware.live" || source === "ransomwarelive"
        ? (process.env.RANSOMWARELIVE_API_URL !== "false" ? [new RansomwareLiveAdapter()] : [])
        : []),
      ...(!source || source === "ransomfeed"
        ? (process.env.RANSOMFEED_API_URL !== "false" ? [new RansomfeedAdapter()] : [])
        : []),
    ];
    if (!adapters.length) {
      return NextResponse.json({ error: "No ingestion adapters configured" }, { status: 503 });
    }
    const runs = await Promise.allSettled(adapters.map((adapter) => ingestAdapter(adapter)));
    return NextResponse.json({
      runs: runs.map((run) => {
        if (run.status !== "fulfilled") return { status: "FAILED", error: String(run.reason) };
        if (run.value === null) return { status: "SKIPPED", reason: "Source ingestion is already running or lease is active" };
        return run.value;
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ingestion failed" }, { status: 500 });
  }
}
