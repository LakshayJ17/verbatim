import { NormalizedSegment } from "@/utils/parsers";

export interface TranscriptProviderResult {
  segments: NormalizedSegment[];
  language?: string;
  isTranslated?: boolean;
}

export interface TranscriptProvider {
  getTranscript(videoUrl: string): Promise<TranscriptProviderResult>;
}

export class TranscriptProviderError extends Error {
  constructor(message: string, public readonly code: 'NOT_FOUND' | 'RATE_LIMIT' | 'UNSUPPORTED' | 'SERVER_ERROR' = 'SERVER_ERROR') {
    super(message);
    this.name = 'TranscriptProviderError';
  }
}
