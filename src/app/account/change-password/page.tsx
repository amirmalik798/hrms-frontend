"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";
import { apiRequest } from "@/lib/api-client";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      const result = await apiRequest<{ message?: string }>("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) });
      setSuccess(result.message || "Password changed. Please sign in again.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      window.setTimeout(() => router.replace("/"), 1600);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to change the password."); }
    finally { setBusy(false); }
  }

  return <><PageHeader eyebrow="Account security" title="Change password" description="Update your sign-in credentials. Your current session will be signed out after a successful change." /><div style={{ maxWidth: 640 }}><Panel className="panel-pad"><div className="form-note" style={{ marginBottom: 20 }}><ShieldCheck size={16} /> The existing backend applies password policy, rate limiting, and invalidates existing sessions after a successful change.</div><form onSubmit={submit} style={{ display: "grid", gap: 15 }}>
    {error ? <div role="alert" className="form-error">{error}</div> : null}{success ? <div role="status" className="info-callout">{success}</div> : null}
    <Field label="Current password"><TextInput type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></Field>
    <Field label="New password"><TextInput type="password" autoComplete="new-password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></Field>
    <Field label="Confirm new password"><TextInput type="password" autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></Field>
    <div style={{ display: "flex", justifyContent: "flex-end" }}><Button type="submit" variant="primary" busy={busy} leading={<KeyRound size={15} />}>Change password</Button></div>
  </form></Panel></div></>;
}
