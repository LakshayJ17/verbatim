"use client";

import { useState, useSyncExternalStore } from "react";
import { ingestYouTubeVideo } from "@/app/actions/ingestion";
import { preflightSource, PreflightResult } from "@/app/actions/preflight";
import { Button } from "@/components/ui/button";
import { Link as LinkIcon, WarningCircle as AlertCircle, CheckCircle as CheckCircle2, CircleNotch as Loader2 } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PENDING_URL_KEY } from "@/components/landing/start-dialog";

export function NewQuoteImagesForm() {
  const router = useRouter();
  // A link typed into the landing page dialog before sign-up waits in
  // localStorage. It fills the field until the user types their own.
  const pendingUrl = useSyncExternalStore(subscribeNothing, readPendingUrl, () => "");
  const [typedUrl, setUrlInput] = useState<string | null>(null);
  const urlInput = typedUrl ?? pendingUrl;
  
  // States for YouTube Flow
  const [ingestState, setIngestState] = useState<"idle" | "checking" | "recognized" | "fetching" | "preparing" | "analyzing" | "completed" | "error">("idle");
  const [preflightData, setPreflightData] = useState<PreflightResult | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);


  const resetState = () => {
    setIngestState("idle");
    setPreflightData(null);
    setIngestError(null);
    setUrlInput("");
  };

  const handleAnalyzeYouTube = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput) return;
    clearPendingUrl();
    
    // STEP 1: Checking source
    setIngestState("checking");
    setPreflightData(null);
    setIngestError(null);
    
    let result: PreflightResult;
    try {
      result = await preflightSource(urlInput);
    } catch (err) {
      console.error(err);
      setIngestError("We couldn't reach Verbatim. Check your connection and try again.");
      setIngestState("error");
      return;
    }
    setPreflightData(result);
    
    if (!result.isValid) {
      setIngestState("error");
      return;
    }

    // STEP 2: Source recognized
    setIngestState("recognized");

    if (result.nextAction === 'view_existing' && result.existingSourceId) {
      // It's a duplicate, go straight to it
      router.push(`/library/${result.existingSourceId}`);
      return;
    }

    // STEP 3: Finding transcript
    setIngestState("fetching");
    // The server re-checks the link itself; only the URL is sent.
    let ingestRes: Awaited<ReturnType<typeof ingestYouTubeVideo>>;
    try {
      ingestRes = await ingestYouTubeVideo(urlInput);
    } catch (err) {
      console.error(err);
      setPreflightData(null);
      setIngestError("We lost the connection while adding this video. Check your library, or try again.");
      setIngestState("error");
      return;
    }

    if (!ingestRes.success || !ingestRes.sourceId) {
      setIngestError(ingestRes.error || "Failed to process the source.");
      setIngestState("error");
      return;
    }

    // STEP 4: Hand over to the source page, which starts the analysis
    // itself (?analyze=1) and shows its progress.
    setIngestState("analyzing");
    router.push(`/library/${ingestRes.sourceId}?analyze=1`);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="heading-display text-3xl text-foreground sm:text-4xl">
          Make quote images
        </h1>
        <p className="mt-3 text-lg text-foreground">
          Paste a YouTube link to a podcast, interview or lecture up to two hours long. Verbatim finds the best
          quotes and lays each one out in several designs for you to download or share.
        </p>
      </div>

      {/* YOUTUBE URL FLOW */}
      {ingestState === "idle" && (
        <form onSubmit={handleAnalyzeYouTube} className="space-y-4">
          <div>
            <label htmlFor="url" className="mb-2 block text-base font-medium">
              YouTube link
            </label>
            <div className="relative">
              <LinkIcon className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                type="url"
                id="url"
                name="url"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                className="h-14 w-full rounded-md border border-input bg-background pl-12 pr-3 text-lg outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
                required
              />
            </div>
          </div>
          <Button type="submit" disabled={!urlInput} size="lg" className="w-full">
            Find the best quotes
          </Button>
        </form>
      )}

      {/* ONE CLICK PROGRESS & STATES */}
      {ingestState !== "idle" && (
        <div className="space-y-6">
          {ingestState === "error" && preflightData && !preflightData.isValid ? (
            <div className="rounded-md bg-destructive/10 p-6">
              <div className="flex items-start gap-3 text-destructive mb-6">
                <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <div>
                  <h3 className="mb-1 text-lg font-semibold">This video cannot be analyzed</h3>
                  <p className="text-base">{preflightData.errorMessage}</p>
                </div>
              </div>
              
              <div className="flex gap-3 flex-wrap">
                {preflightData.nextAction === 'try_another' && (
                  <Button onClick={resetState}>Try another video</Button>
                )}
                {preflightData.nextAction === 'explore_discover' && (
                  <>
                    <Button onClick={resetState} variant="outline">Try another video</Button>
                    <Link href="/discover">
                      <Button>Go to Commonplace</Button>
                    </Link>
                  </>
                )}
                {preflightData.nextAction === 'view_existing' && preflightData.existingSourceId && (
                  <>
                    <Button onClick={resetState} variant="outline">Try another video</Button>
                    <Link href={`/library/${preflightData.existingSourceId}`}>
                      <Button>Open in library</Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          ) : ingestState === "error" ? (
             <div className="rounded-md bg-destructive/10 p-6">
              <div className="flex items-start gap-3 text-destructive mb-6">
                <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <div>
                  <h3 className="mb-1 text-lg font-semibold">Something went wrong with this video</h3>
                  <p className="text-base">{ingestError}</p>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                {ingestError?.includes("Create an account") ? (
                  <>
                    <Link href="/signup">
                      <Button>Create account</Button>
                    </Link>
                    <Link href="/login">
                      <Button variant="outline">Sign in</Button>
                    </Link>
                  </>
                ) : (
                  <>
                    <Button onClick={resetState} variant="outline">Try another video</Button>
                    <Link href="/discover">
                      <Button>Go to Commonplace</Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div role="status" className="rounded-md bg-muted p-6">
              {/* Progress Steps */}
              <div className="space-y-4">
                <ProgressStep 
                  label="Checking source" 
                  isActive={ingestState === "checking"} 
                  isComplete={["recognized", "fetching", "preparing", "analyzing", "completed"].includes(ingestState)} 
                />
                <ProgressStep 
                  label="Source recognized" 
                  isActive={ingestState === "recognized"} 
                  isComplete={["fetching", "preparing", "analyzing", "completed"].includes(ingestState)} 
                />
                
                {/* Metadata shown once recognized */}
                {["recognized", "fetching", "preparing", "analyzing", "completed"].includes(ingestState) && preflightData && (
                  <div className="ml-8 space-y-1 rounded-md bg-background p-4 text-base text-muted-foreground animate-in fade-in slide-in-from-top-2">
                    {preflightData.title && <div className="font-medium text-foreground">{preflightData.title}</div>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {preflightData.creatorName && <div><span>Creator:</span> {preflightData.creatorName}</div>}
                      {preflightData.durationSeconds != null && (
                        <div>
                          <span>Duration:</span>{" "}
                          {formatDuration(preflightData.durationSeconds)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                <ProgressStep 
                  label="Finding transcript" 
                  isActive={ingestState === "fetching"} 
                  isComplete={["preparing", "analyzing", "completed"].includes(ingestState)} 
                />
                <ProgressStep 
                  label="Preparing analysis" 
                  isActive={ingestState === "preparing"} 
                  isComplete={["analyzing", "completed"].includes(ingestState)} 
                />
                <ProgressStep 
                  label="Analyzing" 
                  isActive={ingestState === "analyzing"} 
                  isComplete={ingestState === "completed"} 
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function subscribeNothing() {
  return () => {};
}

function readPendingUrl(): string {
  try {
    return localStorage.getItem(PENDING_URL_KEY) ?? "";
  } catch {
    return "";
  }
}

function clearPendingUrl() {
  try {
    localStorage.removeItem(PENDING_URL_KEY);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function ProgressStep({ label, isActive, isComplete }: { label: string, isActive: boolean, isComplete: boolean }) {
  return (
    <div className="flex items-center gap-3 text-lg">
      {isComplete ? (
        <CheckCircle2 className="size-5 text-foreground" aria-hidden="true" />
      ) : isActive ? (
        <Loader2 className="size-5 animate-spin text-foreground" aria-hidden="true" />
      ) : (
        <div className="size-5 rounded-sm border-2 border-input" aria-hidden="true" />
      )}
      <span className={cn("font-medium", isComplete || isActive ? "text-foreground" : "text-muted-foreground")}>
        {label}
      </span>
    </div>
  );
}
