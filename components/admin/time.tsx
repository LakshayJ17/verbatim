const formatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

/** A timestamp rendered on the server in UTC, with a machine-readable datetime. */
export function AdminTime({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-muted-foreground">Never</span>;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return <span className="text-muted-foreground">Unknown</span>;
  return <time dateTime={d.toISOString()}>{formatter.format(d)} UTC</time>;
}
