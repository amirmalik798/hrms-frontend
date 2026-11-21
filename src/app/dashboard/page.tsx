"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowRight, Building2, CreditCard, Mail, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeading } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { apiRequest, isRecord, numberValue, pickArray, stringValue } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import { useSuperAdmin } from "@/components/super-admin/SuperAdminGate";

interface Stats { [key: string]: unknown }
interface Organization extends Record<string, unknown> { id: string; name: string; slug: string; status: string; created_at?: string; contact_email?: string; user_count?: number | string }

const links = [
  { href: "/dashboard/organizations", title: "Manage organizations", description: "Create, inspect, and manage tenant workspaces.", icon: Building2 },
  { href: "/dashboard/organization-admins", title: "Organization administrators", description: "Review organization administrator accounts.", icon: Users },
  { href: "/dashboard/invitations", title: "Platform invitations", description: "Review platform invitation status and history.", icon: Mail },
  { href: "/dashboard/payments", title: "Payments and licenses", description: "Review payment submissions and license status.", icon: CreditCard },
  { href: "/dashboard/support", title: "Platform support", description: "Respond to organization support conversations.", icon: ShieldCheck },
  { href: "/dashboard/audit-logs", title: "Audit logs", description: "Inspect important platform activity.", icon: Activity },
  { href: "/dashboard/system-health", title: "System health", description: "Open the platform health integration status.", icon: ShieldCheck },
];

export default function SuperAdminDashboardPage() {
  const { user } = useSuperAdmin();
  const [stats, setStats] = useState<Stats | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [statsResult, orgResult] = await Promise.all([
        apiRequest<{ stats?: Stats }>("/dashboard/stats"),
        apiRequest<unknown>("/organizations?page=1&pageSize=6&status=NON_ARCHIVED"),
      ]);
      setStats(isRecord(statsResult.stats) ? statsResult.stats : {});
      setOrganizations(pickArray(orgResult, "organizations").map((row) => row as Organization));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load platform overview."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const metrics = [
    { label: "Organizations", value: stats ? numberValue(stats, "totalOrganizations") : null, note: `${formatNumber(numberValue(stats ?? {}, "activeOrganizations") ?? 0)} active`, icon: Building2 },
    { label: "Active users", value: stats ? numberValue(stats, "activeUsers") : null, note: `${formatNumber(numberValue(stats ?? {}, "totalUsers") ?? 0)} total accounts`, icon: Users },
    { label: "Workforce members", value: stats ? numberValue(stats, "totalEmployees") : null, note: "Across all organizations", icon: Activity },
    { label: "Pending invitations", value: stats ? numberValue(stats, "pendingInvitations") : null, note: "Awaiting acceptance", icon: Mail },
  ];

  return <>
    <PageHeader eyebrow="Platform control" title="Platform overview" description="Monitor organizations, accounts, onboarding, and platform operations from one secure control center." action={<Button variant="secondary" busy={loading} leading={<Activity size={15}/>} onClick={() => void load()}>Refresh overview</Button>} />
    <div className="dashboard-intro" style={{ marginBottom: 18 }}><div><h2>Welcome back, {user.email.split("@")[0] || "Administrator"}.</h2><p>Here is the current view of your HRMS platform.</p></div><span className="date-chip">Platform administration</span></div>
    {error ? <div className="form-error" role="alert">{error} <button type="button" className="button button-sm button-ghost" onClick={() => void load()}>Retry</button></div> : null}
    <div className="page-grid grid-4" style={{ marginBottom: 18 }}>
      {metrics.map((metric) => { const Icon = metric.icon; return <Panel key={metric.label} className="metric-card"><div className="metric-label"><span>{metric.label}</span><span className="metric-icon"><Icon size={16}/></span></div><div className="metric-value">{loading ? <span className="skeleton" style={{ display: "inline-block", width: 70, height: 30 }}/> : metric.value === null ? "—" : formatNumber(metric.value)}</div><div className="metric-foot">{metric.note}</div></Panel>; })}
    </div>
    <div className="page-grid grid-2" style={{ marginBottom: 18 }}>
      <Panel><PanelHeading title="Platform workspaces" description="Quick access to the operational areas you manage."/><div className="page-grid" style={{ padding: 8, gap: 2 }}>{links.map((item) => { const Icon = item.icon; return <Link className="task-row" href={item.href} key={item.href}><div style={{ display: "flex", alignItems: "center", gap: 12 }}><span className="metric-icon"><Icon size={16}/></span><span><strong>{item.title}</strong><span>{item.description}</span></span></div><ArrowRight size={15}/></Link>; })}</div></Panel>
      <Panel><PanelHeading title="Recent organizations" description="The latest registered platform tenants." action={<Link className="table-link" href="/dashboard/organizations">View all</Link>}/>
        {organizations.length ? organizations.map((org) => <div className="task-row" key={org.id}><div><strong>{org.name}</strong><span>{org.slug} · {org.contact_email || "No contact email"}</span></div><StatusBadge value={org.status}/></div>) : <div className="empty-state"><div className="state-icon"><Building2 size={18}/></div><h3>{loading ? "Loading organizations…" : "No organizations to show"}</h3><p>Registered organization workspaces will appear here.</p></div>}
      </Panel>
    </div>
    {stats && Array.isArray(stats.monthlyRegistrations) ? <Panel><PanelHeading title="Registration activity" description="Monthly organization registration counts from the platform statistics service."/><div className="table-wrap"><table className="data-table"><thead><tr><th>Month</th><th>New organizations</th></tr></thead><tbody>{(stats.monthlyRegistrations as { month?: string; count?: number }[]).map((row, index) => <tr key={`${row.month ?? "month"}-${index}`}><td>{row.month ?? "—"}</td><td>{formatNumber(row.count ?? 0)}</td></tr>)}</tbody></table></div></Panel> : null}
  </>;
}
