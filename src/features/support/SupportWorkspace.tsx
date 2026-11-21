"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { CircleHelp, Inbox, MessageCircle, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, TextArea, TextInput } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiRequest } from "@/lib/api-client";
import { formatDate } from "@/lib/format";

interface Conversation {
  id: string; organizationId: string; organizationName: string; subject: string; status: "OPEN" | "CLOSED";
  createdAt: string; updatedAt: string; lastMessageAt: string; createdByUserId: string; createdByName: string; lastMessage: string; unreadCount: number;
}
interface Message { id: string; senderUserId: string; senderName: string; senderRole: string; body: string; createdAt: string; deliveredAt: string | null; readAt: string | null }
interface InboxResult { currentUserId?: string; conversations?: Conversation[]; unreadTotal?: number; pagination?: { page?: number; total?: number; totalPages?: number } }
interface ThreadResult { currentUserId?: string; conversation?: Pick<Conversation, "id" | "organizationId" | "organizationName" | "subject" | "status">; messages?: Message[] }

function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>, busy: boolean) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
  event.preventDefault();
  if (!busy) event.currentTarget.form?.requestSubmit();
}

export function SupportWorkspace() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<ThreadResult["conversation"]>();
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [compose, setCompose] = useState(false);
  const [subject, setSubject] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [reply, setReply] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | "OPEN" | "CLOSED">("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const inboxSequence = useRef(0);
  const threadSequence = useRef(0);

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250); return () => window.clearTimeout(timer); }, [search]);

  const loadInbox = useCallback(async (silent = false) => {
    const sequence = ++inboxSequence.current;
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "25", search: debouncedSearch, status });
      const result = await apiRequest<InboxResult>(`/platform-support?${params.toString()}`);
      if (sequence !== inboxSequence.current) return;
      setItems(Array.isArray(result.conversations) ? result.conversations : []);
      setCurrentUserId(result.currentUserId || "");
      setUnreadTotal(Number(result.unreadTotal || 0));
      setTotalPages(Math.max(1, Number(result.pagination?.totalPages || 1)));
      setError("");
    } catch (caught) { if (sequence === inboxSequence.current) setError(caught instanceof Error ? caught.message : "Unable to load your support history."); }
    finally { if (!silent && sequence === inboxSequence.current) setLoading(false); }
  }, [page, debouncedSearch, status]);

  const loadThread = useCallback(async (id: string, silent = false) => {
    if (!id) return;
    const sequence = ++threadSequence.current;
    if (!silent) setThreadLoading(true);
    try {
      const result = await apiRequest<ThreadResult>(`/platform-support/${id}`);
      if (sequence !== threadSequence.current) return;
      setMessages(Array.isArray(result.messages) ? result.messages : []);
      setSelected(result.conversation);
      setCurrentUserId(result.currentUserId || "");
      if (!silent) void loadInbox(true);
    } catch (caught) { if (!silent && sequence === threadSequence.current) setError(caught instanceof Error ? caught.message : "Unable to load this conversation."); }
    finally { if (!silent && sequence === threadSequence.current) setThreadLoading(false); }
  }, [loadInbox]);

  useEffect(() => { void loadInbox(); }, [loadInbox]);
  useEffect(() => {
    if (selectedId) void loadThread(selectedId);
    else { threadSequence.current += 1; setMessages([]); setSelected(undefined); }
  }, [selectedId, loadThread]);
  useEffect(() => {
    if (!selectedId && items.length && !compose) setSelectedId(items[0].id);
    if (selectedId && items.length && !items.some((item) => item.id === selectedId)) setSelectedId("");
  }, [items, selectedId, compose]);
  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void loadThread(selectedId, true); }, 15000);
    const onVisible = () => { if (document.visibilityState === "visible") void loadInbox(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [selectedId, loadThread, loadInbox]);

  const visibleItems = useMemo(() => items, [items]);

  async function startConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ conversationId: string }>("/platform-support", { method: "POST", body: JSON.stringify({ subject: subject.trim(), message: firstMessage.trim() }) });
      setSubject(""); setFirstMessage(""); setCompose(false); setSelectedId(result.conversationId); setNotice("Your support message was sent to the platform team."); await loadInbox(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to send your support message."); }
    finally { setBusy(false); }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedId || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest(`/platform-support/${selectedId}`, { method: "POST", body: JSON.stringify({ message: reply.trim() }) });
      setReply(""); await Promise.all([loadThread(selectedId, true), loadInbox(true)]); setNotice("Your reply was sent.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to send your reply."); }
    finally { setBusy(false); }
  }

  async function changeStatus() {
    if (!selected || busy) return;
    const nextStatus = selected.status === "CLOSED" ? "OPEN" : "CLOSED";
    setBusy(true); setError("");
    try {
      await apiRequest(`/platform-support/${selected.id}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      await Promise.all([loadThread(selected.id, true), loadInbox(true)]);
      setNotice(nextStatus === "CLOSED" ? "Support conversation closed." : "Support conversation reopened.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update this conversation."); }
    finally { setBusy(false); }
  }

  return <>
    <PageHeader eyebrow="Communication" title="Platform support" description="Contact the platform team and follow the history of your support conversations." action={<Button variant="secondary" leading={<RefreshCw size={14} />} busy={loading} onClick={() => void loadInbox()}>Refresh</Button>} />
    {notice ? <div className="success-callout" role="status" style={{ marginBottom: 12 }}>{notice}</div> : null}
    {error ? <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{error} <button className="button button-sm button-ghost" onClick={() => void (selectedId ? loadThread(selectedId) : loadInbox())}>Try again</button></div> : null}
    <Panel className="support-panel">
      <div className="support-heading"><div><span className="support-icon"><CircleHelp size={18} /></span><div><h2>Support conversations</h2><p>{unreadTotal} unread message{unreadTotal === 1 ? "" : "s"}</p></div></div><Button variant="primary" leading={<MessageCircle size={14} />} onClick={() => { setCompose(true); setSelectedId(""); setError(""); }}>New support request</Button></div>
      <div className="support-layout">
        <aside className="support-inbox">
          <div className="support-filters"><label className="search-field"><span className="sr-only">Search support conversations</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search your conversations…" /></label><select className="filter-select" aria-label="Filter support status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="ALL">All statuses</option><option value="OPEN">Open</option><option value="CLOSED">Closed</option></select></div>
          {loading && !visibleItems.length ? <div className="loading-state">Loading conversations…</div> : visibleItems.length ? visibleItems.map((item) => <button type="button" key={item.id} onClick={() => { setCompose(false); setSelectedId(item.id); setError(""); setNotice(""); }} className={`support-thread-row ${selectedId === item.id && !compose ? "support-thread-active" : ""}`}><span className="support-thread-top"><strong>{item.subject}</strong><StatusBadge value={item.status} /></span><span className="support-thread-meta">{item.createdByName} · {dateLabel(item.lastMessageAt)}</span><span className="support-thread-preview">{item.lastMessage || "No messages yet"}</span></button>) : <div className="empty-state"><div className="state-icon"><Inbox size={18} /></div><h3>{search || status !== "ALL" ? "No matching conversations" : "No support conversations"}</h3><p>Start a request when you need help with your organization account or workspace.</p></div>}
          {totalPages > 1 ? <div className="table-footer"><span>Page {page} of {totalPages}</span><div><Button size="sm" variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>Next</Button></div></div> : null}
        </aside>
        <section className="support-conversation">
          {compose ? <form className="support-compose" onSubmit={startConversation}><div><p className="eyebrow">NEW SUPPORT REQUEST</p><h2>How can the platform team help?</h2><p>Start a private support conversation with the platform administrator.</p></div><Field label="Subject"><TextInput required minLength={1} maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Briefly describe the issue" /></Field><Field label="Message"><TextArea required maxLength={4000} rows={8} value={firstMessage} onChange={(event) => setFirstMessage(event.target.value)} placeholder="Describe what you need help with…" /></Field><div className="support-compose-actions"><Button variant="secondary" type="button" onClick={() => setCompose(false)}>Cancel</Button><Button variant="primary" type="submit" busy={busy} leading={<Send size={14} />}>Send request</Button></div></form> : selected && selectedId ? <><div className="support-thread-header"><div><p className="eyebrow">SUPPORT THREAD</p><h2>{selected.subject}</h2><p>Platform support team · {selected.organizationName}</p></div><div><StatusBadge value={selected.status} /><Button size="sm" variant="secondary" disabled={busy} onClick={() => void changeStatus()}>{selected.status === "OPEN" ? "Close conversation" : "Reopen conversation"}</Button></div></div><div className="support-message-list">{threadLoading && !messages.length ? <div className="loading-state">Loading conversation…</div> : messages.map((message) => <article className={`support-message ${message.senderUserId === currentUserId ? "support-message-own" : ""}`} key={message.id}><div className="support-message-meta"><strong>{message.senderUserId === currentUserId ? "You" : message.senderName}</strong><span>{dateLabel(message.createdAt)}</span></div><p>{message.body}</p>{message.senderUserId === currentUserId && message.readAt ? <small>Read {dateLabel(message.readAt)}</small> : null}</article>)}</div>{selected.status === "OPEN" ? <form className="support-reply" onSubmit={sendReply}><TextArea required maxLength={4000} rows={2} value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => submitOnEnter(event, busy)} placeholder="Write a reply…" /><Button type="submit" variant="primary" busy={busy} leading={<Send size={14} />}>Send</Button></form> : <div className="form-note">This conversation is closed. Reopen it to send a new reply.</div>}</> : <div className="support-empty"><span className="state-icon"><MessageCircle size={20} /></span><h2>Your support inbox</h2><p>Choose a conversation to see its messages, or start a new request.</p></div>}
        </section>
      </div>
    </Panel>
  </>;
}
function dateLabel(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date); }
