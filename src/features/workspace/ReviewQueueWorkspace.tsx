"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Clock3, FileClock, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, TextArea } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ProfilePhoto } from "@/components/ui/ProfilePhoto";
import { apiRequest, pickArray, stringValue } from "@/lib/api-client";
import { formatDate, humanize, getLocalISODate } from "@/lib/format";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { useAttendanceRefresh } from "@/lib/attendance-events";

interface QueueItem extends Record<string, unknown> {
  id?: string; status?: string; firstName?: string; lastName?: string; employeeCode?: string;
  workDate?: string; createdAt?: string; requestType?: string; eventType?: string; reason?: string;
  requestedMinutes?: number; approvedMinutes?: number; employeeId?: string; reviewerNote?: string;
  excessMinutes?: number; scheduledEnd?: string; actualClockOut?: string;
}

type QueueType = "corrections" | "overtime" | "excess";
type DecisionKind = "approve" | "reject" | "reviewed" | "follow-up";
const endpoint: Record<QueueType, { path: string; keys: string[]; label: string }> = {
  corrections: { path: "/attendance/corrections", keys: ["requests", "corrections"], label: "Corrections" },
  overtime: { path: "/attendance/overtime", keys: ["requests", "overtimeRequests"], label: "Overtime" },
  excess: { path: "/attendance/excess-overtime", keys: ["cases", "reviews", "requests", "items"], label: "Excess time" },
};

