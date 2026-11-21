"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, Plus, Search, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeading } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, TextArea, TextInput } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApiError, apiRequest, isRecord, pickArray, stringValue } from "@/lib/api-client";
import { formatDate, humanize } from "@/lib/format";
import { useSmartRefresh } from "@/lib/smart-refresh";

export type SuperAdminSection = "organizations" | "organization-admins" | "invitations" | "audit-logs" | "payments" | "support" | "system-health" | "organization-detail" | "organization-new";
interface Column { key: string; label: string }
interface SectionConfig { title: string; description: string; eyebrow: string; endpoint?: string; keys: string[]; columns: Column[] }
interface OrganizationRecord extends Record<string, unknown> { id: string; name: string; slug: string; status: string }

const configs: Record<SuperAdminSection, SectionConfig> = {
  organizations: { title: "Organizations", description: "Manage tenant workspaces, review their status, and inspect the people responsible for each account.", eyebrow: "Platform directory", endpoint: "/organizations?page=1&pageSize=100&status=ALL", keys: ["organizations"], columns: [{key:"name",label:"Organization"},{key:"slug",label:"Slug"},{key:"organization_admin_email",label:"Administrator"},{key:"status",label:"Status"},{key:"user_count",label:"Users"},{key:"created_at",label:"Created"}] },
  "organization-admins": { title: "Organization administrators", description: "Review administrator identities and their organization assignments.", eyebrow: "Account oversight", endpoint: "/organization-admins", keys: ["organizationAdmins"], columns: [{key:"first_name",label:"First name"},{key:"last_name",label:"Last name"},{key:"email",label:"Email"},{key:"organization_name",label:"Organization"},{key:"account_status",label:"Account"},{key:"organization_status",label:"Organization"},{key:"last_login_at",label:"Last login"}] },
  invitations: { title: "Platform invitations", description: "Review organization administrator invitations and their current acceptance state.", eyebrow: "Onboarding operations", endpoint: "/platform-invitations?page=1&pageSize=50&status=ALL", keys: ["invitations"], columns: [{key:"email",label:"Email"},{key:"organization_name",label:"Organization"},{key:"status",label:"Status"},{key:"created_at",label:"Created"},{key:"expires_at",label:"Expires"}] },
  "audit-logs": { title: "Audit logs", description: "Inspect platform audit events and the recorded actors, actions, and affected resources.", eyebrow: "Platform governance", endpoint: "/audit-logs?page=1&pageSize=50&includeFilters=1", keys: ["logs"], columns: [{key:"createdAt",label:"Time"},{key:"actorEmail",label:"Actor"},{key:"actionKey",label:"Action"},{key:"targetType",label:"Resource"},{key:"targetId",label:"Resource ID"},{key:"reason",label:"Reason"}] },
  payments: { title: "Payments & licenses", description: "Review payment submissions, payment proof metadata, and license information.", eyebrow: "Revenue operations", endpoint: "/platform-payments?page=1&pageSize=25&status=ALL&sort=NEWEST", keys: ["payments"], columns: [{key:"organizationName",label:"Organization"},{key:"amount",label:"Amount"},{key:"currency",label:"Currency"},{key:"status",label:"Status"},{key:"transactionReference",label:"Reference"},{key:"submittedAt",label:"Submitted"},{key:"licenseStatus",label:"License"}] },
  support: { title: "Platform support", description: "Respond to support conversations opened by organization administrators.", eyebrow: "Customer operations", endpoint: "/platform-support?page=1&pageSize=25&status=ALL", keys: ["conversations"], columns: [{key:"subject",label:"Subject"},{key:"organization_name",label:"Organization"},{key:"status",label:"Status"},{key:"last_message_at",label:"Last message"},{key:"unread_count",label:"Unread"}] },
  "system-health": { title: "System health", description: "Review database readiness and email-delivery configuration reported by the backend readiness check.", eyebrow: "Reliability", endpoint: "/health/ready", keys: [], columns: [] },
  "organization-detail": { title: "Organization details", description: "Review the tenant record, send its initial administrator invitation, and manage its lifecycle.", eyebrow: "Tenant record", endpoint: "/organizations", keys: [], columns: [] },
  "organization-new": { title: "Create organization", description: "Register a new organization and initialize its approved organization role hierarchy.", eyebrow: "Tenant onboarding", endpoint: "/organizations", keys: [], columns: [] },
};

