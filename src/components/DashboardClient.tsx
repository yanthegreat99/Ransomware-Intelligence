"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BriefcaseBusiness,
  Database,
  Download,
  Globe2,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardChartRow, DashboardData } from "@/lib/dashboard-data";

const chartColors = ["#5aa0ff", "#52c79a", "#e4b85b", "#f06b75", "#a48df5", "#48c7c9"];
const tooltipStyle = {
  background: "#111d2c",
  border: "1px solid #2a4968",
  borderRadius: 8,
  color: "#edf4fc",
};

const rangeOptions = ["7d", "30d", "90d", "6m", "1y", "custom"];

export default function DashboardClient({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [range, setRange] = useState("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function applyRange(nextRange: string, from?: string, to?: string) {
    setRange(nextRange);
    setError("");
    if (nextRange === "custom" && (!from || !to)) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (nextRange === "custom") {
        params.set("from", from ?? "");
        params.set("to", to ?? "");
      } else {
        params.set("range", nextRange);
      }
      const response = await fetch(`/api/dashboard?${params.toString()}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load dashboard analytics");
      setData(result as DashboardData);
    } catch (rangeError) {
      setError(rangeError instanceof Error ? rangeError.message : "Unable to load dashboard analytics");
    } finally {
      setLoading(false);
    }
  }

  const { stats, charts, recentVictims } = data;
  const cards = [
    { label: "Canonical victims", value: stats.totalVictims, hint: "All-time organizations", Icon: Database },
    { label: "New in selected range", value: stats.rangeVictims, hint: data.range.label, Icon: Activity },
    { label: "Reported today", value: stats.todayVictims, hint: "Canonical victims", Icon: ShieldAlert },
    { label: "Source disclosures", value: stats.sourceDisclosureCount, hint: "Source-level claims", Icon: BriefcaseBusiness },
    { label: "Threat actors", value: stats.groupCount, hint: `${stats.activeGroups.toLocaleString("en-US")} marked active`, Icon: Users },
    { label: "Affected countries", value: stats.countryCount, hint: "Normalized country names", Icon: Globe2 },
    { label: "Needs review", value: stats.verificationNeeded, hint: "Verification queue", Icon: AlertTriangle },
    { label: "Verified victims", value: stats.verified, hint: "Verified or partially verified", Icon: BadgeCheck },
  ];
  const sourceTotal = charts.sources.reduce((total, source) => total + source.value, 0);

  return (
    <main className={`page dashboard-page ${loading ? "dashboard-loading" : ""}`}>
      <header className="topbar dashboard-header">
        <div>
          <div className="eyebrow">RANSOMWARE INTELLIGENCE</div>
          <h1>Threat activity overview</h1>
          <p>Canonical victim trends, actor activity, source coverage, and review status. Analytics may be up to 5 minutes old.</p>
        </div>
        <div className="actions">
          <Link className="search-button" href="/victims"><Search size={16} /> Search intelligence</Link>
          <a className="export-button" href="/api/victims"><Download size={16} /> Export API</a>
        </div>
      </header>

      <section className="dashboard-controls" aria-label="Dashboard date range">
        <div className="range-control">
          <span>Reported</span>
          {rangeOptions.map((item) => (
            <button
              key={item}
              type="button"
              className={range === item ? "active" : ""}
              onClick={() => void applyRange(item)}
              disabled={loading}
            >
              {item === "custom" ? "Custom" : item.toUpperCase()}
            </button>
          ))}
        </div>
        <span className="dashboard-range-label">{data.range.from} – {data.range.to}</span>
      </section>

      {range === "custom" ? (
        <section className="filters custom-range dashboard-custom-range" aria-label="Custom date range">
          <label>From<input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label>
          <label>To<input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label>
          <button
            type="button"
            className="search-button"
            onClick={() => void applyRange("custom", customFrom, customTo)}
            disabled={loading || !customFrom || !customTo}
          >
            Apply range
          </button>
        </section>
      ) : null}

      {error ? <div className="form-error dashboard-error" role="alert">{error}</div> : null}

      <section className="metric-grid dashboard-metrics" aria-label="Key statistics">
        {cards.map(({ label, value, hint, Icon }) => (
          <article className="metric-card dashboard-metric-card" key={label}>
            <div className="metric-icon"><Icon size={18} /></div>
            <div>
              <span>{label}</span>
              <strong>{value.toLocaleString("en-US")}</strong>
              <small>{hint}</small>
            </div>
          </article>
        ))}
      </section>

      <section className="dashboard-chart-grid" aria-label="Threat activity charts">
        <article className="panel dashboard-panel dashboard-trend-panel">
          <div className="panel-heading">
            <div><h2>Victims reported over time</h2><p>Canonical organizations by report date</p></div>
            <span>{data.range.bucket} buckets</span>
          </div>
          {charts.trend.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={charts.trend} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="victimTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5aa0ff" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#5aa0ff" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#203349" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value: string) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  tick={{ fill: "#8293a8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis allowDecimals={false} tick={{ fill: "#8293a8", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(value) => new Date(String(value)).toLocaleDateString("en-US", { dateStyle: "medium" })}
                  formatter={(value) => [Number(value).toLocaleString("en-US"), "Victims"]}
                />
                <Area type="monotone" dataKey="count" stroke="#5aa0ff" strokeWidth={2} fill="url(#victimTrendFill)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="empty-chart">No canonical victims were reported in this period.</div>}
        </article>

        <ChartPanel title="Top affected countries" subtitle="By canonical victims" data={charts.countries} color="#5aa0ff" />
        <ChartPanel title="Most active threat actors" subtitle="Canonical victims in selected period" data={charts.groups} color="#f06b75" />
        <ChartPanel title="Victims by GICS sector" subtitle="Unclassified victims shown separately" data={charts.industries} color="#e4b85b" />

        <article className="panel dashboard-panel">
          <div className="panel-heading">
            <div><h2>Verification status</h2><p>Current canonical database</p></div>
            <span>{stats.totalVictims.toLocaleString("en-US")} records</span>
          </div>
          {charts.verification.length ? (
            <div className="dashboard-donut-wrap">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={charts.verification} dataKey="value" nameKey="name" innerRadius={62} outerRadius={88} paddingAngle={2}>
                    {charts.verification.map((row, index) => (
                      <Cell key={row.name} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [Number(value).toLocaleString("en-US"), "Victims"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="dashboard-legend">
                {charts.verification.map((row, index) => (
                  <div key={row.name}><i style={{ background: chartColors[index % chartColors.length] }} /><span>{row.name}</span><strong>{row.value.toLocaleString("en-US")}</strong></div>
                ))}
              </div>
            </div>
          ) : <div className="empty-chart">No verification records available.</div>}
        </article>
      </section>

      <section className="dashboard-table-grid" aria-label="Victim and source tables">
        <article className="panel dashboard-panel dashboard-table-panel">
          <div className="panel-heading">
            <div><h2>Latest reported victims</h2><p>Most recent canonical records in this range</p></div>
            <Link href="/victims">View all</Link>
          </div>
          <div className="table-wrap dashboard-table-wrap">
            <table>
              <thead><tr><th>Organization</th><th>Threat actor</th><th>Country</th><th>Reported</th><th>Review status</th></tr></thead>
              <tbody>
                {recentVictims.length ? recentVictims.map((victim) => (
                  <tr key={victim.id}>
                    <td><Link href={`/victims/${victim.id}`} className="dashboard-victim-link">{victim.name}</Link><small>{victim.gicsSectorName ?? "Industry unclassified"}</small></td>
                    <td>{victim.ransomwareGroupName ?? "Unknown"}</td>
                    <td>{victim.country ?? "Unknown"}</td>
                    <td>{victim.firstReportedAt.slice(0, 10)}</td>
                    <td><span className={`status ${victim.verificationStatus === "VERIFIED" || victim.verificationStatus === "PARTIALLY_VERIFIED" ? "verified" : ""}`}>{victim.verificationStatus.replaceAll("_", " ")}</span></td>
                  </tr>
                )) : <tr><td colSpan={5}>No reported victims in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel dashboard-panel dashboard-table-panel">
          <div className="panel-heading">
            <div><h2>Source coverage</h2><p>All-time disclosure rows, not unique victims</p></div>
            <strong>{sourceTotal.toLocaleString("en-US")}</strong>
          </div>
          <div className="table-wrap dashboard-table-wrap">
            <table>
              <thead><tr><th>Intelligence source</th><th>Disclosures</th><th>Share</th></tr></thead>
              <tbody>
                {charts.sources.map((source) => (
                  <tr key={source.name}>
                    <td>{source.name}</td>
                    <td>{source.value.toLocaleString("en-US")}</td>
                    <td>{sourceTotal ? `${(source.value / sourceTotal * 100).toFixed(1)}%` : "0.0%"}</td>
                  </tr>
                ))}
                {!charts.sources.length ? <tr><td colSpan={3}>No source disclosures available.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="dashboard-quality-strip">
            <span><strong>{stats.confirmedDuplicates.toLocaleString("en-US")}</strong> confirmed duplicate pairs</span>
            <span><strong>{stats.duplicateReviews.toLocaleString("en-US")}</strong> pairs awaiting review</span>
            <span><strong>{stats.disputed.toLocaleString("en-US")}</strong> disputed victims</span>
          </div>
        </article>
      </section>
    </main>
  );
}

function ChartPanel({
  title,
  subtitle,
  data,
  color,
}: {
  title: string;
  subtitle: string;
  data: DashboardChartRow[];
  color: string;
}) {
  return (
    <article className="panel dashboard-panel">
      <div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><span>Top 10</span></div>
      {data.length ? (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 18, top: 2, bottom: 2 }}>
            <CartesianGrid stroke="#203349" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={145} tick={{ fill: "#b1bfd0", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => [Number(value).toLocaleString("en-US"), "Victims"]} />
            <Bar dataKey="value" fill={color} radius={[0, 5, 5, 0]} barSize={13} />
          </BarChart>
        </ResponsiveContainer>
      ) : <div className="empty-chart">No data available for this period.</div>}
    </article>
  );
}
