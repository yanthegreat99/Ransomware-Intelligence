import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function IndustriesPage() {
  let rows: Array<{ gicsSectorName: string | null; gicsIndustryGroupName: string | null; gicsIndustryName: string | null; gicsSubIndustryName: string | null; _count: { _all: number } }> = [];
  try {
    const data = await prisma.canonicalVictim.groupBy({
      by:["gicsSectorName","gicsIndustryGroupName","gicsIndustryName","gicsSubIndustryName"],
      _count:{_all:true}, orderBy:{_count:{gicsSectorName:"desc"}}, take:100,
    });
    rows = data.map((row) => ({
      gicsSectorName: row.gicsSectorName,
      gicsIndustryGroupName: row.gicsIndustryGroupName,
      gicsIndustryName: row.gicsIndustryName,
      gicsSubIndustryName: row.gicsSubIndustryName,
      _count: { _all: row._count?._all ?? 0 },
    }));
  } catch {}
  return (
    <div className="page directory-page">
      <div className="eyebrow">GICS CLASSIFICATION ANALYTICS</div><h1>Targeted industries</h1>
      <div className="table-wrap" style={{marginTop:18}}>
        <table><thead><tr><th>Sector</th><th>Industry group</th><th>Industry</th><th>Sub-industry</th><th>Victims</th></tr></thead><tbody>
          {rows.length ? rows.map((row,index) => <tr key={index}><td>{row.gicsSectorName ?? "Unclassified"}</td><td>{row.gicsIndustryGroupName ?? "-"}</td><td>{row.gicsIndustryName ?? "-"}</td><td>{row.gicsSubIndustryName ?? "-"}</td><td>{row._count._all}</td></tr>) : <tr><td colSpan={5}>No GICS classifications available.</td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
