import { createClient } from "@/utils/supabase/server";
import { SettingsClient } from "./client";

export const metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-10">
        <h1 className="heading-display text-3xl">Settings</h1>
        <p className="mt-2 text-base text-muted-foreground">Manage your account.</p>
      </div>

      <div className="max-w-2xl space-y-8">
        <section aria-labelledby="delete-account-heading" className="rounded-xl border border-border bg-card p-5">
          <h2 id="delete-account-heading" className="text-xl font-semibold text-foreground">
            Delete account
          </h2>
          <p className="mt-2 mb-6 text-base text-foreground">
            This permanently deletes your account and everything saved in it. It cannot be undone.
          </p>
          <SettingsClient isGuest={!!(!user || user.is_anonymous)} />
        </section>
      </div>
    </div>
  );
}
