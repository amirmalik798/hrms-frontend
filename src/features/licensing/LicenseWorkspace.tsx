"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, Clock3, CreditCard, FileImage, History, ShieldCheck } from "lucide-react";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, TextInput } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiRequest } from "@/lib/api-client";
import { useSmartRefresh } from "@/lib/smart-refresh";

interface LicenseDetails {
  status: string;
  activationSource: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  remainingDays: number;
  canAccess: boolean;
  restrictionReason: string | null;
  databaseTime: string;
}
interface PaymentRecord {
  id: string;
  amount: string;
  currencyCode: string;
  transactionReference: string | null;
  proofImageMimeType: string;
  proofImageFilename: string | null;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}
interface LicensePayload { license?: LicenseDetails; payments?: PaymentRecord[]; paymentHistoryLimit?: number }

function dateTime(value: string | null, timeZone: string) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  try { return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(date); }
  catch { return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(date); }
}
function amount(value: string, currency: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return `${value} ${currency}`;
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(number); }
  catch { return `${number.toFixed(2)} ${currency}`; }
}

export function LicenseWorkspace() {
  const { currencyCode, timeZone } = useWorkspace();
  const loadSequenceRef = useRef(0);
  const [license, setLicense] = useState<LicenseDetails | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState(currencyCode || "USD");
  const [reference, setReference] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);

  const load = useCallback(async (silent = false) => {
    const requestId = ++loadSequenceRef.current;
    if (!silent) setLoading(true); setError("");
    try {
      const result = await apiRequest<LicensePayload>("/org/license");
      if (requestId !== loadSequenceRef.current) return;
      setLicense(result.license || null);
      setPayments(Array.isArray(result.payments) ? result.payments : []);
    } catch (caught) {
      if (requestId === loadSequenceRef.current) setError(caught instanceof Error ? caught.message : "Unable to load license information.");
    } finally {
      if (!silent && requestId === loadSequenceRef.current) setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useSmartRefresh(() => load(true), !formOpen && !confirmOpen && !submitting);
  useEffect(() => { if (currencyCode) setPaymentCurrency(currencyCode.toUpperCase()); }, [currencyCode]);

  const pending = payments.some((payment) => payment.status === "PENDING_REVIEW");
  const canSubmit = Boolean(proofFile) && Number(paymentAmount) > 0 && /^[A-Z]{3}$/.test(paymentCurrency) && paymentAmount.length <= 16 && reference.length <= 120;

  async function submitProof() {
    if (!proofFile || !canSubmit || submitting) return;
    setSubmitting(true); setError(""); setNotice("");
    try {
      const form = new FormData();
      form.append("proofImage", proofFile);
      await apiRequest<{ message?: string }>("/org/license/submissions", {
        method: "POST",
        body: form,
        headers: {
          "X-Payment-Amount": paymentAmount.trim(),
          "X-Payment-Currency": paymentCurrency,
          "X-Transaction-Reference": reference.trim(),
        },
      });
      setConfirmOpen(false); setFormOpen(false); setPaymentAmount(""); setReference(""); setProofFile(null);
      setNotice("Payment proof submitted for review. The license will change only after the existing verification process approves it.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to submit payment proof."); }
    finally { setSubmitting(false); }
  }

  const statusLabel = license?.status || "UNKNOWN";
  const statusDetail = license?.canAccess ? "Your organization can access the HRMS workspace." : license?.restrictionReason || "Access is restricted until the license is activated or renewed.";

  return <>
    <PageHeader eyebrow="Organization" title="License & payments" description="Review your subscription status and submit payment proof for verification." />
    {error ? <div className="form-error" role="alert" style={{ marginBottom: 13 }}>{error} The payment and license status will retry automatically.</div> : null}
    {notice ? <div className="success-callout" role="status" style={{ marginBottom: 13 }}><CheckCircle2 size={15} />{notice}</div> : null}
    {loading && !license ? <div className="loading-state">Loading your license…</div> : null}
    {license ? <>
      <Panel className="license-status-panel panel-pad">
        <div className="license-status-head"><span className="license-status-icon"><ShieldCheck size={21} /></span><div><p className="eyebrow">SUBSCRIPTION STATUS</p><h2>{statusLabel.replaceAll("_", " ")}</h2><p>{statusDetail}</p></div><StatusBadge value={statusLabel} /></div>
        <div className="license-facts"><div><span>Valid from</span><strong>{dateTime(license.startsAt, timeZone)}</strong></div><div><span>Expires</span><strong>{dateTime(license.expiresAt, timeZone)}</strong></div><div><span>Remaining days</span><strong>{Math.max(0, license.remainingDays).toLocaleString()}</strong></div><div><span>Activation source</span><strong>{license.activationSource?.replaceAll("_", " ") || "Not activated"}</strong></div></div>
        <div className="license-action-row"><p>Submitting proof does not make a payment or activate your subscription. The platform administrator reviews each submission.</p><Button variant="primary" leading={<CreditCard size={14} />} disabled={pending} onClick={() => { setError(""); setFormOpen(true); }}>{pending ? "Payment awaiting review" : "Submit payment proof"}</Button></div>
      </Panel>
      <Panel>
        <div className="panel-heading"><div><h2>Payment history</h2><p>Up to {50} recent submissions, including review outcomes.</p></div><span className="metric-icon"><History size={16} /></span></div>
        {payments.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Submitted</th><th>Amount</th><th>Reference</th><th>Proof</th><th>Status</th><th>Review note</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td>{dateTime(payment.createdAt, timeZone)}</td><td><span className="table-primary">{amount(payment.amount, payment.currencyCode)}</span></td><td>{payment.transactionReference || "—"}</td><td>{payment.proofImageFilename || payment.proofImageMimeType}</td><td><StatusBadge value={payment.status} /></td><td>{payment.rejectionReason || (payment.reviewedAt ? `Reviewed ${dateTime(payment.reviewedAt, timeZone)}` : "Awaiting review")}</td></tr>)}</tbody></table></div> : <div className="empty-state"><div className="state-icon"><History size={18} /></div><h3>No payment submissions yet</h3><p>Once you submit payment proof, its verification history will appear here.</p></div>}
      </Panel>
    </> : null}

    <Drawer open={formOpen} title="Submit payment proof" description="Provide the amount, currency, optional transaction reference, and one image of your payment receipt. The proof is stored privately for review." onClose={() => { if (!submitting) setFormOpen(false); }} footer={<><Button variant="secondary" disabled={submitting} onClick={() => setFormOpen(false)}>Cancel</Button><Button variant="primary" disabled={!canSubmit || pending} onClick={() => setConfirmOpen(true)}>Review submission</Button></>}>
      {error ? <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{error}</div> : null}
      <div className="form-section"><div className="form-grid"><Field label="Amount paid"><TextInput required inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="e.g. 150.00" /></Field><Field label="Currency code" hint="Three uppercase letters, such as USD or RWF."><TextInput required maxLength={3} value={paymentCurrency} onChange={(event) => setPaymentCurrency(event.target.value.toUpperCase())} /></Field><Field label="Transaction reference (optional)" hint="Maximum 120 characters."><TextInput maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} /></Field></div>
        <Field label="Payment receipt image" hint="JPEG, PNG, or WebP. Maximum 5 MB."><input className="text-input file-input" type="file" required accept="image/jpeg,image/png,image/webp" onChange={(event) => setProofFile(event.target.files?.[0] || null)} /></Field>
        {proofFile ? <div className="file-summary"><FileImage size={16} /><span>{proofFile.name}</span><small>{(proofFile.size / 1024 / 1024).toFixed(2)} MB</small></div> : null}
        <div className="form-note"><AlertCircle size={15} /> A payment proof submission is not a payment transfer and does not activate the license. The license status remains unchanged until an authorized platform review is completed.</div>
      </div>
    </Drawer>

    <Drawer open={confirmOpen} title="Confirm payment submission" description="Check the payment details before sending this proof for review." onClose={() => { if (!submitting) setConfirmOpen(false); }} width="standard" footer={<><Button variant="secondary" disabled={submitting} onClick={() => setConfirmOpen(false)}>Go back</Button><Button variant="primary" busy={submitting} onClick={() => void submitProof()}>Submit proof</Button></>}>
      <div className="detail-list"><div><span>Amount</span><strong>{amount(paymentAmount, paymentCurrency)}</strong></div><div><span>Transaction reference</span><strong>{reference.trim() || "Not provided"}</strong></div><div><span>Receipt file</span><strong>{proofFile?.name || "No image selected"}</strong></div><div><span>File size</span><strong>{proofFile ? `${(proofFile.size / 1024 / 1024).toFixed(2)} MB` : "—"}</strong></div></div>
      <p className="field-hint" style={{ marginTop: 14 }}>The submission will be marked Pending review. Your license remains unchanged until an authorized reviewer approves it.</p>
    </Drawer>
  </>;
}
