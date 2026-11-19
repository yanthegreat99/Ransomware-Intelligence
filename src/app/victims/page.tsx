import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type VictimListItem = Prisma.CanonicalVictimGetPayload<{ include: { ransomwareGroup: true } }>;

export default async function VictimsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; country?: string; verification?: string; group?: string; industry?: string; from?: string; to?: string; sort?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1"));
  const pageSize = 50;
  let victims: VictimListItem[] = [];
  let total = 0;
  try {
    const where: Prisma.CanonicalVictimWhereInput = {
        ...(params.q ? { OR: [
          { name: { contains: params.q, mode: "insensitive" as const } },
          { domain: { contains: params.q, mode: "insensitive" as const } },
        ] } : {}),
        ...(params.country ? { country: params.country } : {}),
        ...(params.verification ? { verificationStatus: params.verification as "VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED" | "DISPUTED" | "REMOVED" | "UNDER_REVIEW" } : {}),
        ...(params.group ? { ransomwareGroup: { name: { contains: params.group, mode:"insensitive" as const } } } : {}),
        ...(params.industry ? { gicsSectorName: params.industry } : {}),
        ...(params.from || params.to ? { firstReportedAt: {
          ...(params.from ? { gte: new Date(params.from) } : {}),
          ...(params.to ? { lte: new Date(`${params.to}T23:59:59.999Z`) } : {}),
        } } : {}),
      };
    const [resultItems, resultTotal] = await Promise.all([
      prisma.canonicalVictim.findMany({
      where,
      include: { ransomwareGroup: true },
      orderBy: params.sort === "name" ? { name:"asc" as const } : params.sort === "oldest" ? { firstReportedAt:"asc" as const } : params.sort === "updated" ? { lastUpdatedAt:"desc" as const } : { firstReportedAt:"desc" as const },
      skip: (page - 1) * pageSize,
      take: pageSize,
      }),
      prisma.canonicalVictim.count({ where }),
    ]);
    victims = resultItems as VictimListItem[];
    total = resultTotal;
  } catch {
    victims = [];
  }
  const currentParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) currentParams.set(key, value);
  }
  const exportParams = new URLSearchParams(currentParams);
  exportParams.delete("page");
  const pages = Math.ceil(total / pageSize);
  const previousParams = new URLSearchParams(currentParams);
  previousParams.set("page", String(Math.max(1, page - 1)));
  const nextParams = new URLSearchParams(currentParams);
  nextParams.set("page", String(Math.min(pages || 1, page + 1)));

  return (
    <div className="page directory-page">
        <header className="topbar"><div><div className="eyebrow">CANONICAL DATABASE</div><h1>Victim intelligence</h1></div></header>
        <form className="directory-tools">
          <input name="q" defaultValue={params.q ?? ""} placeholder="Search victim, domain or identifier" />
          <input name="country" defaultValue={params.country ?? ""} placeholder="Country" />
          <input name="group" defaultValue={params.group ?? ""} placeholder="Ransomware group" />
          <input name="industry" defaultValue={params.industry ?? ""} placeholder="GICS sector" />
          <input name="from" type="date" defaultValue={params.from ?? ""} />
          <input name="to" type="date" defaultValue={params.to ?? ""} />
          <select name="verification" defaultValue={params.verification ?? ""}>
            <option value="">All verification statuses</option>
            <option value="VERIFIED">Verified</option>
            <option value="PARTIALLY_VERIFIED">Partially verified</option>
            <option value="UNVERIFIED">Unverified</option>
            <option value="DISPUTED">Disputed</option>
            <option value="UNDER_REVIEW">Under review</option>
          </select>
          <select name="sort" defaultValue={params.sort ?? "newest"}>
            <option value="newest">Newest reported</option>
            <option value="oldest">Oldest reported</option>
            <option value="updated">Recently updated</option>
            <option value="name">Organisation name</option>
          </select>
          <button className="search-button" type="submit">Search</button>
          <a className="export-button" href={`/api/victims?format=csv&${exportParams.toString()}`}>CSV</a>
          <a className="export-button" href={`/api/victims?format=json&${exportParams.toString()}`}>JSON</a>
        </form>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Organisation</th><th>Ransomware group</th><th>Country</th><th>Reported</th><th>Verification</th><th>Duplicate status</th></tr></thead>
            <tbody>
              {victims.length ? victims.map((victim) => (
                <tr key={victim.id}>
                  <td><Link href={`/victims/${victim.id}`}>{victim.name}</Link><br /><span style={{color:"#91a0b5"}}>{victim.domain ?? "Domain unavailable"}</span></td>
                  <td>{victim.ransomwareGroup?.name ?? "Unknown"}</td>
                  <td>{victim.country ?? "Unknown"}</td>
                  <td>{victim.firstReportedAt.toISOString().slice(0,10)}</td>
                  <td><span className={`status ${victim.verificationStatus === "VERIFIED" ? "verified" : "unverified"}`}>{victim.verificationStatus.replaceAll("_"," ")}</span></td>
                  <td>{victim.duplicateStatus.replaceAll("_"," ")}</td>
                </tr>
              )) : (
                <tr><td colSpan={6}>No canonical victim records are available. Configure the database and run ingestion.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="filters" style={{ marginTop:12, justifyContent:"space-between" }}>
          <span style={{ color:"#91a0b5", fontSize:12, alignSelf:"center" }}>
            {total.toLocaleString()} records · Page {page} of {pages || 1}
          </span>
          <div>
            <a className="export-button" href={`/victims?${previousParams.toString()}`} style={{ marginRight:6 }}>Previous</a>
            <a className="export-button" href={`/victims?${nextParams.toString()}`}>Next</a>
          </div>
        </div>
    </div>
  );
}
