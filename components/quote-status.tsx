import { Check, WarningCircle as CircleAlert, X, Minus } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

export type QuoteVerificationStatus = "verified" | "needs_review" | "rejected" | "source_derived";

const STATUS = {
  verified: {
    label: "Verified",
    title: "Found word for word in the transcript.",
    icon: Check,
    className: "bg-ink text-paper",
  },
  needs_review: {
    label: "Needs review",
    title: "Most of the words match the transcript. Check it against the source before sharing.",
    icon: CircleAlert,
    className: "bg-mark text-ink",
  },
  rejected: {
    label: "Not in transcript",
    title: "These words could not be found in the transcript.",
    icon: X,
    className: "bg-muted text-destructive",
  },
  source_derived: {
    label: "Not checked",
    title: "No transcript was available, so this quote could not be matched word for word.",
    icon: Minus,
    className: "bg-muted text-muted-foreground",
  },
} as const;

export function QuoteStatus({
  status,
  timestamp,
  className,
}: {
  status: QuoteVerificationStatus;
  timestamp?: string;
  className?: string;
}) {
  const s = STATUS[status] ?? STATUS.source_derived;
  const Icon = s.icon;
  return (
    <span
      title={s.title}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-sm font-medium leading-none tabular-nums whitespace-nowrap",
        s.className,
        className
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {s.label}
      {timestamp && <span className="font-normal">at {timestamp}</span>}
    </span>
  );
}
