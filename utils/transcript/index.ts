import { TranscriptProvider } from "./provider";
import { SupadataTranscriptProvider } from "./supadata";

export function getTranscriptProvider(): TranscriptProvider {
  const providerType = process.env.YOUTUBE_TRANSCRIPT_PROVIDER || "supadata";

  switch (providerType) {
    case "supadata":
      return new SupadataTranscriptProvider();
    default:
      throw new Error(`Unsupported transcript provider: ${providerType}`);
  }
}

export * from "./provider";
