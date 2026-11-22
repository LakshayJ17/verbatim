"use client";

import { toast } from "@/components/ui/toast";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteAccount } from "@/app/actions/settings";
import { CircleNotch as Loader2 } from "@phosphor-icons/react/dist/ssr";

export function SettingsClient({ isGuest }: { isGuest: boolean }) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("Delete your account? This cannot be undone.")) return;
    
    setIsDeleting(true);
    const res = await deleteAccount();
    if (res?.error) {
      toast(res.error);
      setIsDeleting(false);
    }
    // Success will redirect
  };

  if (isGuest) {
    return <p className="text-base text-foreground">Guest accounts cannot be deleted here. Log out instead.</p>;
  }

  return (
    <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
      {isDeleting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {isDeleting ? "Deleting account" : "Delete account"}
    </Button>
  );
}
