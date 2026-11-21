"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, FileBarChart, RefreshCw } from "lucide-react";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { Button } from "@/components/ui/Button";
import { Field, SelectInput, TextInput } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiRequest } from "@/lib/api-client";
import { formatDate, humanize } from "@/lib/format";

interface ReportTarget { employeeId: string; employeeCode: string; firstName: string; lastName: string; departmentName: string | null; workforceRole: string; employmentStatus: string }
interface ReportEntry { workDate: string; scheduleName: string | null; status: string; firstClockIn: string | null; lastClockOut: string | null; workedMinutes: number; regularWorkedMinutes: number; payableOvertimeMinutes: number; excessUnapprovedOvertimeMinutes: number }
interface ReportMonth { month: string; days: number; scheduledDays: number; daysWithAttendance: number; workedDays: number; workedMinutes: number; regularWorkedMinutes: number; potentialOvertimeMinutes: number; approvedOvertimeMinutes: number; payableOvertimeMinutes: number; excessUnapprovedOvertimeMinutes: number; workedHours: number; regularHours: number; approvedOvertimeHours: number }
interface ReportPayload { status?: string; message?: string; organization?: { name: string; timeZone: string }; generatedAt?: string; employee?: ReportTarget; fromDate?: string; toDate?: string; attendanceRecordCount?: number; entries?: ReportEntry[]; months?: ReportMonth[] }

