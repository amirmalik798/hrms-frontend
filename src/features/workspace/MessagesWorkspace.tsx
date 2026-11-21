"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Bell, Check, CheckCheck, LoaderCircle, Mail, MessageCircle, Plus, Send, ShieldCheck, UserRound } from "lucide-react";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";
import { apiRequest, pickArray, stringValue } from "@/lib/api-client";
import { formatDate, humanize } from "@/lib/format";
import { ProfilePhoto } from "@/components/ui/ProfilePhoto";

interface Conversation { id: string; subject: string; lastMessageAt: string; otherUserId: string; otherName: string; otherRole: string; lastMessage: string; unreadCount: number; otherEmployeeId?: string | null }
interface Message { id: string; senderUserId: string; senderName: string; senderRole: string; body: string; createdAt: string; deliveredAt?: string | null; readAt?: string | null }
interface InboxPayload { currentUserId?: string; conversations?: Conversation[]; canStartNew?: boolean; recipientName?: string | null; recipientRole?: string | null }
interface ThreadPayload { conversation?: { id: string; subject: string; otherName: string; otherRole: string }; messages?: Message[] }

export function MessagesWorkspace() {
  const { user } = useWorkspace();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [threadSubject, setThreadSubject] = useState("");
  const [otherName, setOtherName] = useState("");
  const [otherRole, setOtherRole] = useState("");
  const [canStartNew, setCanStartNew] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [compose, setCompose] = useState(false);
  const [subject, setSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [reply, setReply] = useState("");

  const loadInbox = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await apiRequest<InboxPayload>("/communications");
      const data = result.conversations ?? [];
      setConversations(data);
      setCurrentUserId(result.currentUserId ?? "");
      setCanStartNew(Boolean(result.canStartNew));
      setRecipientName(result.recipientName ?? "");
      setError("");
      setSelectedId((current) => current && data.some((conversation) => conversation.id === current) ? current : data[0]?.id ?? "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load your messages."); }
    finally { if (!silent) setLoading(false); }
  }, []);

  const loadThread = useCallback(async (id: string, silent = false) => {
    if (!id) return;
    if (!silent) setThreadLoading(true);
    try {
      const result = await apiRequest<ThreadPayload>(`/communications/${id}`);
      setMessages(result.messages ?? []);
      setThreadSubject(result.conversation?.subject ?? "");
      setOtherName(result.conversation?.otherName ?? "");
      setOtherRole(result.conversation?.otherRole ?? "");
      if (!silent) void loadInbox(true);
    } catch (caught) { if (!silent) setError(caught instanceof Error ? caught.message : "Unable to open this conversation."); }
    finally { if (!silent) setThreadLoading(false); }
  }, [loadInbox]);

  useEffect(() => { void loadInbox(); }, [loadInbox]);
  useEffect(() => { if (selectedId) void loadThread(selectedId); else setMessages([]); }, [selectedId, loadThread]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void loadInbox(true); }, 15000);
    return () => window.clearInterval(timer);
  }, [loadInbox]);

  async function sendNew(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSending(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ conversationId?: string }>("/communications", { method: "POST", body: JSON.stringify({ subject: subject.trim(), message: newMessage.trim() }) });
      setSubject(""); setNewMessage(""); setCompose(false); setNotice("Message sent.");
      await loadInbox(true);
      if (result.conversationId) setSelectedId(result.conversationId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to send this message."); }
    finally { setSending(false); }
  }
  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedId) return;
    setSending(true); setError(""); setNotice("");
    try {
      await apiRequest(`/communications/${selectedId}`, { method: "POST", body: JSON.stringify({ message: reply.trim() }) });
      setReply(""); await Promise.all([loadThread(selectedId, true), loadInbox(true)]); setNotice("Reply sent.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to send your reply."); }
    finally { setSending(false); }
  }

  const selected = conversations.find((conversation) => conversation.id === selectedId);
  const unread = conversations.reduce((count, conversation) => count + (conversation.unreadCount || 0), 0);
  return <>
    <PageHeader eyebrow="Communication" title="Messages" description="Private conversations with the people in your reporting line." action={<Button variant="secondary" leading={<Bell size={14} />} onClick={() => void loadInbox()} busy={loading}>{unread} unread</Button>} />
    {error ? <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{error}</div> : null}
    {notice ? <div className="info-callout" style={{ marginBottom: 12 }}><Check size={15} />{notice}</div> : null}
    <Panel style={{ overflow: "hidden" }}>
      <div className="message-layout">
        <aside className="message-inbox">
          <div className="message-inbox-heading"><div><strong>Inbox</strong><span>{conversations.length} conversations</span></div>{canStartNew ? <Button size="sm" variant="primary" leading={<Plus size={13} />} onClick={() => { setCompose(true); setSelectedId(""); }}>New</Button> : null}</div>
          {loading && !conversations.length ? <div className="loading-state"><LoaderCircle className="spin" size={17} /><p>Loading messages…</p></div> : conversations.length ? conversations.map((conversation) => <button type="button" className={`message-thread-link ${selectedId === conversation.id ? "message-thread-active" : ""}`} key={conversation.id} onClick={() => { setCompose(false); setSelectedId(conversation.id); setError(""); setNotice(""); }}><ProfilePhoto name={conversation.otherName} employeeId={conversation.otherEmployeeId} conversationId={conversation.id} className="user-avatar" /><span className="message-thread-copy"><strong>{conversation.subject}</strong><span>{conversation.otherName} · {humanize(conversation.otherRole)}</span><small>{conversation.lastMessage}</small></span>{conversation.unreadCount ? <span className="task-count">{conversation.unreadCount}</span> : null}</button>) : <div className="empty-state" style={{ padding: 24 }}><div className="state-icon"><Mail size={18} /></div><h3>No messages yet</h3><p>Your conversations will appear here.</p></div>}
          {canStartNew ? <p className="message-recipient-note"><ShieldCheck size={13} /> New conversations go to {recipientName || "your assigned higher-up"}. Recipient selection is controlled by the backend.</p> : <p className="message-recipient-note"><ShieldCheck size={13} /> New conversations are unavailable until an eligible reporting-line recipient is configured.</p>}
        </aside>
        <section className="message-conversation">
          {compose ? <form className="message-compose" onSubmit={sendNew}><div className="message-conversation-heading"><div><strong>New conversation</strong><span>To: {recipientName || "Your higher-up"}</span></div></div><label className="field"><span className="field-label">Subject</span><input className="text-input" required minLength={3} maxLength={160} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What would you like to discuss?" /></label><label className="field"><span className="field-label">Message</span><textarea className="text-input text-area" required maxLength={4000} rows={8} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Write your message…" /></label><div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Button type="button" variant="secondary" onClick={() => setCompose(false)}>Cancel</Button><Button type="submit" variant="primary" busy={sending} leading={<Send size={14} />}>Send message</Button></div></form> : selected ? <>
            <header className="message-conversation-heading"><ProfilePhoto name={otherName || selected.otherName} employeeId={selected.otherEmployeeId} conversationId={selected.id} className="user-avatar" /><div><strong>{threadSubject || selected.subject}</strong><span>{otherName || selected.otherName} · {humanize(otherRole || selected.otherRole)}</span></div></header>
            <div className="message-list">{threadLoading && !messages.length ? <div className="loading-state"><LoaderCircle className="spin" size={17} /><p>Loading conversation…</p></div> : messages.map((message) => <div className={`message-bubble-wrap ${message.senderUserId === currentUserId ? "message-mine" : ""}`} key={message.id}><div className="message-bubble"><div className="message-bubble-meta"><strong>{message.senderUserId === currentUserId ? "You" : message.senderName}</strong><span>{formatDate(message.createdAt)}</span></div><p>{message.body}</p>{message.senderUserId === currentUserId ? <small>{message.readAt ? <><CheckCheck size={12} /> Read</> : message.deliveredAt ? <><CheckCheck size={12} /> Delivered</> : <><Check size={12} /> Sent</>}</small> : null}</div></div>)}</div>
            <form className="message-reply" onSubmit={sendReply}><textarea className="text-input" rows={2} required maxLength={4000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" /><Button type="submit" variant="primary" busy={sending} leading={<Send size={14} />}>Send</Button></form>
          </> : <div className="empty-state" style={{ margin: "auto" }}><div className="state-icon"><MessageCircle size={18} /></div><h3>Select a conversation</h3><p>Choose a message on the left to read and reply.</p></div>}
        </section>
      </div>
    </Panel>
    <style jsx>{`
      .message-layout { min-height: 610px; display: grid; grid-template-columns: 320px minmax(0,1fr); }
      .message-inbox { min-width:0; border-right:1px solid var(--border); display:flex; flex-direction:column; }
      .message-inbox-heading { padding:16px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--border); }
      .message-inbox-heading strong,.message-conversation-heading strong { display:block; color:var(--text-strong); font-size:13px; }
      .message-inbox-heading span,.message-conversation-heading span { display:block; color:var(--muted); font-size:10px; margin-top:3px; }
      .message-thread-link { width:100%; border:0; border-bottom:1px solid var(--border); background:transparent; display:flex; align-items:flex-start; gap:10px; padding:14px 13px; text-align:left; }
      .message-thread-link:hover,.message-thread-active { background:var(--surface-muted); }
      .message-thread-copy { flex:1; min-width:0; }
      .message-thread-copy strong { display:block; color:var(--text-strong); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .message-thread-copy span { display:block; color:var(--muted); font-size:10px; margin-top:3px; }
      .message-thread-copy small { display:block; color:var(--subtle); font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:5px; }
      .message-recipient-note { display:flex; gap:7px; padding:13px; margin:auto 0 0; color:var(--muted); font-size:10px; line-height:1.5; border-top:1px solid var(--border); }
      .message-conversation { min-width:0; display:flex; flex-direction:column; }
      .message-conversation-heading { padding:15px 18px; display:flex; align-items:center; gap:10px; border-bottom:1px solid var(--border); }
      .message-conversation-heading > div { min-width:0; }
      .message-list { flex:1; min-height:360px; max-height:610px; overflow-y:auto; padding:18px; display:flex; flex-direction:column; gap:13px; }
      .message-bubble-wrap { display:flex; justify-content:flex-start; }
      .message-mine { justify-content:flex-end; }
      .message-bubble { max-width:min(80%,560px); border:1px solid var(--border); border-radius:12px 12px 12px 3px; padding:11px 13px; background:var(--surface-muted); }
      .message-mine .message-bubble { background:var(--accent-soft); border-color:color-mix(in srgb,var(--accent) 20%,var(--border)); border-radius:12px 12px 3px 12px; }
      .message-bubble-meta { display:flex; gap:12px; justify-content:space-between; color:var(--muted); font-size:9px; }
      .message-bubble-meta strong { color:var(--text-strong); font-size:10px; }
      .message-bubble p { color:var(--text); font-size:12px; line-height:1.65; white-space:pre-wrap; overflow-wrap:anywhere; margin:8px 0 0; }
      .message-bubble small { display:flex; align-items:center; justify-content:flex-end; gap:4px; color:var(--muted); font-size:9px; margin-top:7px; }
      .message-reply { display:flex; align-items:flex-end; gap:9px; padding:13px 16px; border-top:1px solid var(--border); }
      .message-reply textarea { min-height:42px; max-height:120px; resize:vertical; }
      .message-compose { padding:20px; display:grid; gap:15px; }
      @media(max-width:760px){ .message-layout{grid-template-columns:1fr;min-height:560px}.message-inbox{border-right:0;border-bottom:1px solid var(--border);max-height:260px;overflow:auto}.message-conversation{min-height:400px}.message-list{min-height:260px}.message-bubble{max-width:92%}.message-reply{flex-direction:column;align-items:stretch} }
    `}</style>
  </>;
}
