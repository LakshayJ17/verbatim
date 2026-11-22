import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { AnalysisView } from "./analysis-view";
import { pickAnalysis } from "@/utils/analysis/pick";
import { SourceHero } from "./source-hero";
import { selectBestQuotes, type VerificationStatus } from "@/utils/design/sharing";

// Server Actions used on this page (analyzeYouTubeSource) inherit this limit.
// Analysis can take a few minutes; the default platform timeout killed long
// runs and left them stuck on "processing".
export const maxDuration = 300;

export default async function SourceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { analyze } = await searchParams;
  const supabase = await createClient();
  
  // Fetch source details and existing analysis
  const { data: source, error } = await supabase
    .from("sources")
    .select(`
      *,
      analyses (
        *,
        quotes (*),
        insights (*)
      )
    `)
    .eq("id", id)
    .single();

  if (error || !source) {
    notFound();
  }

  const analysis = pickAnalysis(source.analyses);
  if (analysis) {
    // Stable order: quotes by time in the video, insights by importance.
    analysis.quotes = [...(analysis.quotes ?? [])].sort(
      (a: { start_seconds: number | null }, b: { start_seconds: number | null }) =>
        (a.start_seconds ?? Number.MAX_SAFE_INTEGER) - (b.start_seconds ?? Number.MAX_SAFE_INTEGER)
    );
    analysis.insights = [...(analysis.insights ?? [])].sort(
      (a: { importance_score: number | null }, b: { importance_score: number | null }) =>
        (b.importance_score ?? 0) - (a.importance_score ?? 0)
    );
  }

  // Counts for the header, only once the analysis has finished. Quotes are the
  // ones the gallery offers (quotes missing from the transcript are left out),
  // so the header and the gallery's Quotes tab agree.
  const finished = analysis && analysis.status !== "processing" && analysis.status !== "failed";
  const usableQuotes = finished
    ? selectBestQuotes((analysis.quotes as { id: string; text?: string; verification_status?: VerificationStatus }[]).filter((q) => q.text?.trim()))
    : [];
  const stats = finished
    ? {
        quotes: usableQuotes.length,
        verified: usableQuotes.filter((q) => q.verification_status === "verified").length,
        ideas: analysis.insights.length,
      }
    : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ label: "Library", href: "/library" }, { label: source.title }]} />
      <div className="mb-14 mt-4">
        <SourceHero
          title={source.title}
          creatorName={source.creator_name}
          durationSeconds={source.duration_seconds}
          createdAt={source.created_at}
          videoUrl={source.source_url}
          videoId={source.source_type === "youtube" ? source.external_id : null}
          stats={stats}
        />
      </div>

      <AnalysisView
        sourceId={source.id}
        sourceTitle={source.title}
        initialAnalysis={analysis}
        autoStart={analyze === "1"}
      />
    </div>
  );
}
