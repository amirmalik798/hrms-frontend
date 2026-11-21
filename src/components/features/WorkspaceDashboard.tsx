"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, ArrowRight, ArrowUpRight, Building2, CalendarClock, CheckCircle2, Clock3, FileClock, Mail, RefreshCw, ShieldCheck, Users, Wallet } from "lucide-react";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { Button } from "@/components/ui/Button";
import { Panel, PanelHeading } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { apiRequest, isRecord, pickArray, stringValue, numberValue } from "@/lib/api-client";
import { formatDate, formatNumber, humanize } from "@/lib/format";
import { roleLabels } from "@/lib/workspace-config";
import { notifyAttendanceStatusChanged, useAttendanceRefresh } from "@/lib/attendance-events";
import type { WorkspaceRole } from "@/types/workspace";

interface DashboardData {
  stats?: Record<string, unknown>;
  organization?: Record<string, unknown>;
  generatedAt?: string;
  workDate?: string | null;
  timeZone?: string;
  departments?: Record<string, unknown>[];
  recentEmployees?: Record<string, unknown>[];
  recentActivity?: Record<string, unknown>[];
  departmentDistribution?: Record<string, unknown>[];
  pendingInvitations?: number;
  team?: Record<string, unknown>;
  reviewCounts?: Record<string, unknown>;
  clockStatus?: string;
  events?: Record<string, unknown>[];
}

