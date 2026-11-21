"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, Clock3, FileDown, LoaderCircle, Printer, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { apiRequest } from "@/lib/api-client";
import { formatDate, formatMoney, humanize } from "@/lib/format";
import { buildSalarySlipDocument, type SalarySlipPayload } from "@/features/payroll/salary-slip-document";

interface EarningsDay {
  workDate: string; scheduleName: string | null; isPaidLeave: boolean; isPaidHoliday: boolean;
  payableMinutes: number; clockIn: string | null; clockOut: string | null; workedMinutes: number;
  regularWorkedMinutes: number; potentialOvertimeMinutes: number; approvedOvertimeMinutes: number;
  payableOvertimeMinutes: number; excessUnapprovedOvertimeMinutes: number; calculationStatus: string;
  regularPay: number | null; overtimePay: number | null; estimatedPay: number | null;
  currencyCode: string | null; excessOvertimeReviewStatus: string | null;
}
interface EarningsSummary {
  estimatedSalary: number | null; regularMinutes: number; payableOvertimeMinutes: number;
  potentialOvertimeMinutes: number; excessUnapprovedOvertimeMinutes: number; totalWorkedMinutes: number;
  paidLeaveMinutes: number; paidHolidayMinutes: number; payableMinutes: number; daysWorked: number;
  daysWithMissingRates: number; currencyMismatch: boolean; currencyCodes: string[];
}
interface EarningsPayload {
  status?: string; message?: string; month?: string; timeZone?: string; employeeName?: string;
  currencyCode?: string | null; hasRates?: boolean; summary?: EarningsSummary; days?: EarningsDay[]; disclaimer?: string;
}

function duration(minutes: number | null | undefined) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return "—";
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
function formatTime(value: string | null, timeZone: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try { return new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(date); }
  catch { return value; }
}

function monthOrdinal(value: string) { const [year, month] = value.split("-").map(Number); return year * 12 + month - 1; }
function validateOwnSlipRange(fromMonth: string, toMonth: string, organizationMonth: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(fromMonth) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(toMonth)) throw new Error("Choose valid start and end months.");
  const count = monthOrdinal(toMonth) - monthOrdinal(fromMonth) + 1;
  if (count < 1) throw new Error("The From month must be before or equal to the To month.");
  if (count > 24) throw new Error("A payslip can cover at most 24 months at a time.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(organizationMonth) || monthOrdinal(toMonth) > monthOrdinal(organizationMonth)) throw new Error("Future payroll months cannot be included. Select a range ending no later than the current organization month.");
  return count;
}

