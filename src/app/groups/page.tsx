import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?:string; status?:string; sort?:string }>;
}) {
  const params = await searchParams;
  const where: Prisma.RansomwareGroupWhereInput = {};
  if (params.q) {
    where.OR = [
      { name:{ contains:params.q, mode:"insensitive" } },
      { aliases:{ has:params.q } },
    ];
  }
  if (params.status) where.operationalStatus=params.status;

  let groups: Array<Prisma.RansomwareGroupGetPayload<{ include:{_count:{select:{victims:true}}} }>> = [];
  let totalGroups = 0;
  let activeGroups = 0;
  try {
    [groups,totalGroups,activeGroups] = await Promise.all([
      prisma.ransomwareGroup.findMany({
        where,
        include:{ _count:{select:{victims:true}} },
        orderBy: params.sort==="name"
          ? { name:"asc" }
          : params.sort==="first"
            ? { firstObserved:"asc" }
            : { lastObserved:"desc" },
      }),
      prisma.ransomwareGroup.count(),
      prisma.ransomwareGroup.count({ where:{ operationalStatus:"ACTIVE" } }),
    ]);
  } catch {}

  return (
    <div className="page directory-page">
      <header className="topbar">
        <div><div className="eyebrow">RANSOMWARE DIRECTORY</div><h1>Threat actors</h1></div>
      </header>
      <form className="directory-tools">
        <input name="q" defaultValue={params.q ?? ""} placeholder="Search threat actor or alias" />
        <select name="status" defaultValue={params.status ?? ""}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="UNKNOWN">Unknown</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <select name="sort" defaultValue={params.sort ?? "activity"}>
          <option value="activity">Most recently active</option>
          <option value="name">Name</option>
          <option value="first">First observed</option>
        </select>
        <button className="search-button" type="submit">Apply</button>
      </form>
      <section className="metric-grid country-statistics">
        <article className="metric-card"><div><span>Tracked groups</span><strong>{totalGroups.toLocaleString()}</strong></div></article>
        <article className="metric-card"><div><span>Active groups</span><strong>{activeGroups.toLocaleString()}</strong></div></article>
        <article className="metric-card"><div><span>Filtered groups</span><strong>{groups.length.toLocaleString()}</strong></div></article>
      </section>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Threat actor</th><th>Aliases</th><th>Status</th><th>Victims</th><th>First observed</th><th>Last observed</th></tr></thead>
          <tbody>
            {groups.length ? groups.map((group)=>(
              <tr key={group.id}>
                <td><Link href={`/groups/${group.id}`}>{group.name}</Link></td>
                <td>{group.aliases.length ? group.aliases.join(", ") : "None"}</td>
                <td><span className={`status ${group.operationalStatus==="ACTIVE"?"verified":""}`}>{group.operationalStatus}</span></td>
                <td>{group._count.victims.toLocaleString()}</td>
                <td>{group.firstObserved?.toISOString().slice(0,10) ?? "Unknown"}</td>
                <td>{group.lastObserved?.toISOString().slice(0,10) ?? "Unknown"}</td>
              </tr>
            )) : <tr><td colSpan={6}>No ransomware groups match the selected filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
