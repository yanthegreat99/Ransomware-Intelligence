import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/prisma";
import { fetchWithRetry } from "@/lib/http";
import { authorizeAdminRequest } from "@/lib/admin-auth";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!authorizeAdminRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  try {
    const db = getDb();
    const group = await db.orm.public.RansomwareGroup.first({ id });
    if (!group) return NextResponse.json({ error: "Ransomware group not found" }, { status: 404 });

    const slug = encodeURIComponent(group.name.toLowerCase().replace(/\s+/g, ""));
    const response = await fetchWithRetry(`https://www.ransomlook.io/api/group/${slug}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`RansomLook group profile returned ${response.status}`);
    const payload = await response.json();
    const profile = Array.isArray(payload) ? payload[0] : payload;
    if (!profile || typeof profile !== "object") throw new Error("RansomLook returned no group profile");

    const locations: Array<{
      slug?: string;
      fqdn?: string;
      title?: string;
      available: boolean;
      updated?: string;
      lastScrape?: string;
      chat: boolean;
      admin: boolean;
    }> = Array.isArray(profile.locations)
      ? profile.locations.map((location: unknown) => {
          const item = location as Record<string, unknown>;
          return {
            slug: typeof item.slug === "string" ? item.slug : undefined,
            fqdn: typeof item.fqdn === "string" ? item.fqdn : undefined,
            title: typeof item.title === "string" ? item.title : undefined,
            available: item.available === true,
            updated: typeof item.updated === "string" ? item.updated : undefined,
            lastScrape: typeof item.lastscrape === "string" ? item.lastscrape : undefined,
            chat: item.chat === true,
            admin: item.admin === true,
          };
        })
      : [];
    const leakSiteUrls = locations
      .map((location) => location.slug)
      .filter((url): url is string => Boolean(url));

    const updated = await db.orm.public.RansomwareGroup.where({ id }).update({
        aliases: Array.from(new Set([
          ...(group.aliases ?? []),
          ...(Array.isArray(profile.altname) ? profile.altname : typeof profile.altname === "string" ? [profile.altname] : []),
        ])),
        parserStatus: profile.captcha === true ? "Captcha" : "Enabled",
        leakSiteUrls,
        knownLocations: locations,
        profileUrls: {
          ransomwareLook: `https://www.ransomlook.io/group/${encodeURIComponent(group.name.toLowerCase().replace(/\s+/g, "-"))}`,
          api: `https://www.ransomlook.io/api/group/${slug}`,
        },
        profileUpdatedAt: new Date(),
    });
    return NextResponse.json({ group: updated, locations });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Group profile refresh failed",
    }, { status: 502 });
  }
}