export function PersonalEarningsWorkspace() {
  const { user, workDate, currencyCode, timeZone } = useWorkspace();
  const organizationMonth = (workDate || new Date().toISOString().slice(0, 10)).slice(0, 7);
  const [slipFromMonth, setSlipFromMonth] = useState(organizationMonth);
  const [slipToMonth, setSlipToMonth] = useState(organizationMonth);
  const [slipGenerating, setSlipGenerating] = useState(false);
  const [slipRangeTouched, setSlipRangeTouched] = useState(false);
  const [slipError, setSlipError] = useState("");
  const [slipNotice, setSlipNotice] = useState("");
  const [month, setMonth] = useState((workDate || new Date().toISOString().slice(0, 10)).slice(0, 7));
  const [monthChanged, setMonthChanged] = useState(false);
  const [data, setData] = useState<EarningsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { if (workDate && !monthChanged) setMonth(workDate.slice(0, 7)); }, [workDate, monthChanged]);
  useEffect(() => {
    if (workDate && !slipRangeTouched) {
      const currentOrganizationMonth = workDate.slice(0, 7);
      setSlipFromMonth(currentOrganizationMonth);
      setSlipToMonth(currentOrganizationMonth);
    }
  }, [workDate, slipRangeTouched]);

  const load = useCallback(async () => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
    setLoading(true); setError("");
    try { setData(await apiRequest<EarningsPayload>(`/employee/earnings?month=${encodeURIComponent(month)}`)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load your earnings for this month."); setData(null); }
    finally { setLoading(false); }
  }, [month]);
  useEffect(() => { void load(); }, [load]);

  const summary = data?.summary;
  const days = Array.isArray(data?.days) ? data.days : [];
  const currency = data?.currencyCode || currencyCode;
  const incompleteRateDays = useMemo(() => days.filter((day) => day.payableMinutes > 0 && day.estimatedPay === null).length, [days]);
  const zone = data?.timeZone || timeZone;

  async function generateMyPayslip() {
    if (!user.employeeId || slipGenerating) {
      if (!user.employeeId) setSlipError("Your employee record could not be verified. Please sign in again.");
      return;
    }
    let count = 0;
    try { count = validateOwnSlipRange(slipFromMonth, slipToMonth, organizationMonth); }
    catch (caught) { setSlipError(caught instanceof Error ? caught.message : "Choose a valid payslip range."); return; }
    const printWindow = window.open("", "_blank");
    if (!printWindow) { setSlipError("Your browser blocked the salary-slip window. Allow pop-ups for this site and try again."); return; }
    printWindow.document.open();
    printWindow.document.write("<!doctype html><html><head><title>Preparing your salary slip</title></head><body style='font-family:Arial,sans-serif;padding:32px;color:#24354a'><h2>Preparing your salary slip…</h2><p>Loading your attendance, effective pay rates and current payment statuses.</p></body></html>");
    printWindow.document.close();
    setSlipGenerating(true); setSlipError(""); setSlipNotice("");
    try {
      const params = new URLSearchParams({ startMonth: slipFromMonth, endMonth: slipToMonth });
      const result = await apiRequest<SalarySlipPayload>(`/payroll/payslips/${encodeURIComponent(user.employeeId)}?${params.toString()}`);
      if (!result.employee || result.employee.id !== user.employeeId || result.startMonth !== slipFromMonth || result.endMonth !== slipToMonth || !Array.isArray(result.months) || result.months.length !== count) {
        throw new Error("The payslip data was incomplete or did not match the selected monthly period.");
      }
      if (printWindow.closed) {
        setSlipNotice("Your salary-slip data was prepared, but the print window was closed. Generate it again to print or save it.");
        return;
      }
      printWindow.document.open(); printWindow.document.write(buildSalarySlipDocument(result)); printWindow.document.close();
      const paidCount = result.months.filter((item) => item.payment.status === "PAID").length;
      setSlipNotice(`Your ${count}-month payslip is ready: ${paidCount} PAID and ${result.months.length - paidCount} UNPAID month(s). Generating a payslip does not change payroll records.`);
      window.setTimeout(() => { if (!printWindow.closed) { printWindow.focus(); printWindow.print(); } }, 300);
    } catch (caught) {
      if (!printWindow.closed) printWindow.close();
      setSlipError(caught instanceof Error ? caught.message : "Unable to generate your salary slip.");
    } finally { setSlipGenerating(false); }
  }

  return <>
    <PageHeader eyebrow="My account · Compensation" title="My earnings" description="Your personal earnings estimate from recorded working time and approved overtime. This is separate from organization payroll management." action={<Button variant="secondary" leading={<RefreshCw size={14} />} busy={loading} onClick={() => void load()}>Refresh</Button>} />
    <div className="toolbar" style={{ marginBottom: 14 }}>
      <label className="field" style={{ maxWidth: 190 }}><span className="field-label">Pay period</span><input className="text-input" type="month" value={month} onChange={(event) => { setMonth(event.target.value); setMonthChanged(true); }} /></label>
      <span className="date-chip"><CalendarDays size={13} /> {zone}</span><span style={{ marginLeft: "auto" }} />
      <span style={{ color: "var(--muted)", fontSize: 12 }}>{data?.employeeName || user.displayName}</span>
    </div>
    {error ? <div role="alert" className="form-error" style={{ marginBottom: 14 }}>{error}</div> : null}
    {!error && summary ? <>
      <div className="page-grid grid-3" style={{ marginBottom: 16 }}>
        <Panel className="metric-card"><div className="metric-icon"><Wallet size={17} /></div><div className="metric-label">Estimated earnings</div><div className="metric-value">{formatMoney(summary.estimatedSalary, currency)}</div><div className="metric-foot">For {month} · not a final payslip</div></Panel>
        <Panel className="metric-card"><div className="metric-icon"><Clock3 size={17} /></div><div className="metric-label">Recorded work</div><div className="metric-value">{duration(summary.totalWorkedMinutes)}</div><div className="metric-foot">{summary.daysWorked} days with recorded work</div></Panel>
        <Panel className="metric-card"><div className="metric-icon"><CalendarDays size={17} /></div><div className="metric-label">Approved overtime</div><div className="metric-value">{duration(summary.payableOvertimeMinutes)}</div><div className="metric-foot">Potential unapproved overtime: {duration(summary.excessUnapprovedOvertimeMinutes)}</div></Panel>
      </div>
      {summary.currencyMismatch ? <div className="form-error" role="alert" style={{ marginBottom: 14 }}>More than one currency appears in this period ({summary.currencyCodes.join(", ")}). The total is withheld until the pay-rate history is consistent.</div> : null}
      {incompleteRateDays > 0 || summary.daysWithMissingRates > 0 || !data?.hasRates ? <div className="info-callout" style={{ marginBottom: 14 }}><AlertCircle size={15} /><span>Some payable time does not have a complete effective pay rate. Affected amounts are not estimated. Ask HR to review your pay-rate history.</span></div> : null}
      {data?.disclaimer ? <div className="info-callout" style={{ marginBottom: 14 }}>{data.disclaimer}</div> : null}
    </> : null}
    <Panel>
      <div className="panel-heading"><div><h2>Daily earnings breakdown</h2><p>Backend-calculated figures for your own attendance record.</p></div><span className="date-chip">{loading ? "Loading…" : `${days.length} days`}</span></div>
      {loading && !days.length ? <div className="loading-state">Calculating your earnings…</div> : null}
      {!loading && !error && !days.length ? <div className="empty-state"><div className="state-icon"><Wallet size={18} /></div><h3>No earnings details for this period</h3><p>Your daily schedule and attendance details will appear here when available.</p></div> : null}
      {days.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Work date</th><th>Schedule</th><th>Clock in / out</th><th>Worked</th><th>Approved OT</th><th>Estimated amount</th><th>Status</th></tr></thead><tbody>{days.map((day) => <tr key={day.workDate}>
        <td><span className="table-primary">{formatDate(day.workDate, zone)}</span></td>
        <td>{day.scheduleName || "No shift"}{day.isPaidLeave ? <span className="table-secondary">Paid leave</span> : day.isPaidHoliday ? <span className="table-secondary">Paid holiday</span> : null}</td>
        <td><span className="table-primary">{formatTime(day.clockIn, zone)}</span><span className="table-secondary">{formatTime(day.clockOut, zone)}</span></td>
        <td><span className="table-primary">{duration(day.workedMinutes)}</span><span className="table-secondary">{duration(day.payableMinutes)} payable</span></td>
        <td>{duration(day.payableOvertimeMinutes)}{day.excessUnapprovedOvertimeMinutes > 0 ? <span className="table-secondary">{duration(day.excessUnapprovedOvertimeMinutes)} unapproved</span> : null}</td>
        <td><span className="table-primary">{formatMoney(day.estimatedPay, day.currencyCode || currency)}</span>{day.regularPay !== null || day.overtimePay !== null ? <span className="table-secondary">Regular {formatMoney(day.regularPay, day.currencyCode || currency)} · OT {formatMoney(day.overtimePay, day.currencyCode || currency)}</span> : null}</td>
        <td><StatusBadge value={day.calculationStatus || (day.isPaidLeave ? "PAID_LEAVE" : day.isPaidHoliday ? "PAID_HOLIDAY" : "NO_DATA")} />{day.excessOvertimeReviewStatus ? <span className="table-secondary">{humanize(day.excessOvertimeReviewStatus)}</span> : null}</td>
      </tr>)}</tbody></table></div> : null}
      <div className="table-footer"><span>Rates and payable time are provided by the backend.</span><span>Estimates may change after approved corrections or payroll review.</span></div>
    </Panel>
    {user.employeeId ? <Panel className="panel-pad" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}><span className="metric-icon"><FileDown size={18} /></span><div><h2 style={{ margin: 0, color: "var(--text-strong)", fontSize: 15 }}>Generate my payslip</h2><p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 11, lineHeight: 1.6 }}>Choose one month or a month-to-month period. Each month is printed as a separate statement with attendance, pay-rate history and the current payment status.</p></div></div>
      <div className="toolbar-left" style={{ alignItems: "end", flexWrap: "wrap" }}><label className="field" style={{ minWidth: 165 }}><span className="field-label">From month</span><input className="text-input" type="month" min="2000-01" max={slipToMonth || organizationMonth} value={slipFromMonth} disabled={slipGenerating} onChange={(event) => { setSlipRangeTouched(true); setSlipFromMonth(event.target.value); setSlipError(""); setSlipNotice(""); }} /></label><label className="field" style={{ minWidth: 165 }}><span className="field-label">To month</span><input className="text-input" type="month" min={slipFromMonth || "2000-01"} max={organizationMonth} value={slipToMonth} disabled={slipGenerating} onChange={(event) => { setSlipRangeTouched(true); setSlipToMonth(event.target.value); setSlipError(""); setSlipNotice(""); }} /></label><Button variant="primary" leading={slipGenerating ? <LoaderCircle size={14} /> : <Printer size={14} />} busy={slipGenerating} onClick={() => void generateMyPayslip()}>Generate payslip</Button></div>
      <p className="field-hint" style={{ marginTop: 9 }}>Up to 24 months. The selected range cannot include future organization payroll months. Generating a payslip never creates, edits or marks a payment as paid.</p>
      {slipError ? <div className="form-error" role="alert" style={{ marginTop: 12 }}>{slipError}</div> : null}
      {slipNotice ? <div className="success-callout" role="status" style={{ marginTop: 12 }}>{slipNotice}</div> : null}
    </Panel> : null}
  </>;
}
