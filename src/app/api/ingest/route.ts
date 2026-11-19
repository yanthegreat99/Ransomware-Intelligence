import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getAppInput } from "@/lib/prisma";
import { ingestAdapter } from "@/lib/ingestion";
import { RansomLookAdapter, RansomfeedAdapter, RansomwareLiveAdapter } from "@/lib/source-adapter";
import { authorizeAdminRequest } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const input = getAppInput();
  const jobSecret = input.ingestionJobSecret?.expose();
  const sourceConfig = {
    ransomLookApiUrl: input.ransomLookApiUrl?.expose(),
    ransomLookApiKey: input.ransomLookApiKey?.expose(),
    ransomLookDays: input.ransomLookDays?.expose(),
    ransomwareLiveApiUrl: input.ransomwareLiveApiUrl?.expose(),
    ransomwareLiveProApiUrl: input.ransomwareLiveProApiUrl?.expose(),
    ransomwareLiveApiKey: input.ransomwareLiveApiKey?.expose(),
    ransomFeedApiUrl: input.ransomFeedApiUrl?.expose(),
  };
  if ((!jobSecret || request.headers.get("authorization") !== `Bearer ${jobSecret}`) && !authorizeAdminRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const source = request.nextUrl.searchParams.get("source")?.toLowerCase();
    const adapters = [
      ...(!source || source === "ransomlook"
        ? (sourceConfig.ransomLookApiUrl ? [new RansomLookAdapter(sourceConfig)] : [])
        : []),
      ...(!source || source === "ransomware.live" || source === "ransomwarelive"
        ? (sourceConfig.ransomwareLiveApiUrl !== "false" ? [new RansomwareLiveAdapter(sourceConfig)] : [])
        : []),
      ...(!source || source === "ransomfeed"
        ? (sourceConfig.ransomFeedApiUrl !== "false" ? [new RansomfeedAdapter(sourceConfig)] : [])
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
