"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Flag } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { reportContent } from "@/app/actions/reports";
import {
  MAX_REPORT_DETAILS,
  REPORT_MESSAGES,
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  type ReportReason,
  type ReportTargetType,
} from "@/utils/moderation/reports";
import { cn } from "cn";

interface ReportControlProps {
  targetType: ReportTargetType;
  targetId: string;
  /** Visible trigger text, e.g. "Report post". */
  label: string;
  className?: string;
}

/**
 * "Report" trigger with an inline panel (no modal): reason radios, optional
 * details, Submit and Cancel. Focus moves into the panel when it opens and
 * back to the trigger when it closes.
 */
export function ReportControl({ targetType, targetId, label, className }: ReportControlProps) {
  const uid = useId();
  const panelId = `${uid}-panel`;
  const legendId = `${uid}-legend`;
  const detailsId = `${uid}-details`;
  const errorId = `${uid}-error`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [reason, setReason] = useState<ReportReason | "">("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openPanel() {
    setOpen(true);
    setError(null);
    // Wait for the panel to render, then focus the first reason.
    requestAnimationFrame(() => firstRadioRef.current?.focus());
  }

  function closePanel() {
    setOpen(false);
    setReason("");
    setDetails("");
    setError(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) {
      setError("Choose a reason.");
      return;
    }
    startTransition(async () => {
      const res = await reportContent(targetType, targetId, reason, details || undefined);
      if ("ok" in res) {
        toast(res.message);
        setReported(true);
        closePanel();
      } else if (res.error === REPORT_MESSAGES.duplicate) {
        toast(res.error);
        setReported(true);
        closePanel();
      } else {
        setError(res.error);
        toast(res.error);
      }
    });
  }

  return (
    <div className={cn("w-full", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={reported ? undefined : open ? closePanel : openPanel}
        aria-disabled={reported || undefined}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius)] px-2 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-default aria-disabled:opacity-60 aria-disabled:hover:bg-transparent"
      >
        <Flag className="size-4" aria-hidden="true" />
        {reported ? "Reported" : label}
      </button>

      {open && (
        <form
          id={panelId}
          onSubmit={onSubmit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              closePanel();
            }
          }}
          className="mt-2 rounded-[var(--radius)] border border-border bg-card p-4 text-foreground"
        >
          <fieldset aria-describedby={error ? errorId : undefined}>
            <legend id={legendId} className="text-base font-semibold text-foreground">
              Why are you reporting this?
            </legend>
            <div className="mt-3 space-y-1">
              {REPORT_REASONS.map((value, i) => {
                const id = `${uid}-reason-${value}`;
                return (
                  <div key={value} className="flex min-h-10 items-center gap-3">
                    <input
                      ref={i === 0 ? firstRadioRef : undefined}
                      id={id}
                      type="radio"
                      name={`${uid}-reason`}
                      value={value}
                      checked={reason === value}
                      onChange={() => {
                        setReason(value);
                        setError(null);
                      }}
                      className="size-4 accent-primary"
                    />
                    <label htmlFor={id} className="text-base text-foreground">
                      {REPORT_REASON_LABELS[value]}
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-4">
            <label htmlFor={detailsId} className="text-base font-medium text-foreground">
              Details <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id={detailsId}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={MAX_REPORT_DETAILS}
              rows={3}
              aria-describedby={`${detailsId}-count`}
              className="mt-2 block w-full rounded-[var(--radius)] border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p id={`${detailsId}-count`} className="mt-1 text-sm text-muted-foreground">
              {details.length} of {MAX_REPORT_DETAILS} characters
            </p>
          </div>

          <p id={errorId} role="alert" className="mt-3 min-h-0 text-sm text-destructive empty:hidden">
            {error ?? ""}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" disabled={pending} className="h-10">
              {pending ? "Sending" : "Submit report"}
            </Button>
            <Button type="button" variant="outline" onClick={closePanel} disabled={pending} className="h-10">
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
