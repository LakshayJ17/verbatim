import { createClient } from "@/utils/supabase/server";
import { notFound, redirect } from "next/navigation";
import { CreatorClient } from "./client";
import { parseFormatParam, parseStyleParam, publicPostBlockReason, isUuid, type VerificationStatus } from "@/utils/design/sharing";

interface PageProps {
  params: Promise<{
    type: "quote" | "insight";
    id: string;
  }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CreatorPage({ params, searchParams }: PageProps) {
  const { type, id } = await params;
  const query = await searchParams;
  // Only known style and size ids are honoured; anything else falls back to the defaults.
  const initialStyle = parseStyleParam(query.style) ?? undefined;
  const initialFormat = parseFormatParam(query.format) ?? undefined;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  let contentData = null;
  let publishBlockedReason: string | null = null;

  if (type === "quote") {
    const { data: quote } = await supabase
      .from("quotes")
      .select("*, analyses(sources(title, creator_name))")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!quote) notFound();
    
    // Enforcement: Only verified quotes can be created
    if (quote.verification_status === "rejected") {
      // Return custom error or redirect
      redirect("/library");
    }
    publishBlockedReason = publicPostBlockReason(quote.verification_status as VerificationStatus);

    contentData = {
      type: "quote" as const,
      text: quote.text,
      speakerName: quote.speaker_name || quote.analyses?.sources?.creator_name,
      sourceTitle: quote.analyses?.sources?.title || "Unknown Source",
      id: quote.id
    };
  } else if (type === "insight") {
    const { data: insight } = await supabase
      .from("insights")
      .select("*, analyses(sources(title, creator_name))")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!insight) notFound();

    contentData = {
      type: "insight" as const,
      text: insight.summary,
      speakerName: undefined, // Insights don't have a literal speaker
      sourceTitle: insight.analyses?.sources?.title || "Unknown Source",
      id: insight.id
    };
  } else {
    notFound();
  }

  return (
    <CreatorClient
      initialContent={contentData}
      initialStyle={initialStyle}
      initialFormat={initialFormat}
      publishBlockedReason={publishBlockedReason}
    />
  );
}
