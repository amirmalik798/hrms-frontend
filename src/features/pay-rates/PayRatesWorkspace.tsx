"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarClock, CircleDollarSign, Clock3, History, Plus, RefreshCw, Save, ShieldCheck, UserRound } from "lucide-react";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, TextInput } from "@/components/ui/Field";
import { Panel, PanelHeading } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ProfilePhoto } from "@/components/ui/ProfilePhoto";
import { apiRequest } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";

interface EmployeeOption { id: string; employee_code: string; first_name: string; last_name: string; workforce_role: string; department_name?: string | null }
interface Rate { id: string; employeeId: string; hourlyRate: string; overtimeRate: string; currencyCode: string; effectiveFrom: string; effectiveTo: string | null; createdAt?: string; updatedAt?: string }
interface RateResponse { rates?: Rate[]; organizationCurrencyCode?: string | null; message?: string }
interface EmployeeListResponse { employees?: EmployeeOption[]; pagination?: { totalPages?: number }; message?: string }
type RateForm = { hourlyRate: string; overtimeRate: string; effectiveFrom: string; effectiveTo: string };
const blank = (): RateForm => ({ hourlyRate: "", overtimeRate: "", effectiveFrom: "", effectiveTo: "" });

export function PayRatesWorkspace() {
  const { user, currencyCode, workDate } = useWorkspace();
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [rates, setRates] = useState<Rate[]>([]);
  const [orgCurrency, setOrgCurrency] = useState(currencyCode ?? "");
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingRates, setLoadingRates] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rate | null>(null);
  const [form, setForm] = useState<RateForm>(blank);
  const [saving, setSaving] = useState(false);
  const current = employees.find((employee) => employee.id === employeeId);
  const selectedCurrency = orgCurrency || currencyCode || "";

  const loadEmployees = useCallback(async () => {
    setLoadingEmployees(true); setError("");
    try {
      const pageSize = 100;
      const firstPage = await apiRequest<EmployeeListResponse>(`/employees?page=1&limit=${pageSize}&status=ACTIVE&payRateEligible=true&sortBy=name&sortOrder=asc`);
      if (!Array.isArray(firstPage.employees)) throw new Error(firstPage.message || "The eligible employee list response was invalid.");
      const data = [...firstPage.employees];
      const totalPages = Math.max(1, Number(firstPage.pagination?.totalPages) || 1);
      if (totalPages > 10001) throw new Error("The eligible employee list is too large to load safely. Refine the workforce list and try again.");
      for (let page = 2; page <= totalPages; page += 1) {
        const nextPage = await apiRequest<EmployeeListResponse>(`/employees?page=${page}&limit=${pageSize}&status=ACTIVE&payRateEligible=true&sortBy=name&sortOrder=asc`);
        if (!Array.isArray(nextPage.employees)) throw new Error("The eligible employee list was incomplete. Please refresh and try again.");
        data.push(...nextPage.employees);
      }
      setEmployees(data);
      setEmployeeId((currentId) => currentId && data.some((item) => item.id === currentId) ? currentId : data[0]?.id ?? "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load eligible workforce members."); }
    finally { setLoadingEmployees(false); }
  }, []);
  useEffect(() => { void loadEmployees(); }, [loadEmployees]);

  const loadRates = useCallback(async () => {
    if (!employeeId) { setRates([]); return; }
    setLoadingRates(true); setError("");
    try {
      const result = await apiRequest<RateResponse>(`/attendance/pay-rates?employeeId=${encodeURIComponent(employeeId)}`);
      setRates(result.rates ?? []);
      if (result.organizationCurrencyCode) setOrgCurrency(result.organizationCurrencyCode);
    } catch (caught) { setRates([]); setError(caught instanceof Error ? caught.message : "Unable to load this employee’s rate history."); }
    finally { setLoadingRates(false); }
  }, [employeeId]);
  useEffect(() => { void loadRates(); }, [loadRates]);

  const activeRate = useMemo(() => rates.find((rate) => rate.effectiveFrom <= (workDate ?? new Date().toISOString().slice(0,10)) && (!rate.effectiveTo || rate.effectiveTo >= (workDate ?? new Date().toISOString().slice(0,10))) ) ?? rates[0], [rates, workDate]);
  function setValue<K extends keyof RateForm>(key: K, value: RateForm[K]) { setForm((currentValue) => ({ ...currentValue, [key]: value })); }
  function addRate() { setEditing(null); setForm({ ...blank(), effectiveFrom: workDate ?? new Date().toISOString().slice(0,10) }); setOpen(true); setError(""); }
  function editRate(rate: Rate) { setEditing(rate); setForm({ hourlyRate: rate.hourlyRate, overtimeRate: rate.overtimeRate, effectiveFrom: rate.effectiveFrom, effectiveTo: rate.effectiveTo ?? "" }); setOpen(true); setError(""); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employeeId || !selectedCurrency) { setError("Select an eligible employee and ensure the organization currency is configured first."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest("/attendance/pay-rates", { method: "PUT", body: JSON.stringify({ employeeId, ...(editing ? { rateId: editing.id } : {}), hourlyRate: Number(form.hourlyRate), overtimeRate: Number(form.overtimeRate), currencyCode: selectedCurrency, effectiveFrom: form.effectiveFrom, effectiveTo: form.effectiveTo || null }) });
      setOpen(false); setNotice(editing ? "Pay-rate period updated." : "New pay-rate period saved."); await loadRates();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save this pay-rate period."); }
    finally { setSaving(false); }
  }

  return <>
    <PageHeader eyebrow="Compensation" title="Employee pay rates" description="Maintain effective-dated hourly and overtime rates in the organization’s configured currency." action={<div style={{ display:"flex", gap:8 }}><Button variant="secondary" leading={<RefreshCw size={14} />} onClick={() => void loadRates()} busy={loadingRates}>Refresh</Button><Button variant="primary" leading={<Plus size={14} />} disabled={!employeeId || !selectedCurrency} onClick={addRate}>Add rate period</Button></div>} />
    {error ? <div role="alert" className="form-error" style={{ marginBottom:14 }}>{error}</div> : null}
    {notice ? <div role="status" className="success-callout" style={{ marginBottom:14 }}>{notice}</div> : null}
    <Panel style={{ marginBottom:16 }}>
      <div className="panel-pad form-grid" style={{ alignItems:"end" }}>
        <Field label="Workforce member" hint="Eligible profiles only. Your own HR Manager record and Organization Admin accounts are excluded by the backend."><select className="text-input" value={employeeId} disabled={loadingEmployees} onChange={(e) => setEmployeeId(e.target.value)}><option value="">{loadingEmployees ? "Loading eligible people…" : "Select a person"}</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name} · {employee.employee_code} · {employee.workforce_role.replaceAll("_"," ")}</option>)}</select></Field>
        <div><p className="field-hint" style={{ margin:0 }}>Selected workforce member</p>{current ? <div style={{ display:"flex", alignItems:"center", gap:9, marginTop:5 }}><ProfilePhoto name={`${current.first_name} ${current.last_name}`} employeeId={current.id} /><span><strong style={{ display:"block", fontSize:13, color:"var(--text-strong)" }}>{current.first_name} {current.last_name}</strong><span className="table-secondary">{current.employee_code} · {current.workforce_role.replaceAll("_", " ")}</span></span></div> : <span className="field-hint">No eligible member selected</span>}</div>
        <div><p className="field-hint" style={{ margin:0 }}>Organization currency</p><strong style={{ fontSize:18, color:"var(--text-strong)" }}>{selectedCurrency || "Not configured"}</strong></div>
        <div><p className="field-hint" style={{ margin:0 }}>Current effective rate</p><strong style={{ fontSize:14, color:"var(--text-strong)" }}>{activeRate ? `${formatMoney(activeRate.hourlyRate, activeRate.currencyCode)} / hour` : "No rate set"}</strong></div>
      </div>
    </Panel>
    <Panel>
      <PanelHeading title="Rate history" description={current ? `${current.first_name} ${current.last_name} · ${current.employee_code} · ${current.department_name || "No department"}` : "Select a workforce member to review pay-rate periods."} action={<span className="date-chip"><History size={13} /> Effective dates</span>} />
      {loadingRates ? <div className="loading-state">Loading rate history…</div> : !employeeId || !employees.length ? <div className="empty-state"><div className="state-icon"><UserRound size={18} /></div><h3>No eligible employees found</h3><p>Eligible workforce profiles will appear when available to your role.</p></div> : !rates.length ? <div className="empty-state"><div className="state-icon"><CircleDollarSign size={18} /></div><h3>No pay-rate history</h3><p>Add the first hourly and overtime rate period for this employee.</p><Button variant="primary" size="sm" onClick={addRate} leading={<Plus size={13} />}>Add rate period</Button></div> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Effective period</th><th>Hourly rate</th><th>Overtime rate</th><th>Currency</th><th>Last updated</th><th /></tr></thead><tbody>{rates.map((rate) => <tr key={rate.id}><td><span className="table-primary">{formatDate(rate.effectiveFrom)}</span><span className="table-secondary">Through {rate.effectiveTo ? formatDate(rate.effectiveTo) : "Until changed"}</span></td><td>{formatMoney(rate.hourlyRate, rate.currencyCode)}</td><td>{formatMoney(rate.overtimeRate, rate.currencyCode)}</td><td>{rate.currencyCode}</td><td>{rate.updatedAt ? formatDate(rate.updatedAt) : "—"}</td><td><Button size="sm" variant="secondary" onClick={() => editRate(rate)}>Edit period</Button></td></tr>)}</tbody></table></div>}
      <div className="table-footer"><span>Rate history must not overlap. The backend validates effective periods and calculates monthly pay.</span><span>HRMS does not calculate authoritative salary in the browser.</span></div>
    </Panel>
    <Drawer open={open} title={editing ? "Edit pay-rate period" : "Add pay-rate period"} description="Enter the regular and overtime hourly rates and the dates when they apply." onClose={() => setOpen(false)} width="standard" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" busy={saving} onClick={() => document.querySelector<HTMLFormElement>("#pay-rate-form")?.requestSubmit()} leading={<Save size={14} />}>Save rate period</Button></>}>
      <form id="pay-rate-form" onSubmit={submit}>
        <div className="detail-list" style={{ marginBottom:16 }}><div><span>Employee</span><strong>{current ? `${current.first_name} ${current.last_name} · ${current.employee_code}` : "—"}</strong></div><div><span>Currency</span><strong>{selectedCurrency || "Not configured"}</strong></div></div>
        <div className="form-grid"><Field label="Hourly rate" hint="Non-negative amount in organization currency."><TextInput required type="number" min="0" max="99999999" step="0.01" value={form.hourlyRate} onChange={(e) => setValue("hourlyRate", e.target.value)} /></Field><Field label="Overtime hourly rate" hint="Non-negative amount in organization currency."><TextInput required type="number" min="0" max="99999999" step="0.01" value={form.overtimeRate} onChange={(e) => setValue("overtimeRate", e.target.value)} /></Field><Field label="Effective from"><TextInput required type="date" value={form.effectiveFrom} onChange={(e) => setValue("effectiveFrom", e.target.value)} /></Field><Field label="Effective to" hint="Leave blank if this rate has no end date."><TextInput type="date" value={form.effectiveTo} onChange={(e) => setValue("effectiveTo", e.target.value)} /></Field></div>
        <div className="form-note"><ShieldCheck size={15} /> The backend rejects overlapping periods, currency changes across an employee’s history, and rates assigned to ineligible workforce records.</div>
      </form>
    </Drawer>
  </>;
}
