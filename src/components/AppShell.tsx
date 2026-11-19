"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Building2,
  Globe2,
  LayoutDashboard,
  ShieldCheck,
  TableProperties,
  UserRoundCog,
} from "lucide-react";

const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/victims", label: "Victims", icon: TableProperties },
  { href: "/groups", label: "Ransomware groups", icon: ShieldCheck },
  { href: "/countries", label: "Countries", icon: Globe2 },
  { href: "/industries", label: "Industries", icon: Building2 },
  { href: "/admin", label: "Analyst", icon: UserRoundCog },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Primary navigation">
        <Link className="app-brand" href="/" aria-label="Ransomware Intelligence overview">
          <span className="brand-mark" aria-hidden="true">RI</span>
          <span className="brand-name">
            <strong>Ransomware</strong>
            <small>Intelligence</small>
          </span>
        </Link>

        <nav className="app-navigation">
          <span className="nav-section-label">Workspace</span>
          {navigation.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
                title={item.label}
              >
                <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="system-status">
            <Activity size={14} aria-hidden="true" />
            <span>Data services</span>
            <strong>Live</strong>
          </div>
        </div>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}
