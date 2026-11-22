import { Button } from "@/components/ui/button";

/** Plain GET search form for admin list pages. Works without JavaScript. */
export function AdminSearchForm({
  action,
  label,
  defaultValue,
}: {
  action: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <form action={action} method="get" role="search" className="mt-4 flex max-w-xl flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1">
        <label htmlFor="admin-search" className="text-base font-medium">
          {label}
        </label>
        <input
          id="admin-search"
          name="q"
          type="search"
          defaultValue={defaultValue}
          maxLength={100}
          autoComplete="off"
          className="mt-1 block h-10 w-full rounded-[var(--radius)] border border-border bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <Button type="submit" className="h-10">
        Search
      </Button>
    </form>
  );
}
