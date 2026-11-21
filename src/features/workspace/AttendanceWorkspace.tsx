"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarDays, RefreshCw } from "lucide-react";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { Button } from "@/components/ui/Button";
import { Panel, PanelHeading } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ProfilePhoto } from "@/components/ui/ProfilePhoto";
import { apiRequest } from "@/lib/api-client";
import { formatDate, getLocalISODate, humanize } from "@/lib/format";

interface AttendanceEntry {
  employeeId: string; employeeCode: string; firstName: string; lastName: string; departmentName: string;
  workDate: string; scheduleName: string; expectedStart: string | null; expectedEnd: string | null;
  firstClockIn: string | null; lastClockOut: string | null; workedMinutes: number;
  regularWorkedMinutes: number; approvedOvertimeMinutes: number; payableOvertimeMinutes: number;
  excessUnapprovedOvertimeMinutes: number; calculationStatus: string; leaveRequest?: { leaveType: string; status: string; isPaid: boolean } | null;
  publicHoliday?: { name: string; isPaid: boolean } | null;
}
interface CalendarPayload { status?: string; today?: string; timeZone?: string; entries?: AttendanceEntry[]; hasMore?: boolean; nextOffset?: number | null; message?: string }

function shiftDate(value: string, offset: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
function duration(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.floor(value / 60)}h ${String(value % 60).padStart(2, "0")}m`;
}
function timeLabel(value: string | null | undefined, timeZone: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try { return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(date); }
  catch { return value; }
}

export function AttendanceWorkspace({ pageKey }: { pageKey: string }) {
  const { user } = useWorkspace();
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [appliedFromDate, setAppliedFromDate] = useState("");
  const [appliedToDate, setAppliedToDate] = useState("");
  const [timeZone, setTimeZone] = useState("Africa/Kigali");
  const [rangeReady, setRangeReady] = useState(false);
  const [rangeRetry, setRangeRetry] = useState(0);
  const selfOnly = pageKey === "my-attendance" || user.role === "EMPLOYEE";

  // Seed the default range from the organization's authoritative work date.
  // User-selected From/To dates are kept separate and are never overwritten by refresh.
  useEffect(() => {
    let active = true;
    async function initializeRange() {
      setLoading(true); setError(""); setWarning(""); setRangeReady(false);
      try {
        const deviceDate = getLocalISODate();
        const initial = await apiRequest<CalendarPayload>(`/attendance/calendar?fromDate=${deviceDate}&toDate=${deviceDate}${selfOnly ? "&scope=self" : ""}`);
        const authoritativeDate = initial.today;
        if (!authoritativeDate || !/^\d{4}-\d{2}-\d{2}$/.test(authoritativeDate)) {
          throw new Error("The organization work date could not be verified. Attendance has not been loaded using your device date.");
        }
        const start = shiftDate(authoritativeDate, -14);
        const end = shiftDate(authoritativeDate, 14);
        if (!active) return;
        setTimeZone(initial.timeZone || "Africa/Kigali");
        setFromDate(start); setToDate(end);
        setAppliedFromDate(start); setAppliedToDate(end);
        if (deviceDate !== authoritativeDate) {
          setWarning(`The organization’s work date is ${authoritativeDate}. Dates are shown using ${initial.timeZone || "the organization timezone"}, not your device timezone.`);
        }
        setRangeReady(true);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to verify the organization work date.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void initializeRange();
    return () => { active = false; };
  // Re-seed only when the authenticated identity/page scope changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey, user.employeeId, rangeRetry]);

  const load = useCallback(async (silent = false) => {
    if (!appliedFromDate || !appliedToDate) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(appliedFromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(appliedToDate) || appliedFromDate > appliedToDate) {
      setError("Choose valid dates and make sure the From date is not after the To date.");
      return;
    }
    if (!silent) setLoading(true);
    setError("");
    try {
      const entries: AttendanceEntry[] = [];
      // The backend accepts at most 31 calendar days per request. Split longer
      // user-selected ranges into inclusive 31-day windows, then follow each
      // window's offset pagination so no records are silently omitted.
      const chunks: Array<{ fromDate: string; toDate: string }> = [];
      let cursor = appliedFromDate;
      while (cursor <= appliedToDate) {
        const candidateEnd = shiftDate(cursor, 30);
        const chunkEnd = candidateEnd < appliedToDate ? candidateEnd : appliedToDate;
        chunks.push({ fromDate: cursor, toDate: chunkEnd });
        cursor = shiftDate(chunkEnd, 1);
      }

      let latestResult: CalendarPayload | null = null;
      for (const chunk of chunks) {
        let offset = 0;
        for (let page = 0; page < 500; page += 1) {
          const query = new URLSearchParams({ fromDate: chunk.fromDate, toDate: chunk.toDate, offset: String(offset) });
          if (selfOnly) query.set("scope", "self");
          const result = await apiRequest<CalendarPayload>(`/attendance/calendar?${query.toString()}`);
          latestResult = result;
          if (Array.isArray(result.entries)) entries.push(...result.entries);
          if (!result.hasMore) break;
          const nextOffset = Number(result.nextOffset);
          if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset) throw new Error("The attendance calendar returned an invalid pagination cursor.");
          offset = nextOffset;
          if (page === 499) throw new Error("This date range contains more attendance records than can be displayed at once. Narrow the date range and try again.");
        }
      }
      setEntries(entries);
      if (latestResult?.timeZone) setTimeZone(latestResult.timeZone);
    } catch (caught) {
      if (!silent) setEntries([]);
      setError(caught instanceof Error ? caught.message : "Unable to load attendance for the selected date range.");
    } finally { if (!silent) setLoading(false); }
  }, [appliedFromDate, appliedToDate, selfOnly]);

  useEffect(() => { if (rangeReady) void load(); }, [load, rangeReady]);

  function applyDateRange() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      setError("Select both a valid From date and To date.");
      return;
    }
    if (fromDate > toDate) {
      setError("The From date must be on or before the To date.");
      return;
    }
    setError("");
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
  }

  function resetDateRange() {
    const base = appliedToDate || getLocalISODate();
    const start = shiftDate(base, -28);
    setFromDate(start); setToDate(base);
    setAppliedFromDate(start); setAppliedToDate(base);
    setError("");
  }

  const heading = selfOnly ? "My attendance" : "Attendance";
  const description = selfOnly ? "Your attendance record, expected shift, and worked time." : "Review expected shifts against recorded attendance across your authorized scope.";
  return <>
    <PageHeader eyebrow="Time & work" title={heading} description={description} action={<Button variant="secondary" leading={<RefreshCw size={14} />} busy={loading} onClick={() => rangeReady ? void load() : setRangeRetry((value) => value + 1)}>Refresh</Button>} />
    {warning ? <div className="info-callout" style={{ marginBottom: 14 }}><AlertCircle size={16} />{warning}</div> : null}
    {error ? <div role="alert" className="form-error" style={{ marginBottom: 14 }}>{error}</div> : null}
    <Panel>
      <PanelHeading title="Attendance calendar" description={appliedFromDate && appliedToDate ? `${formatDate(appliedFromDate, timeZone)} — ${formatDate(appliedToDate, timeZone)} · ${timeZone}` : `Choose a date range · ${timeZone}`} action={<span className="date-chip"><CalendarDays size={14} /> Organization time</span>} />
      <div className="toolbar" style={{ alignItems: "end", paddingTop: 0, marginBottom: 16 }}>
        <div className="toolbar-left" style={{ alignItems: "end", flexWrap: "wrap" }}>
          <label className="field" style={{ minWidth: 160 }}><span className="field-label">From date</span><input className="text-input" type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} /></label>
          <label className="field" style={{ minWidth: 160 }}><span className="field-label">To date</span><input className="text-input" type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} /></label>
          <Button variant="primary" leading={<CalendarDays size={14} />} busy={loading} disabled={!rangeReady || !fromDate || !toDate || fromDate > toDate} onClick={applyDateRange}>Apply dates</Button>
          <Button variant="ghost" disabled={loading || !rangeReady} onClick={resetDateRange}>Last 29 days</Button>
        </div>
        <span style={{ color: "var(--muted)", fontSize: 11 }}>{loading ? "Loading…" : `${entries.length} records`}</span>
      </div>
      {loading && !entries.length ? <div style={{ padding: 20, display: "grid", gap: 12 }}>{[1,2,3,4,5].map((n) => <div key={n} className="skeleton" style={{ height: 44 }} />)}</div> : null}
      {!loading && !error && !entries.length ? <div className="empty-state"><div className="state-icon"><CalendarDays size={19} /></div><h3>No attendance entries</h3><p>There are no scheduled shifts, recorded events, or approved time-off entries in this period.</p></div> : null}
      {entries.length ? <div className="table-wrap"><table className="data-table"><thead><tr>{!selfOnly ? <th>Employee</th> : null}<th>Work date</th><th>Shift</th><th>Expected</th><th>First in</th><th>Last out</th><th>Worked</th><th>Overtime</th><th>Status</th></tr></thead><tbody>
        {entries.map((entry, index) => <tr key={`${entry.employeeId}-${entry.workDate}-${index}`}>
          {!selfOnly ? <td><div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}><ProfilePhoto employeeId={entry.employeeId} currentUser={entry.employeeId === user.employeeId} name={`${entry.firstName} ${entry.lastName}`.trim()} className="user-avatar" /><span style={{ minWidth: 0 }}><span className="table-primary">{entry.firstName} {entry.lastName}</span><span className="table-secondary">{entry.employeeCode} · {entry.departmentName || "No department"}</span></span></div></td> : null}
          <td><span className="table-primary">{formatDate(entry.workDate, timeZone)}</span>{entry.leaveRequest ? <span className="table-secondary">{humanize(entry.leaveRequest.leaveType)} leave</span> : entry.publicHoliday ? <span className="table-secondary">{entry.publicHoliday.name}</span> : null}</td>
          <td>{entry.scheduleName || "No shift"}</td><td>{entry.expectedStart && entry.expectedEnd ? `${timeLabel(entry.expectedStart, timeZone)} – ${timeLabel(entry.expectedEnd, timeZone)}` : "—"}</td><td>{timeLabel(entry.firstClockIn, timeZone)}</td><td>{timeLabel(entry.lastClockOut, timeZone)}</td><td><span className="table-primary">{duration(entry.workedMinutes)}</span></td><td>{duration(entry.payableOvertimeMinutes)}</td><td><StatusBadge value={entry.calculationStatus || (entry.leaveRequest ? entry.leaveRequest.status : entry.publicHoliday ? "HOLIDAY" : "UNKNOWN")} /></td>
        </tr>)}
      </tbody></table></div> : null}
      <div className="table-footer"><span>{selfOnly ? "Your records only." : "Records are limited to your authorized organization or department scope."}</span><span>The backend calculates worked time and attendance status.</span></div>
    </Panel>
  </>;
}
