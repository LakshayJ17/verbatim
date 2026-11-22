"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

type AdminResult = { ok: true } | { error: string };

interface AdminActionButtonProps {
  /** A server action already bound to its arguments. */
  action: () => Promise<AdminResult>;
  label: string;
  /** Message announced on success. */
  successMessage: string;
  /**
   * When set, the first click only arms the button and shows this label
   * (e.g. "Confirm delete"); a second click runs the action. Use for
   * destructive actions.
   */
  confirmLabel?: string;
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost";
}

/**
 * Button for admin server actions with an optional two-step confirmation and
 * an aria-live result message. No window.confirm.
 */
export function AdminActionButton({
  action,
  label,
  successMessage,
  confirmLabel,
  variant = "outline",
}: AdminActionButtonProps) {
  const statusId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function run() {
    setMessage("");
    startTransition(async () => {
      const res = await action();
      const text = "ok" in res ? successMessage : res.error;
      setMessage(text);
      toast(text);
      setArmed(false);
    });
  }

  function onClick() {
    if (confirmLabel && !armed) {
      setArmed(true);
      return;
    }
    run();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        ref={buttonRef}
        type="button"
        variant={armed ? "destructive" : variant}
        onClick={onClick}
        disabled={pending}
        aria-describedby={statusId}
        className="h-10"
      >
        {pending ? "Working" : armed ? confirmLabel : label}
      </Button>
      {armed && !pending && (
        <Button
          type="button"
          variant="ghost"
          className="h-10"
          onClick={() => {
            setArmed(false);
            buttonRef.current?.focus();
          }}
        >
          Cancel
        </Button>
      )}
      <span id={statusId} role="status" aria-live="polite" className="text-sm text-muted-foreground empty:hidden">
        {message}
      </span>
    </span>
  );
}