function dateOffset(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function ReviewQueueWorkspace() {
  const { user, workDate } = useWorkspace();
  const authoritativeDate = workDate || getLocalISODate();
  const excessFromDate = dateOffset(authoritativeDate, -30);
  const excessToDate = dateOffset(authoritativeDate, 30);
  const available = useMemo<QueueType[]>(() => user.role === "DEPARTMENT_MANAGER" ? ["corrections", "overtime", "excess"] : ["corrections", "overtime", "excess"], [user.role]);
  const [active, setActive] = useState<QueueType>("corrections");
  const [items, setItems] = useState<Record<QueueType, QueueItem[]>>({ corrections: [], overtime: [], excess: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [decision, setDecision] = useState<DecisionKind>("approve");
  const [reviewerNote, setReviewerNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const results = await Promise.all(available.map(async (key) => {
      try {
        const path = key === "excess"
          ? `${endpoint[key].path}?fromDate=${excessFromDate}&toDate=${excessToDate}`
          : endpoint[key].path;
        return [key, pickArray(await apiRequest<unknown>(path), ...endpoint[key].keys)] as const;
      }
      catch (caught) { return [key, { error: caught instanceof Error ? caught.message : "Unable to load this queue." }] as const; }
    }));
    const next = { corrections: [], overtime: [], excess: [] } as Record<QueueType, QueueItem[]>;
    const errors: string[] = [];
    for (const [key, value] of results) {
      if (Array.isArray(value)) next[key] = value as QueueItem[];
      else errors.push(`${endpoint[key].label}: ${value.error}`);
    }
    setItems(next);
    if (errors.length) setError(errors.join(" · "));
    setLoading(false);
  }, [available, excessFromDate, excessToDate]);
  useEffect(() => { void load(); }, [load]);
  useAttendanceRefresh(() => { void load(); });
  const selectedItems = items[active];
  const pendingCount = selectedItems.filter((item) => ["PENDING", "OPEN"].includes(String(item.status ?? "").toUpperCase())).length;

  function openDecision(item: QueueItem, kind: DecisionKind) {
    setSelected(item); setDecision(kind); setReviewerNote(""); setActionError("");
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected?.id || saving) return;
    if ((decision === "reject" || decision === "follow-up") && !reviewerNote.trim()) {
      setActionError(decision === "reject" ? "A reviewer note is required when rejecting a request." : "Add a note explaining the follow-up required.");
      return;
    }
    setSaving(true); setActionError("");
    try {
      const body = active === "excess"
        ? { decision: decision === "reviewed" ? "MARK_REVIEWED" : "FOLLOW_UP", reviewerNote: reviewerNote.trim() || null }
        : { decision: decision === "approve" ? "APPROVE" : "REJECT", reviewerNote: reviewerNote.trim() || null };
      const route = active === "corrections" ? "/attendance/corrections" : active === "overtime" ? "/attendance/overtime" : "/attendance/excess-overtime";
      await apiRequest(`${route}/${selected.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setSelected(null);
      setNotice(active === "excess" ? (decision === "reviewed" ? "Excess time marked as reviewed. It remains unpaid." : "Follow-up note recorded. Excess time remains unpaid unless existing payroll rules permit otherwise.") : "Review decision saved.");
      await load();
      window.setTimeout(() => setNotice(""), 5000);
    } catch (caught) { setActionError(caught instanceof Error ? caught.message : "Unable to save the review decision."); }
    finally { setSaving(false); }
  }

  return <>
    <PageHeader eyebrow="Time & approvals" title="Review queue" description="One focused place for attendance corrections, advance overtime requests, and excess-time reviews." action={<Button variant="secondary" leading={<RefreshCw size={14} />} busy={loading} onClick={() => void load()}>Refresh</Button>} />
    {notice ? <div role="status" className="success-callout" style={{ marginBottom: 14 }}>{notice}</div> : null}
    {error ? <div className="info-callout" style={{ marginBottom: 14 }}><AlertCircle size={15} />Some queue sections could not be loaded. {error}</div> : null}
    {!workDate ? <div className="form-note" style={{ marginBottom: 14 }}>The organization work date could not be verified. The excess-time review list is using the device date for its date range; the backend remains authoritative for every review action.</div> : null}
    <Panel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: 13, borderBottom: "1px solid var(--border)" }}>
        {available.map((key) => {
          const Icon = key === "corrections" ? FileClock : key === "overtime" ? Clock3 : ShieldAlert;
          const count = items[key].filter((item) => ["PENDING", "OPEN"].includes(String(item.status ?? "").toUpperCase())).length;
          return <button type="button" key={key} className={`button button-sm ${active === key ? "button-primary" : "button-ghost"}`} onClick={() => setActive(key)}><Icon size={13} />{endpoint[key].label}<span className="task-count" style={{ minWidth: 21, height: 21, marginLeft: 2 }}>{count}</span></button>;
        })}
      </div>
      {loading && !selectedItems.length ? <div className="loading-state">Loading review items…</div> : null}
      {!loading && !selectedItems.length ? <div className="empty-state"><div className="state-icon"><CheckCircle2 size={19} /></div><h3>Nothing waiting here</h3><p>There are no {endpoint[active].label.toLowerCase()} currently waiting for review in your authorized scope.</p></div> : null}
      {selectedItems.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Employee</th><th>Request</th><th>Work date</th><th>Submitted</th><th>Status</th><th /></tr></thead><tbody>
        {selectedItems.map((item, index) => {
          const own = item.employeeId === user.employeeId;
          const pending = ["PENDING", "OPEN"].includes(String(item.status ?? "").toUpperCase());
          return <tr key={String(item.id ?? index)}>
            <td><div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}><ProfilePhoto employeeId={typeof item.employeeId === "string" ? item.employeeId : null} currentUser={typeof item.employeeId === "string" && item.employeeId === user.employeeId} name={`${stringValue(item, "firstName", "employeeName", "employee_name") || "Employee"} ${stringValue(item, "lastName")}`.trim()} className="user-avatar" /><span style={{ minWidth: 0 }}><span className="table-primary">{`${stringValue(item, "firstName", "employeeName", "employee_name") || "Employee"} ${stringValue(item, "lastName")}`.trim()}</span><span className="table-secondary">{stringValue(item, "employeeCode", "employee_code")}</span></span></div></td>
            <td><span className="table-primary">{active === "excess" ? `${Number(item.excessMinutes ?? 0)} excess minutes` : humanize(stringValue(item, "leaveType", "eventType", "requestType", "type") || endpoint[active].label)}</span><span className="table-secondary">{stringValue(item, "reason", "requestedNote", "reviewerNote")}</span></td>
            <td>{formatDate(stringValue(item, "workDate", "work_date", "startDate", "start_date"))}</td>
            <td>{formatDate(stringValue(item, "createdAt", "created_at"))}</td>
            <td><StatusBadge value={item.status ?? "PENDING"} /></td>
            <td><div style={{ display: "flex", justifyContent: "flex-end", gap: 5 }}>
              {pending && !own && active !== "excess" ? <><Button size="sm" variant="secondary" leading={<CheckCircle2 size={13} />} onClick={() => openDecision(item, "approve")}>Approve</Button><Button size="sm" variant="ghost" leading={<XCircle size={13} />} onClick={() => openDecision(item, "reject")}>Reject</Button></> : null}
              {pending && !own && active === "excess" ? <><Button size="sm" variant="secondary" onClick={() => openDecision(item, "reviewed")}>Mark reviewed</Button><Button size="sm" variant="ghost" onClick={() => openDecision(item, "follow-up")}>Follow up</Button></> : null}
              {own && pending ? <span className="table-secondary">Self-review is not allowed</span> : !pending ? <span className="table-secondary">No action required</span> : null}
            </div></td>
          </tr>;
        })}
      </tbody></table></div> : null}
      {!loading && selectedItems.length ? <div className="table-footer"><span>{selectedItems.length} records · {pendingCount} open/pending</span><span>Decisions are validated by the backend against the active role and assigned-department scope.</span></div> : null}
    </Panel>
    <Drawer open={Boolean(selected)} title={active === "excess" ? "Review excess time" : `${decision === "approve" ? "Approve" : "Reject"} ${endpoint[active].label.toLowerCase()}`} description="Review the employee, date, and reason before recording your decision." onClose={() => setSelected(null)} width="standard" footer={<><Button variant="secondary" onClick={() => setSelected(null)}>Cancel</Button><Button variant={decision === "reject" || decision === "follow-up" ? "danger" : "primary"} busy={saving} onClick={() => document.querySelector<HTMLFormElement>("#queue-decision-form")?.requestSubmit()}>{decision === "approve" ? "Approve request" : decision === "reject" ? "Reject request" : decision === "reviewed" ? "Mark as reviewed" : "Record follow-up"}</Button></>}>
      {selected ? <form id="queue-decision-form" onSubmit={submitDecision}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}><ProfilePhoto employeeId={typeof selected.employeeId === "string" ? selected.employeeId : null} name={`${stringValue(selected, "firstName", "employeeName", "employee_name")} ${stringValue(selected, "lastName")}`.trim() || "Employee"} /><strong style={{ color: "var(--text-strong)", fontSize: 13 }}>{`${stringValue(selected, "firstName", "employeeName", "employee_name")} ${stringValue(selected, "lastName")}`.trim() || "Employee"}</strong></div><div className="detail-list" style={{ marginBottom: 18 }}><div><span>Date</span><strong>{formatDate(stringValue(selected, "workDate", "work_date"))}</strong></div><div><span>Request</span><strong>{humanize(stringValue(selected, "eventType", "requestType", "type") || endpoint[active].label)}</strong></div>{typeof selected.requestedMinutes === "number" ? <div><span>Requested duration</span><strong>{Math.floor(selected.requestedMinutes / 60)}h {selected.requestedMinutes % 60}m</strong></div> : null}</div>
        {actionError ? <div role="alert" className="form-error">{actionError}</div> : null}
        <Field label={decision === "reject" ? "Reason for rejection" : decision === "follow-up" ? "Follow-up note" : "Reviewer note (optional)"} hint={decision === "reject" ? "Required · up to 500 characters" : decision === "follow-up" ? "Required · up to 500 characters" : "Optional · up to 500 characters"}><TextArea maxLength={500} required={decision === "reject" || decision === "follow-up"} value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} placeholder="Add context for the employee…" /></Field>
        {active === "excess" ? <div className="form-note"><ShieldAlert size={15} /> Excess time that was not approved in advance remains unpaid. This review does not authorize payment.</div> : null}
      </form> : null}
    </Drawer>
  </>;
}