function cellValue(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (value === null || value === undefined || value === "") return "—";
  if (key.toLowerCase().includes("_at") || key.toLowerCase().includes("date") || key.endsWith("At")) return formatDate(String(value));
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function extractRows(payload: unknown, keys: string[]) { return pickArray(payload, ...keys); }

export function SuperAdminResourcePage({ section, organizationId }: { section: SuperAdminSection; organizationId?: string }) {
  const config = configs[section];
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [healthData, setHealthData] = useState<Record<string, unknown> | null>(null);
  const [invitations, setInvitations] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [createOpen, setCreateOpen] = useState(section === "organization-new");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [adminStatusReason, setAdminStatusReason] = useState("");
  const [adminStatusBusy, setAdminStatusBusy] = useState(false);
  const [supportConversation, setSupportConversation] = useState<Record<string, unknown> | null>(null);
  const [supportMessages, setSupportMessages] = useState<Record<string, unknown>[]>([]);
  const [supportMessage, setSupportMessage] = useState("");
  const [supportBusy, setSupportBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [statusTarget, setStatusTarget] = useState<"ACTIVE" | "SUSPENDED" | "ARCHIVED" | null>(null);
  const [statusConfirmation, setStatusConfirmation] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", contactEmail: "", contactPhone: "", address: "", country: "" });

  const load = useCallback(async (silent = false) => {
    if (!config.endpoint) {
      if (!silent) setLoading(false);
      setError("This page is not available.");
      return;
    }
    if (!silent) setLoading(true); setError("");
    try {
      const url = section === "organization-detail" && organizationId ? `/organizations/${encodeURIComponent(organizationId)}` : config.endpoint;
      const result = await apiRequest<unknown>(url);
      if (section === "system-health") setHealthData(isRecord(result) ? result : null);
      const recordRows = section === "organization-detail" && isRecord(result) && isRecord(result.organization)
        ? [result.organization]
        : section === "organization-detail" && isRecord(result) ? [result] : extractRows(result, config.keys);
      setRows(recordRows);
      if (section === "organization-detail" && organizationId) {
        try {
          const inviteResult = await apiRequest<unknown>(`/organizations/${encodeURIComponent(organizationId)}/invitations`);
          setInvitations(pickArray(inviteResult, "invitations"));
        } catch (caught) {
          // The organization record remains useful when invitations cannot be fetched.
          setInvitations([]);
          setError(caught instanceof Error ? `Organization loaded, but invitations could not be retrieved: ${caught.message}` : "Organization loaded, but invitations could not be retrieved.");
        }
      }
    } catch (caught) {
      if (section === "system-health" && caught instanceof ApiError && isRecord(caught.payload)) {
        setHealthData(caught.payload);
        setError("The backend readiness check reports a degraded or unavailable service state.");
      } else {
        setError(caught instanceof Error ? caught.message : "Unable to load this platform resource.");
      }
    }
    finally { if (!silent) setLoading(false); }
  }, [config.endpoint, config.keys, organizationId, section]);
  useEffect(() => { void load(); }, [load]);
  useSmartRefresh(() => load(true), !createOpen && !selected && !supportConversation && !statusTarget && !saving && !reviewBusy && !adminStatusBusy && !supportBusy && !inviteBusy && section !== "organization-new");

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(q)));
  }, [rows, query]);

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const created = await apiRequest<{ organization?: { id?: string } }>("/organizations", { method: "POST", body: JSON.stringify({ name: form.name.trim(), slug: form.slug.trim().toLowerCase(), contactEmail: form.contactEmail.trim(), contactPhone: form.contactPhone.trim(), address: form.address.trim(), country: form.country.trim() }) });
      setNotice("Organization created successfully with its approved organization role hierarchy.");
      setCreateOpen(false);
      setForm({ name: "", slug: "", contactEmail: "", contactPhone: "", address: "", country: "" });
      const createdId = created.organization?.id;
      if (typeof createdId === "string" && createdId) window.location.assign(`/dashboard/organizations/${encodeURIComponent(createdId)}`);
      else await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to create organization."); }
    finally { setSaving(false); }
  }

  async function createAdministratorInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !inviteEmail.trim()) return;
    setInviteBusy(true); setError(""); setNotice("");
    try {
      await apiRequest(`/organizations/${encodeURIComponent(organizationId)}/invitations`, { method: "POST", body: JSON.stringify({ email: inviteEmail.trim().toLowerCase() }) });
      setInviteEmail(""); setNotice("Organization Admin invitation sent successfully."); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to send the administrator invitation."); }
    finally { setInviteBusy(false); }
  }

  async function updateOrganizationStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !statusTarget || !rows[0]) return;
    const organization = rows[0] as OrganizationRecord;
    const currentStatus = organization.status;
    if (statusConfirmation.trim() !== organization.slug) { setError("Enter the organization slug exactly to confirm this lifecycle change."); return; }
    if ((statusTarget === "ARCHIVED" || currentStatus === "ARCHIVED") && statusReason.trim().length < 3) { setError("Provide a reason of at least 3 characters for archiving or restoring this organization."); return; }
    setStatusBusy(true); setError(""); setNotice("");
    try {
      const body: Record<string, unknown> = { status: statusTarget };
      if (statusReason.trim()) body.reason = statusReason.trim();
      if (currentStatus === "ARCHIVED" && statusTarget === "SUSPENDED") body.restoreArchived = true;
      const result = await apiRequest<{ message?: string }>(`/organizations/${encodeURIComponent(organizationId)}/status`, { method: "PATCH", body: JSON.stringify(body) });
      setNotice(result.message || `Organization status changed to ${statusTarget}.`);
      setStatusTarget(null); setStatusConfirmation(""); setStatusReason(""); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to change organization status."); }
    finally { setStatusBusy(false); }
  }

  async function reviewPayment(decision: "APPROVE" | "REJECT") {
    const id = selected?.id;
    if (typeof id !== "string") return;
    if (decision === "REJECT" && !reviewReason.trim()) { setError("A rejection reason is required."); return; }
    setReviewBusy(true); setError(""); setNotice("");
    try {
      await apiRequest(`/platform-payments/${encodeURIComponent(id)}/review`, { method: "PATCH", body: JSON.stringify(decision === "APPROVE" ? { decision } : { decision, rejectionReason: reviewReason.trim() }) });
      setNotice(decision === "APPROVE" ? "Payment approved and license processing completed." : "Payment rejected.");
      setSelected(null); setReviewReason(""); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to review this payment."); }
    finally { setReviewBusy(false); }
  }

  async function updateOrganizationAdminStatus(status: "ACTIVE" | "SUSPENDED") {
    const id = selected?.id;
    if (typeof id !== "string") return;
    const reason = adminStatusReason.trim();
    if (reason.length < 3 || reason.length > 500) { setError("Provide an audit reason between 3 and 500 characters."); return; }
    setAdminStatusBusy(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ organizationAdmin?: Record<string, unknown>; message?: string }>(`/organization-admins/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, reason }),
      });
      if (result.organizationAdmin) setSelected((current) => current ? { ...current, ...result.organizationAdmin } : current);
      setAdminStatusReason("");
      setNotice(result.message || `Organization Admin account changed to ${status}.`);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update Organization Admin status."); }
    finally { setAdminStatusBusy(false); }
  }

  async function openSupportConversation(row: Record<string, unknown>) {
    const id = row.id;
    if (typeof id !== "string") return;
    setSupportConversation(row); setSupportMessages([]); setSupportMessage(""); setError("");
    try {
      const result = await apiRequest<{ messages?: Record<string, unknown>[] }>(`/platform-support/${encodeURIComponent(id)}`);
      setSupportMessages(Array.isArray(result.messages) ? result.messages : []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load support conversation."); }
  }

  async function sendSupportReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = supportConversation?.id;
    if (typeof id !== "string" || !supportMessage.trim()) return;
    setSupportBusy(true); setError("");
    try {
      await apiRequest(`/platform-support/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ message: supportMessage.trim() }) });
      setSupportMessage("");
      const refreshed = await apiRequest<{ messages?: Record<string, unknown>[] }>(`/platform-support/${encodeURIComponent(id)}`);
      setSupportMessages(Array.isArray(refreshed.messages) ? refreshed.messages : []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to send support reply."); }
    finally { setSupportBusy(false); }
  }

  async function updateSupportStatus(status: "OPEN" | "CLOSED") {
    const id = supportConversation?.id;
    if (typeof id !== "string") return;
    setSupportBusy(true); setError("");
    try {
      await apiRequest(`/platform-support/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setSupportConversation((current) => current ? { ...current, status } : current);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update support status."); }
    finally { setSupportBusy(false); }
  }

  const organization = section === "organization-detail" && rows[0] ? rows[0] as OrganizationRecord : null;
  const currentStatus = organization?.status ?? "";
  const statusOptions = currentStatus === "ACTIVE"
    ? [{ status: "SUSPENDED" as const, label: "Suspend organization", description: "Temporarily stop tenant access. The organization slug must be confirmed." }]
    : currentStatus === "SUSPENDED"
      ? [{ status: "ACTIVE" as const, label: "Reactivate organization", description: "Restore tenant access." }, { status: "ARCHIVED" as const, label: "Archive organization", description: "Archive this suspended organization with a recorded reason." }]
      : currentStatus === "ARCHIVED"
        ? [{ status: "SUSPENDED" as const, label: "Restore to suspended", description: "Restore the archived record into suspended review state. Reactivation is a separate action." }]
        : [];

  const singular = config.title.toLowerCase();
  return <>
    {section === "organization-detail" ? <div style={{ marginBottom: 10 }}><Link className="table-link" href="/dashboard/organizations"><ArrowLeft size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: 5 }}/>Back to organizations</Link></div> : null}
    <PageHeader eyebrow={config.eyebrow} title={section === "organization-detail" && organization ? organization.name : config.title} description={config.description} action={<>{section === "organizations" ? <Button variant="primary" leading={<Plus size={15}/>} onClick={() => setCreateOpen(true)}>Create organization</Button> : null}</>} />
    {notice ? <div className="success-callout" role="status" style={{ marginBottom: 16 }}>{notice}</div> : null}
    {error ? <div className="form-error" role="alert">{error}</div> : null}

    {section === "organization-detail" && organization ? <>
      <Panel>
        <PanelHeading title="Organization lifecycle" description="Changes are validated and recorded by the platform backend." action={<StatusBadge value={organization.status}/>}/>
        <div className="page-grid grid-3" style={{ padding: 18 }}>
          <div><div className="field-hint">Organization slug</div><div style={{ fontWeight: 650, color: "var(--text-strong)" }}>{organization.slug}</div></div>
          <div><div className="field-hint">Contact email</div><div style={{ fontWeight: 600, color: "var(--text-strong)" }}>{stringValue(organization, "contact_email") || "—"}</div></div>
          <div><div className="field-hint">Created</div><div style={{ fontWeight: 600, color: "var(--text-strong)" }}>{cellValue(organization, "created_at")}</div></div>
          {statusOptions.length ? <div className="toolbar" style={{ gridColumn: "1 / -1", padding: 0, border: 0, marginTop: 8 }}><div className="toolbar-left" style={{ flexWrap: "wrap" }}>{statusOptions.map((option) => <Button key={option.status} size="sm" variant={option.status === "ARCHIVED" ? "danger" : "secondary"} onClick={() => { setStatusTarget(option.status); setStatusConfirmation(""); setStatusReason(""); }}>{option.label}</Button>)}</div></div> : <p className="form-note" style={{ gridColumn: "1 / -1" }}>{currentStatus === "PENDING_SETUP" ? "Lifecycle changes are disabled until the organization completes its initial setup." : "No lifecycle transition is available for this status."}</p>}
        </div>
      </Panel>
      <Panel>
        <PanelHeading title="Organization Admin invitation" description="Send the initial administrator an invitation through the existing platform invitation workflow."/>
        {currentStatus === "ACTIVE" || currentStatus === "PENDING_SETUP" ? <form onSubmit={createAdministratorInvitation} className="toolbar" style={{ alignItems: "end" }}>
          <div style={{ flex: 1, minWidth: 220 }}><Field label="Administrator email"><TextInput type="email" required maxLength={254} value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="admin@organization.com"/></Field></div>
          <Button type="submit" variant="primary" busy={inviteBusy} leading={<Plus size={15}/>}>Send invitation</Button>
        </form> : <div className="form-note">An administrator invitation cannot be created while this organization is suspended or archived.</div>}
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Email</th><th>Status</th><th>Created</th><th>Expires</th><th>Accepted</th></tr></thead><tbody>{invitations.map((row,index)=><tr key={stringValue(row,"id") || index}><td className="table-primary">{stringValue(row,"email") || "—"}</td><td><StatusBadge value={stringValue(row,"status")}/></td><td>{cellValue(row,"created_at")}</td><td>{cellValue(row,"expires_at")}</td><td>{cellValue(row,"accepted_at")}</td></tr>)}</tbody></table>{!invitations.length ? <div className="empty-state"><p>No organization administrator invitations are currently recorded.</p></div> : null}</div>
      </Panel>
      <Panel>
        <PanelHeading title="Organization record" description="Read-only fields returned by the platform organization endpoint."/>
        <div className="page-grid grid-2" style={{ padding: 18 }}>{Object.entries(organization).map(([key,value])=><div key={key} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }}><div className="field-hint">{humanize(key)}</div><div style={{ color: "var(--text-strong)", fontWeight: 650, overflowWrap: "anywhere" }}>{value === null || value === undefined ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}</div></div>)}</div>
      </Panel>
    </> : null}

    {section !== "organization-detail" && section !== "organization-new" && section !== "system-health" ? <Panel>
      <PanelHeading title={`All ${singular}`} description={`${visibleRows.length} record${visibleRows.length === 1 ? "" : "s"} loaded`} />
      <div className="toolbar"><div className="toolbar-left"><label className="search-field"><Search size={15}/><input aria-label={`Search ${singular}`} placeholder={`Search ${singular}…`} value={query} onChange={(event) => setQuery(event.target.value)}/></label></div><div className="toolbar-right"><span className="field-hint">{rows.length} loaded</span></div></div>
      {loading ? <div className="loading-state"><div className="skeleton" style={{height:16,width:"45%",margin:"0 auto"}}/><p>Loading platform data…</p></div> : visibleRows.length && config.columns.length ? <div className="table-wrap"><table className="data-table"><thead><tr>{config.columns.map((column) => <th key={column.key}>{column.label}</th>)}{section === "organizations" || section === "organization-admins" || section === "support" || section === "payments" ? <th>Open</th> : null}</tr></thead><tbody>{visibleRows.map((row,index) => <tr key={stringValue(row,"id") || index}>{config.columns.map((column) => <td key={column.key}>{/status$/.test(column.key) ? <StatusBadge value={row[column.key]}/> : column.key === "name" || column.key === "subject" ? <span className="table-primary">{cellValue(row,column.key)}</span> : <span title={cellValue(row,column.key)}>{cellValue(row,column.key)}</span>}</td>)}{section === "organizations" || section === "organization-admins" || section === "support" || section === "payments" ? <td>{section === "organizations" && typeof row.id === "string" ? <Link className="button button-secondary button-sm" href={`/dashboard/organizations/${encodeURIComponent(row.id)}`}><Eye size={13}/> Details</Link> : section === "support" ? <button type="button" className="button button-secondary button-sm" onClick={() => void openSupportConversation(row)}><Eye size={13}/> Open conversation</button> : <button type="button" className="button button-secondary button-sm" onClick={() => { setSelected(row); setAdminStatusReason(""); }}><Eye size={13}/> Details</button>}</td> : null}</tr>)}</tbody></table></div> : <div className="empty-state"><div className="state-icon"><ShieldCheck size={18}/></div><h3>{error ? "Data unavailable" : query ? "No matching records" : "No records found"}</h3><p>{error ? "Check your backend connection and platform session, then try again." : `No ${singular} are currently available to display.`}</p></div>}
    </Panel> : null}

    {section === "system-health" ? <div className="page-grid grid-3">
      <Panel className="metric-card"><div className="metric-label"><span>Overall readiness</span><ShieldCheck size={16}/></div><div className="metric-value" style={{ fontSize: 22 }}>{stringValue(healthData ?? {}, "status") || (loading ? "Checking…" : "Unavailable")}</div><div className="metric-foot">{healthData?.ready === true ? "Backend reports ready" : healthData?.ready === false ? "Backend reports a degraded or unavailable state" : "No readiness result received"}</div></Panel>
      {isRecord(healthData?.checks) ? Object.entries(healthData.checks).map(([key,value]) => <Panel className="metric-card" key={key}><div className="metric-label"><span>{humanize(key)}</span><Activity size={16}/></div><div className="metric-value" style={{ fontSize: 22 }}>{String(value)}</div><div className="metric-foot">Reported by the backend readiness endpoint</div></Panel>) : <Panel className="panel-pad"><p className="field-hint">Readiness checks</p><p style={{ color: "var(--muted)", marginTop: 8 }}>Backend check details are unavailable.</p></Panel>}
      {healthData?.checkedAt ? <Panel className="panel-pad"><p className="field-hint">Last checked</p><p style={{ fontWeight: 650, color: "var(--text-strong)", marginTop: 8 }}>{formatDate(String(healthData.checkedAt))}</p><p className="metric-foot">The readiness endpoint checks PostgreSQL connectivity and email configuration. It does not send a test email.</p></Panel> : null}
    </div> : null}

    <Drawer open={createOpen} title="Create organization" description="Register a tenant workspace. The backend creates its approved organization roles and permission mappings in the same transaction." onClose={() => setCreateOpen(false)} footer={<><Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="create-organization-form" busy={saving}>Create organization</Button></>}>
      <form id="create-organization-form" onSubmit={createOrganization} className="page-grid" style={{gap:16}}>
        <Field label="Organization name"><TextInput required minLength={2} maxLength={120} value={form.name} onChange={(event)=>setForm((f)=>({...f,name:event.target.value}))} placeholder="Organization legal or trading name"/></Field>
        <Field label="Organization slug" hint="Unique URL-friendly identifier; the backend validates availability."><TextInput required maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={form.slug} onChange={(event)=>setForm((f)=>({...f,slug:event.target.value}))} placeholder="organization-name"/></Field>
        <Field label="Contact email"><TextInput type="email" required maxLength={254} value={form.contactEmail} onChange={(event)=>setForm((f)=>({...f,contactEmail:event.target.value}))} placeholder="admin@organization.com"/></Field>
        <Field label="Contact phone"><TextInput required pattern="[+()\d\s.-]{7,30}" value={form.contactPhone} onChange={(event)=>setForm((f)=>({...f,contactPhone:event.target.value}))} placeholder="+250…"/></Field>
        <Field label="Country" hint="Optional organization country"><TextInput maxLength={100} value={form.country} onChange={(event)=>setForm((f)=>({...f,country:event.target.value}))} placeholder="Rwanda"/></Field>
        <Field label="Address"><TextArea required minLength={3} maxLength={255} value={form.address} onChange={(event)=>setForm((f)=>({...f,address:event.target.value}))} placeholder="Organization address"/></Field>
      </form>
    </Drawer>

    <Drawer open={Boolean(statusTarget)} title={statusTarget === "ARCHIVED" ? "Archive organization" : currentStatus === "ARCHIVED" ? "Restore organization" : statusTarget === "SUSPENDED" ? "Suspend organization" : "Reactivate organization"} description="Confirm the transition against the organization's current record. The backend enforces allowed lifecycle transitions and writes the audit entry." onClose={() => { if (!statusBusy) { setStatusTarget(null); setStatusConfirmation(""); setStatusReason(""); } }} footer={<><Button variant="secondary" onClick={()=>setStatusTarget(null)} disabled={statusBusy}>Cancel</Button><Button variant={statusTarget === "ARCHIVED" ? "danger" : "primary"} type="submit" form="organization-status-form" busy={statusBusy}>Confirm change</Button></>}>
      <form id="organization-status-form" onSubmit={updateOrganizationStatus} className="page-grid" style={{gap:14}}>
        <div className="form-note">Type <strong>{organization?.slug}</strong> to confirm this change.</div>
        <Field label="Organization slug confirmation"><TextInput required value={statusConfirmation} onChange={(event)=>setStatusConfirmation(event.target.value)} placeholder="Enter the exact organization slug"/></Field>
        {(statusTarget === "ARCHIVED" || currentStatus === "ARCHIVED") ? <Field label="Reason" hint="At least 3 characters. This reason is recorded with the platform audit event."><TextArea required minLength={3} maxLength={1000} value={statusReason} onChange={(event)=>setStatusReason(event.target.value)} placeholder="Explain why this organization is being archived or restored."/></Field> : null}
      </form>
    </Drawer>

    <Drawer open={Boolean(supportConversation)} title={stringValue(supportConversation ?? {},"subject") || "Support conversation"} description={`${stringValue(supportConversation ?? {},"organization_name") || "Organization"} · ${stringValue(supportConversation ?? {},"status") || "OPEN"}`} onClose={()=>setSupportConversation(null)}>
      <div className="page-grid" style={{gap:12}}>
        <div className="toolbar" style={{padding:0,border:0}}><span className="field-hint">Conversation history</span><div className="toolbar-right">{stringValue(supportConversation ?? {},"status") === "OPEN" ? <Button size="sm" variant="secondary" busy={supportBusy} onClick={()=>void updateSupportStatus("CLOSED")}>Close conversation</Button> : <Button size="sm" variant="secondary" busy={supportBusy} onClick={()=>void updateSupportStatus("OPEN")}>Reopen conversation</Button>}</div></div>
        {supportMessages.length ? supportMessages.map((message,index)=><div key={stringValue(message,"id") || index} className="panel panel-pad"><div style={{display:"flex",justifyContent:"space-between",gap:10}}><strong>{stringValue(message,"senderName") || "User"}</strong><span className="field-hint">{formatDate(stringValue(message,"createdAt"))}</span></div><p style={{whiteSpace:"pre-wrap",margin:"9px 0 0",color:"var(--text)"}}>{stringValue(message,"body")}</p></div>) : <div className="empty-state"><h3>No messages</h3><p>There are no messages in this conversation yet.</p></div>}
        {stringValue(supportConversation ?? {},"status") === "OPEN" ? <form onSubmit={sendSupportReply} className="page-grid" style={{gap:10}}><Field label="Reply"><TextArea required maxLength={4000} value={supportMessage} onChange={(event)=>setSupportMessage(event.target.value)} placeholder="Write a response to the organization administrator…"/></Field><div style={{display:"flex",justifyContent:"flex-end"}}><Button type="submit" variant="primary" busy={supportBusy}>Send reply</Button></div></form> : <div className="form-note">This conversation is closed. Reopen it to send another reply.</div>}
      </div>
    </Drawer>

    <Drawer open={Boolean(selected)} title={stringValue(selected ?? {},"name","subject","organizationName") || "Record details"} description="Read-only overview of the selected platform record." onClose={()=>setSelected(null)} width="standard">
      {selected ? <div className="page-grid" style={{gap:13}}>{Object.entries(selected).map(([key,value])=><div key={key} style={{borderBottom:"1px solid var(--border)",paddingBottom:10}}><div className="field-hint">{humanize(key)}</div><div style={{color:"var(--text-strong)",fontWeight:600,overflowWrap:"anywhere"}}>{value === null || value === undefined ? "—" : typeof value === "object" ? JSON.stringify(value,null,2) : String(value)}</div></div>)}{section === "payments" && typeof selected.id === "string" && Number(selected.proofSizeBytes ?? 0) > 0 ? <div className="page-grid" style={{ gap: 8 }}><div className="field-hint">Submitted payment proof</div><img src={`/api/backend/payment-submissions/${encodeURIComponent(selected.id)}/proof`} alt="Organization payment proof" loading="lazy" style={{ display: "block", width: "100%", maxHeight: 420, objectFit: "contain", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-muted)" }} onError={(event) => { event.currentTarget.style.display = "none"; }}/></div> : null}{section === "payments" && selected.status === "PENDING_REVIEW" ? <div className="page-grid" style={{gap:10}}><Field label="Rejection reason" hint="Required only when rejecting a payment."><TextArea maxLength={1000} value={reviewReason} onChange={(event)=>setReviewReason(event.target.value)} placeholder="Explain why this submission cannot be approved."/></Field><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Button variant="danger" busy={reviewBusy} onClick={()=>void reviewPayment("REJECT")}>Reject payment</Button><Button variant="primary" busy={reviewBusy} onClick={()=>void reviewPayment("APPROVE")}>Approve payment</Button></div></div> : null}{section === "organization-admins" && (selected.account_status === "ACTIVE" || selected.account_status === "SUSPENDED") ? <div className="page-grid" style={{gap:10}}><Field label="Audit reason" hint="Required by the backend; 3–500 characters. The last-active-admin safeguard remains enforced server-side."><TextArea required minLength={3} maxLength={500} value={adminStatusReason} onChange={(event)=>setAdminStatusReason(event.target.value)} placeholder="Explain why this administrator's access is changing."/></Field><div style={{display:"flex",justifyContent:"flex-end"}}><Button variant={selected.account_status === "ACTIVE" ? "danger" : "primary"} busy={adminStatusBusy} onClick={()=>void updateOrganizationAdminStatus(selected.account_status === "ACTIVE" ? "SUSPENDED" : "ACTIVE")}>{selected.account_status === "ACTIVE" ? "Suspend administrator" : "Reactivate administrator"}</Button></div></div> : null}</div>:null}
    </Drawer>
  </>;
}
