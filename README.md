# Verbatim

Turn long YouTube conversations into quote images you can trust.

**Live:** [verbatim.bylakshayjain.online](https://verbatim.bylakshayjain.online)

Paste a link to a podcast, interview or lecture. Verbatim reads the transcript, picks the strongest quotes and ideas, checks each quote word for word against what was actually said, and lays it out in ready-to-post designs.

## Why

AI summaries of videos often paraphrase or invent quotes. Verbatim doesn't take the model's word for it: every quote is matched against the transcript, and only exact matches can be published.

## Features

- **Quotes and insights** from YouTube videos up to two hours long
- **Transcript check:** each quote is marked verified, needs review, rejected or not checked
- **Design studio:** seven sizes, from square posts to channel banners, and five styles. Download, share or post.
- **Video overview** with a summary, topics and key insights
- **Commonplace:** a public feed with likes, comments, bookmarks, follows, profiles and collections
- **Sign in** with email or Google, or browse as a guest

## How it works

1. Paste a YouTube link. Verbatim checks the video is public and under two hours.
2. It fetches the transcript.
3. Gemini picks the strongest quotes and insights.
4. Each quote is matched against the transcript and labelled.
5. Pick a quote and a design, then download, share or publish it.

## Built with

- [Next.js](https://nextjs.org) 16 (App Router, Server Actions) on React 19, with TypeScript
- [Supabase](https://supabase.com) for the database, sign-in and file storage
- [Google Gemini](https://ai.google.dev) for analysis
- [Supadata](https://supadata.ai) for transcripts and the YouTube Data API for video details
- Tailwind CSS 4, Base UI and GSAP for the interface

## Running locally

You need Node.js 20+, a Supabase project, and API keys for Gemini, Supadata and the YouTube Data API.

```bash
npm install
cp .env.example .env.local   # fill in the keys; each one is described in the file
```

Run the SQL files in `supabase/migrations/` in order in the Supabase SQL Editor, then start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Run `npm test` for the unit tests.

## Project structure

```
app/                  pages, layouts and server actions
components/           UI components
utils/                AI, transcripts, verification and design logic
supabase/migrations/  database schema, security policies and functions
```
