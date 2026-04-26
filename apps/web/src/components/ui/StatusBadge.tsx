const classes: Record<string, string> = {
  draft: "bg-surface-tertiary text-ink-secondary",
  active: "bg-success-bg text-success-fg",
  paused: "bg-warning-bg text-warning-fg",
  completed: "bg-info-bg text-info-fg",
  pending: "bg-surface-tertiary text-ink-secondary",
  queued: "bg-info-bg text-info-fg",
  sent: "bg-info-bg text-info-fg",
  opened: "bg-success-bg text-success-fg",
  clicked: "bg-success-bg text-success-fg",
  replied: "bg-success-bg text-success-fg",
  bounced: "bg-danger-bg text-danger-fg",
  failed: "bg-danger-bg text-danger-fg",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = classes[status] ?? "bg-surface-tertiary text-ink-secondary";
  return <span className={`badge ${cls}`}>{status}</span>;
}
