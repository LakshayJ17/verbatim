import type { Metadata } from "next";
import { NewQuoteImagesForm } from "./new-form";

export const metadata: Metadata = {
  title: "Make quote images",
};

// Server Actions used on this page inherit this limit. Adding a video fetches
// its transcript, which for long videos is an async job that can take over a
// minute; the default platform timeout cut that off mid-way.
export const maxDuration = 300;

export default function NewQuoteImagesPage() {
  return <NewQuoteImagesForm />;
}