export function ReportsWorkspace() {
  const { user, workDate, timeZone } = useWorkspace();
  const [targets, setTargets] = useState<ReportTarget[]>([]);
  const [targetId, setTargetId] = useState(user.role === "EMPLOYEE" ? user.employeeId || "" : "");
  const [fromDate, setFromDate] = useState(monthStart(workDate || todayISO()));
  const [toDate, setToDate] = useState(workDate || todayISO());
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loadingTargets, setLoadingTargets] = useState(user.role !== "EMPLOYEE");
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadTargets = useCallback(async () => {
    if (user.role === "EMPLOYEE") return;
    setLoadingTargets(true); setError("");
    try {
      const result = await apiRequest<{ targets?: ReportTarget[] }>("/attendance/reports/monthly?mode=targets");
      const values = Array.isArray(result.targets) ? result.targets : [];
      setTargets(values);
      setTargetId((current) => current || values[0]?.employeeId || "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load report targets."); }
    finally { setLoadingTargets(false); }
  }, [user.role]);

  useEffect(() => { void loadTargets(); }, [loadTargets]);
  useEffect(() => { if (workDate) { setToDate(workDate); setFromDate((current) => current === monthStart(todayISO()) ? monthStart(workDate) : current); } }, [workDate]);

  const selectedTarget = useMemo(() => targets.find((target) => target.employeeId === targetId), [targets, targetId]);
  const totalWorkedHours = useMemo(() => (report?.months || []).reduce((sum, month) => sum + month.workedMinutes, 0) / 60, [report]);
  const totalPayableOvertime = useMemo(() => (report?.months || []).reduce((sum, month) => sum + month.payableOvertimeMinutes, 0) / 60, [report]);

  function buildQuery(asJson: boolean) {
    const params = new URLSearchParams({ employeeId: user.role === "EMPLOYEE" ? user.employeeId || "" : targetId, fromDate, toDate });
    if (asJson) params.set("format", "json");
    return `/attendance/reports/monthly?${params.toString()}`;
  }

  async function generate() {
    setGenerating(true); setError(""); setNotice(""); setReport(null);
    try {
      if (!targetId && user.role !== "EMPLOYEE") throw new Error("Select a workforce member first.");
      if (!isDate(fromDate) || !isDate(toDate) || fromDate > toDate) throw new Error("Choose a valid date range.");
      const months = monthOrdinal(toDate) - monthOrdinal(fromDate) + 1;
      if (months > 24) throw new Error("Attendance reports can cover up to 24 calendar months at a time.");
      const result = await apiRequest<ReportPayload>(buildQuery(true));
      setReport(result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to generate this attendance report."); }
    finally { setGenerating(false); }
  }

  async function downloadPdf() {
    setDownloading(true); setError(""); setNotice("");
    try {
      if (!targetId && user.role !== "EMPLOYEE") throw new Error("Select a workforce member first.");
      if (!isDate(fromDate) || !isDate(toDate) || fromDate > toDate) throw new Error("Choose a valid date range.");
      const months = monthOrdinal(toDate) - monthOrdinal(fromDate) + 1;
      if (months > 24) throw new Error("Attendance reports can cover up to 24 calendar months at a time.");
      const response = await fetch(`/api/backend${buildQuery(false)}`, { credentials: "same-origin", cache: "no-store" });
      const type = response.headers.get("content-type") || "";
      if (!response.ok || type.includes("application/json")) {
        const payload = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(payload?.message || `Report download failed (${response.status}).`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
      const fallback = `attendance-${user.role === "EMPLOYEE" ? "my" : (selectedTarget?.employeeCode || "workforce")}-${fromDate}-to-${toDate}.pdf`;
      const filename = match ? decodeURIComponent(match[1].replaceAll('"', "")) : fallback;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      setNotice("Your attendance report PDF has been downloaded.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to download this report."); }
    finally { setDownloading(false); }
  }

  return <>
    <PageHeader eyebrow="Insights" title="Attendance reports" description="Generate a detailed attendance report for a person and a date range. Report data and calculations are supplied by the backend." action={<Button variant="secondary" leading={<RefreshCw size={14} />} busy={loadingTargets} onClick={() => void loadTargets()}>Refresh targets</Button>} />
    {notice ? <div className="success-callout" role="status" style={{ marginBottom: 12 }}>{notice}</div> : null}
    {error ? <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{error}</div> : null}
    <Panel className="panel-pad">
      <div className="report-filter-grid">
        {user.role !== "EMPLOYEE" ? <Field label="Workforce member"><SelectInput required value={targetId} onChange={(event) => { setTargetId(event.target.value); setReport(null); }}><option value="">Select a person</option>{targets.map((target) => <option key={target.employeeId} value={target.employeeId}>{target.firstName} {target.lastName} · {target.employeeCode} · {target.departmentName || "No department"}</option>)}</SelectInput></Field> : <Field label="Report subject"><TextInput disabled value="My attendance" /></Field>}
        <Field label="From date"><TextInput type="date" value={fromDate} max={toDate} onChange={(event) => { setFromDate(event.target.value); setReport(null); }} /></Field>
        <Field label="To date"><TextInput type="date" value={toDate} min={fromDate} onChange={(event) => { setToDate(event.target.value); setReport(null); }} /></Field>
      </div>
      <div className="report-filter-footer"><p>Organization timezone: <strong>{timeZone}</strong>. Maximum report span: 24 calendar months.</p><div style={{ display: "flex", gap: 8 }}><Button variant="secondary" leading={<FileBarChart size={14} />} busy={generating} disabled={loadingTargets || (!targetId && user.role !== "EMPLOYEE")} onClick={() => void generate()}>Preview report</Button><Button variant="primary" leading={<ArrowDownToLine size={14} />} busy={downloading} disabled={loadingTargets || (!targetId && user.role !== "EMPLOYEE")} onClick={() => void downloadPdf()}>Download PDF</Button></div></div>
    </Panel>
    {report ? <>
      <div className="report-kpis"><Panel className="metric-card"><span className="metric-label">Attendance days recorded</span><strong className="metric-value">{report.attendanceRecordCount ?? 0}</strong></Panel><Panel className="metric-card"><span className="metric-label">Hours worked</span><strong className="metric-value">{totalWorkedHours.toFixed(1)}</strong></Panel><Panel className="metric-card"><span className="metric-label">Approved overtime hours</span><strong className="metric-value">{totalPayableOvertime.toFixed(1)}</strong></Panel></div>
      <Panel><div className="panel-heading"><div><h2>{report.employee ? `${report.employee.firstName} ${report.employee.lastName}` : "Attendance summary"}</h2><p>{report.organization?.name || "Organization"} · {formatDate(fromDate, timeZone)} – {formatDate(toDate, timeZone)}</p></div><StatusBadge value="Generated" /></div>
        {report.months?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Month</th><th>Scheduled days</th><th>Days recorded</th><th>Worked hours</th><th>Regular hours</th><th>Approved overtime</th></tr></thead><tbody>{report.months.map((month) => <tr key={month.month}><td>{new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month.month}-01T00:00:00Z`))}</td><td>{month.scheduledDays}</td><td>{month.daysWithAttendance}</td><td>{(month.workedMinutes / 60).toFixed(2)}</td><td>{(month.regularWorkedMinutes / 60).toFixed(2)}</td><td>{(month.payableOvertimeMinutes / 60).toFixed(2)}</td></tr>)}</tbody></table></div> : null}
      <div className="panel-heading"><div><h2>Daily attendance</h2><p>{Math.min(report.entries?.length || 0, 31)} latest records shown in the preview. Download the full PDF for the complete period.</p></div></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Work date</th><th>Schedule</th><th>First clock-in</th><th>Last clock-out</th><th>Worked</th><th>Status</th></tr></thead><tbody>{(report.entries || []).slice(-31).map((entry) => <tr key={entry.workDate}><td>{formatDate(entry.workDate, timeZone)}</td><td>{entry.scheduleName || "—"}</td><td>{formatTime(entry.firstClockIn, timeZone)}</td><td>{formatTime(entry.lastClockOut, timeZone)}</td><td>{(entry.workedMinutes / 60).toFixed(2)} h</td><td><StatusBadge value={entry.status} /></td></tr>)}</tbody></table></div>
    </Panel>
    </> : <Panel className="panel-pad report-placeholder"><div className="state-icon"><FileBarChart size={18} /></div><h3>Choose your report details</h3><p>Preview will display month summaries and recent daily attendance. The PDF download contains the complete report generated by the backend.</p></Panel>}
  </>;
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function monthStart(value: string) { return `${value.slice(0, 7)}-01`; }
function isDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)); }
function monthOrdinal(value: string) { const [year, month] = value.split("-").map(Number); return year * 12 + month; }
function formatTime(value: string | null, timeZone: string) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(date); }