export function WorkspaceDashboard({ role }: { role: WorkspaceRole }) {
  const { user, timeZone } = useWorkspace();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      let result: DashboardData;
      if (role === "ORGANIZATION_ADMIN") {
        const [overview, activity] = await Promise.all([
          apiRequest<DashboardData>("/org/dashboard/stats"),
          apiRequest<unknown>("/org/dashboard/activity?limit=8").catch(() => null),
        ]);
        result = { ...overview, recentActivity: pickArray(activity, "activities") };
      } else if (role === "HR_MANAGER") {
        result = await apiRequest<DashboardData>("/hr-manager/overview");
      } else if (role === "DEPARTMENT_MANAGER") {
        result = await apiRequest<DashboardData>("/department-manager/overview");
      } else {
        const resultEvents = await apiRequest<DashboardData>("/attendance/events");
        result = resultEvents;
      }
      setData(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load your overview.");
    } finally { setLoading(false); }
  }, [role]);

  useEffect(() => { void load(); }, [load]);
  useAttendanceRefresh(() => { void load(); });

  const stats = data?.stats ?? {};
  const team = data?.team ?? {};
  const reviews = data?.reviewCounts ?? {};
  const metrics = useMemo(() => {
    if (role === "ORGANIZATION_ADMIN") return [
      { label: "Total workforce", value: stats.totalEmployees, note: `${formatNumber(numberValue(stats, "activeEmployees") ?? 0)} active`, icon: Users },
      { label: "Departments", value: stats.totalDepartments, note: `${formatNumber(numberValue(stats, "activeDepartments") ?? 0)} active`, icon: Building2 },
      { label: "Unassigned people", value: stats.unassignedEmployees, note: "Review department assignments", icon: ShieldCheck },
      { label: "Pending invitations", value: stats.pendingInvitations, note: "Awaiting acceptance", icon: Mail },
    ];
    if (role === "HR_MANAGER") return [
      { label: "Total workforce", value: stats.totalEmployees, note: `${formatNumber(numberValue(stats, "activeEmployees") ?? 0)} active`, icon: Users },
      { label: "Departments", value: stats.totalDepartments, note: "Across your organization", icon: Building2 },
      { label: "Corrections to review", value: stats.pendingCorrections, note: "Attendance requests", icon: FileClock },
      { label: "Overtime requests", value: stats.pendingOvertime, note: "Awaiting decision", icon: Clock3 },
    ];
    if (role === "DEPARTMENT_MANAGER") return [
      { label: "Team members", value: team.total, note: `${formatNumber(numberValue(team, "active") ?? 0)} active`, icon: Users },
      { label: "Assigned departments", value: data?.departments?.length ?? 0, note: "Your management scope", icon: Building2 },
      { label: "Items to review", value: reviews.total, note: "Corrections and overtime", icon: ClipboardIcon },
      { label: "Pending leave", value: reviews.leave ?? 0, note: "Awaiting your review", icon: CalendarClock },
    ];
    return [
      { label: "My latest activity", value: data?.events?.length ?? 0, note: "Recent attendance events", icon: Activity },
      { label: "Clock status", value: humanize(data?.clockStatus ?? "UNKNOWN"), note: "Based on your recorded punches", icon: Clock3 },
      { label: "Organization", value: user.organizationName, note: "Your current workplace", icon: Building2 },
      { label: "My role", value: roleLabels[role], note: "Your workspace access", icon: ShieldCheck },
    ];
  }, [role, stats, team, reviews, data, user.organizationName]);

  const heading = role === "EMPLOYEE" ? "Good to see you" : role === "DEPARTMENT_MANAGER" ? "Your team at a glance" : role === "HR_MANAGER" ? "People operations overview" : "Organization overview";
  const description = role === "EMPLOYEE" ? "A quick view of your day, your time, and what needs your attention." : role === "DEPARTMENT_MANAGER" ? "Stay close to your assigned teams and the work that needs review." : role === "HR_MANAGER" ? "Understand workforce health and move the important work forward." : "Understand the health of your workforce and organization setup.";

  return <>
    <PageHeader eyebrow={roleLabels[role]} title={heading} description={description} action={<Button variant="secondary" leading={<RefreshCw size={14} />} busy={loading} onClick={() => void load()}>Refresh</Button>} />
    <div className="dashboard-intro" style={{ marginBottom: 18 }}>
      <div><h2>{role === "EMPLOYEE" ? `Welcome to your workspace` : `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}`}, {user.displayName || roleLabels[role]}.</h2><p>{role === "EMPLOYEE" ? "Your personal work information is all in one place." : `Here is the latest view from ${user.organizationName}.`}</p></div>
      <span className="date-chip"><CalendarClock size={14} /> {formatDate(data?.workDate ?? new Date().toISOString(), timeZone)}</span>
    </div>

    {error ? <div className="error-state panel" style={{ marginBottom: 18 }}><div className="state-icon"><AlertCircle size={19} /></div><h3>We could not load this overview</h3><p>{error}</p><Button variant="secondary" leading={<RefreshCw size={14} />} onClick={() => void load()}>Try again</Button></div> : null}

    <div className="page-grid grid-4" style={{ marginBottom: 18 }}>
      {metrics.map((metric) => { const Icon = metric.icon; return <Panel key={metric.label} className="metric-card"><div className="metric-label"><span>{metric.label}</span><span className="metric-icon"><Icon size={16} /></span></div><div className="metric-value">{loading ? <span className="skeleton" style={{ display: "inline-block", width: 76, height: 30 }} /> : typeof metric.value === "number" ? formatNumber(metric.value) : metric.value ?? "—"}</div><div className="metric-foot">{metric.note}</div></Panel>; })}
    </div>

    {role === "EMPLOYEE" ? <EmployeeHomeContent clockStatus={data?.clockStatus} events={data?.events ?? []} /> : <div className="page-grid grid-2">
      <Panel>
        <PanelHeading title={role === "DEPARTMENT_MANAGER" ? "My departments" : "Work that needs attention"} description={role === "DEPARTMENT_MANAGER" ? "Only departments assigned to your manager account." : "Go straight to the next action instead of searching through the workspace."} />
        {loading ? <div className="loading-state"><div className="skeleton" style={{ height: 14, width: "60%", margin: "0 auto" }} /></div> : role === "DEPARTMENT_MANAGER" ? (data?.departments?.length ? data.departments.map((row) => <div className="task-row" key={stringValue(row, "id")}><div><strong>{stringValue(row, "name") || "Department"}</strong><span>{formatNumber(numberValue(row, "activeEmployeeCount") ?? 0)} active of {formatNumber(numberValue(row, "employeeCount") ?? 0)} members</span></div><span className="task-count">{numberValue(row, "employeeCount") ?? 0}</span></div>) : <div className="empty-state"><div className="state-icon"><Building2 size={18} /></div><h3>No assigned departments</h3><p>Your assigned department list will appear here when it is available.</p></div>) : <AttentionLinks role={role} stats={stats} reviews={reviews} />}
      </Panel>
      <Panel>
        <PanelHeading title={role === "DEPARTMENT_MANAGER" ? "Your review queue" : "Recent activity"} description={role === "DEPARTMENT_MANAGER" ? "Review the items currently waiting for a decision." : "A short timeline of recent organization activity."} />
        {role === "DEPARTMENT_MANAGER" ? <div className="task-list">
          <TaskLink href="/dm/reviews" title="Attendance corrections" description="Review employee correction requests." count={numberValue(reviews, "corrections") ?? 0} />
          <TaskLink href="/dm/reviews" title="Overtime requests" description="Review requests submitted in advance." count={numberValue(reviews, "overtime") ?? 0} />
          <TaskLink href="/dm/leave" title="Leave requests" description="Review time-off requests for your team." count={numberValue(reviews, "leave") ?? 0} />
        </div> : data?.recentActivity?.length ? data.recentActivity.slice(0, 7).map((row, index) => <div className="activity-row" key={stringValue(row, "id") || index}><span className="activity-dot" /><div><strong>{humanize(stringValue(row, "actionKey", "eventType") || "Workforce update")}</strong><span>{stringValue(row, "actorEmail", "employeeName") || "Organization activity"} · {formatDate(stringValue(row, "createdAt", "effectiveAt"), timeZone)}</span></div></div>) : <div className="empty-state"><div className="state-icon"><Activity size={18} /></div><h3>No recent activity</h3><p>When an organization update is recorded, it will appear here.</p></div>}
      </Panel>
    </div>}
  </>;
}

