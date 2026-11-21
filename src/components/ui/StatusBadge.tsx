import { humanize } from "@/lib/format";

export function StatusBadge({ value, label }: { value?: unknown; label?: string }) {
  const status = typeof value === "string" ? value.toUpperCase() : "UNKNOWN";
  const tone = /ACTIVE|APPROVED|PAID|COMPLETED|ACCEPTED|DELIVERED|READ/.test(status)
    ? "success"
    : /PENDING|INACTIVE|UNPAID|OPEN|AWAITING|SUBMITTED|REVIEW/.test(status)
      ? "warning"
      : /REJECTED|FAILED|FORMER|EXPIRED|REVOKED|CANCELLED/.test(status)
        ? "danger"
        : "neutral";
  return <span className={`status-badge status-${tone}`}><span className="status-dot" />{label ?? humanize(value)}</span>;
}
