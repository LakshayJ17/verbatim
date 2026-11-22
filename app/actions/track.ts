"use server";

import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { consumeAnonymousLimit } from "@/utils/rate-limit";
import { track } from "@/utils/analytics/track";

/**
 * Records value moments that only happen in the browser (downloading or
 * sharing an image). Deliberately narrow: an allowlist of events, a fixed
 * property shape, signed-in users only, and a per-user rate limit, so it
 * can't be used to flood or forge the analytics tables.
 */
const clientEventSchema = z.object({
  event: z.enum(["image_downloaded", "image_shared", "caption_copied"]),
  props: z
    .object({
      kind: z.enum(["quote", "insight"]).optional(),
      style: z.string().max(40).regex(/^[\w-]*$/).optional(),
      format: z.string().max(40).regex(/^[\w-]*$/).optional(),
      surface: z.enum(["gallery", "creator"]).optional(),
      item_id: z.uuid().optional(),
    })
    .strict()
    .default({}),
});

export async function trackClientEvent(event: string, props?: Record<string, unknown>): Promise<void> {
  const parsed = clientEventSchema.safeParse({ event, props: props ?? {} });
  if (!parsed.success) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return;
  if (!consumeAnonymousLimit(`track:${user.id}`, 60, 60_000)) return;

  track(user.id, parsed.data.event, parsed.data.props);
}