function AttentionLinks({ role, stats, reviews }: { role: WorkspaceRole; stats: Record<string, unknown>; reviews: Record<string, unknown> }) {
  const isAdmin = role === "ORGANIZATION_ADMIN";
  const links = isAdmin ? [
    { href: "/org/employees?filter=unassigned", title: "Unassigned workforce", description: "People without a department assignment.", count: numberValue(stats, "unassignedEmployees") ?? 0 },
    { href: "/org/departments", title: "Departments without managers", description: "Departments that need an eligible manager.", count: numberValue(stats, "departmentsWithoutEligibleManager") ?? 0 },
    { href: "/org/invitations", title: "Pending invitations", description: "Invitations that have not yet been accepted.", count: numberValue(stats, "pendingInvitations") ?? 0 },
  ] : [
    { href: "/hr/work-queue", title: "Attendance corrections", description: "Requests waiting for HR review.", count: numberValue(stats, "pendingCorrections") ?? 0 },
    { href: "/hr/work-queue", title: "Overtime requests", description: "Advance overtime requests waiting for review.", count: numberValue(stats, "pendingOvertime") ?? 0 },
    { href: "/hr/invitations", title: "Pending invitations", description: "New workforce members yet to accept.", count: numberValue(stats, "pendingInvitations") ?? 0 },
  ];
  return <div>{links.map((item) => <TaskLink key={item.title} {...item} />)}</div>;
}

function TaskLink({ href, title, description, count }: { href: string; title: string; description: string; count: number }) {
  return <Link href={href} className="task-row"><div><strong>{title}</strong><span>{description}</span></div><span style={{ display: "flex", alignItems: "center", gap: 9 }}><span className="task-count">{count}</span><ArrowRight size={14} color="var(--subtle)" /></span></Link>;
}

function EmployeeHomeContent({ clockStatus, events }: { clockStatus?: string; events: Record<string, unknown>[] }) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(clockStatus ?? "CLOCKED_OUT");
  const [error, setError] = useState("");
  useEffect(() => { if (clockStatus) setStatus(clockStatus); }, [clockStatus]);
  async function punch() {
    setSaving(true); setError("");
    try {
      const nextAction = status === "CLOCKED_IN" ? "CLOCK_OUT" : "CLOCK_IN";
      const result = await apiRequest<{ clockStatus?: string }>("/attendance/events", { method: "POST", body: JSON.stringify({ action: nextAction }) });
      setStatus(result.clockStatus ?? (nextAction === "CLOCK_IN" ? "CLOCKED_IN" : "CLOCKED_OUT"));
      notifyAttendanceStatusChanged();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The attendance action could not be completed."); }
    finally { setSaving(false); }
  }
  return <div className="page-grid grid-2" style={{ marginTop: 18 }}>
    <Panel className="panel-pad">
      <p className="eyebrow">TODAY</p><h2 style={{ fontSize: 18, color: "var(--text-strong)", margin: "4px 0 0", letterSpacing: "-.025em" }}>Your attendance</h2>
      <p style={{ color: "var(--muted)", fontSize: 12, margin: "6px 0 18px" }}>Your clock action is validated by the organization’s active shift and attendance rules.</p>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, border: "1px solid var(--border)", borderRadius: 11, background: "var(--surface-muted)" }}><span className="metric-icon"><Clock3 size={18} /></span><div><strong style={{ color: "var(--text-strong)", display: "block", fontSize: 13 }}>{humanize(status)}</strong><span style={{ color: "var(--muted)", fontSize: 10 }}>Current clock status</span></div><span style={{ marginLeft: "auto" }}><StatusBadge value={status} /></span></div>
      {error ? <p role="alert" className="field-error" style={{ marginTop: 12 }}>{error}</p> : null}
      <Button size="lg" className={`attendance-action-button ${status === "CLOCKED_IN" ? "is-clock-out" : "is-clock-in"}`} busy={saving} onClick={() => void punch()} leading={<Clock3 size={16} />}>{status === "CLOCKED_IN" ? "Clock out" : "Clock in"}</Button>
      <p className="field-hint" style={{ marginTop: 10 }}>If your action is outside the permitted shift window, the server will reject it and explain why.</p>
    </Panel>
    <Panel>
      <PanelHeading title="Recent punches" description="Your most recent recorded attendance events." />
      {events.length ? events.slice(0, 6).map((event, index) => <div className="activity-row" key={stringValue(event, "id") || index}><span className="activity-dot" /><div><strong>{humanize(stringValue(event, "eventType") || "Attendance event")}</strong><span>{formatDate(stringValue(event, "recordedAt"))} · {stringValue(event, "source") || "Recorded event"}</span></div></div>) : <div className="empty-state"><div className="state-icon"><Clock3 size={18} /></div><h3>No punches recorded yet</h3><p>Your attendance history will appear here once an event is recorded.</p></div>}
    </Panel>
  </div>;
}

function ClipboardIcon(props: { size?: number }) { return <FileClock size={props.size ?? 16} />; }
