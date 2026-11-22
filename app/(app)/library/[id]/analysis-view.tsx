/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { analyzeYouTubeSource } from "@/app/actions/analysis";
import { Button } from "@/components/ui/button";
import { InsightCard } from "@/components/insight-card";
import { QuoteGallery } from "@/components/quote-gallery";
import { CircleNotch as Loader2, WarningCircle as AlertCircle } from "@phosphor-icons/react/dist/ssr";

function SectionTitle({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h2 className="heading-display mb-6 flex items-baseline gap-3 text-3xl">
      {children}
      {count != null && <span className="font-sans text-base font-normal tabular-nums text-muted-foreground">{count}</span>}
    </h2>
  );
}

interface AnalysisViewProps {
  sourceId: string;
  sourceTitle: string;
  initialAnalysis?: any;
  /** Start the analysis on arrival (set by the "Make quote images" flow). */
  autoStart?: boolean;
}

export function AnalysisView({ sourceId, sourceTitle, initialAnalysis, autoStart = false }: AnalysisViewProps) {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A run left on "processing" for over 10 minutes crashed or timed out;
  // show the retry state instead of waiting forever.
  const [isStale] = useState(
    () =>
      initialAnalysis?.status === "processing" &&
      Date.now() - new Date(initialAnalysis.updated_at ?? initialAnalysis.created_at).getTime() > 10 * 60 * 1000
  );

  // While another tab (or an earlier visit) is running the analysis, refresh
  // the page data every few seconds instead of asking the user to reload.
  const isProcessing = initialAnalysis?.status === "processing" && !isStale;
  useEffect(() => {
    if (!isProcessing) return;
    const timer = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(timer);
  }, [isProcessing, router]);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    // Drop ?analyze=1 so a reload doesn't start (and pay for) another run.
    router.replace(`/library/${sourceId}`, { scroll: false });
    if (!initialAnalysis) void handleAnalyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  async function handleAnalyze() {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const res = await analyzeYouTubeSource(sourceId);
      if ("error" in res) {
        setError(res.error);
      }
      // Pull the saved quotes (or the failed state) into the page.
      router.refresh();
    } catch (e) {
      // The request itself failed (network drop, platform timeout). The run
      // may still finish on the server, so refresh to pick up its state.
      console.error(e);
      setError("We lost the connection while analyzing. Refresh in a minute to see if it finished, or try again.");
      router.refresh();
    } finally {
      setIsAnalyzing(false);
    }
  }

  if (!initialAnalysis || initialAnalysis.status === "failed" || isStale) {
    return (
      <div className="bg-muted p-8 sm:p-10">
        <h2 className="text-2xl font-semibold">
          {initialAnalysis?.status === "failed" || isStale ? "The last analysis did not finish" : "Not analyzed yet"}
        </h2>
        <p className="mt-3 max-w-[52ch] text-base">
          Verbatim will watch this video, pick the best quotes and lay each one out in several designs. Quotes are
          checked against the transcript when YouTube has one.
        </p>
        {error && (
          <div role="alert" className="mt-5 flex items-start gap-2 text-base text-destructive">
            <AlertCircle className="mt-1 size-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}
        <Button onClick={handleAnalyze} disabled={isAnalyzing} size="lg" className="mt-6 gap-2">
          {isAnalyzing && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {isAnalyzing ? "Finding the best quotes, this can take a minute…" : "Find the best quotes"}
        </Button>
      </div>
    );
  }

  if (initialAnalysis.status === "processing") {
    return (
      <div role="status" className="bg-muted p-8 sm:p-10">
        <div className="flex items-center gap-3">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <h2 className="text-2xl font-semibold">Analysis in progress</h2>
        </div>
        <p className="mt-3 text-base">
          Verbatim is reading this conversation. This page updates by itself when your quote images are ready.
        </p>
      </div>
    );
  }

  const quotes: any[] = initialAnalysis.quotes ?? [];
  const insights: any[] = initialAnalysis.insights ?? [];
  const topics: string[] = initialAnalysis.topics ?? [];

  return (
    <div className="space-y-20">
      <QuoteGallery quotes={quotes} insights={insights} sourceTitle={sourceTitle} />

      {(initialAnalysis.summary || topics.length > 0) && (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
          {initialAnalysis.summary && (
            <section>
              <SectionTitle>What it&rsquo;s about</SectionTitle>
              <p className="max-w-[62ch] text-xl leading-relaxed text-foreground">{initialAnalysis.summary}</p>
            </section>
          )}
          {topics.length > 0 && (
            <section>
              <SectionTitle>Topics</SectionTitle>
              <ul className="flex flex-wrap gap-2">
                {topics.map((topic) => (
                  <li key={topic} className="rounded-[var(--radius)] bg-muted px-3 py-1.5 text-base font-medium text-ink">
                    {topic}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {insights.length > 0 && (
        <section>
          <SectionTitle count={insights.length}>Key insights</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {insights.map((insight) => (
              <InsightCard
                key={insight.id}
                id={insight.id}
                title={insight.title}
                summary={insight.summary}
                category={insight.category || "General"}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
