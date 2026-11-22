# Verbatim

Verbatim turns long-form YouTube conversations into shareable quote images. Paste a link to a podcast, interview or lecture, and Verbatim finds the strongest quotes and ideas. It checks each quote against the transcript and lays it out in ready-to-post designs.

## Features

- **Quote and insight extraction** from YouTube videos up to two hours long
- **Transcript verification:** every quote is marked verified, needs review, rejected or not checked
- **Quote image studio** on every video page: pick a quote, one of seven sizes (from square posts to channel banners) and one of five styles, then download, share or post it
- **Video overview** with the thumbnail, quote and verification counts, a summary, topics and key insights
- **Commonplace**, a public feed with likes, comments, bookmarks, follows, profiles and collections
- **Accounts** with email, Google sign-in and guest browsing
- **Admin area** for moderation, users, feedback, audit log, usage and costs

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router, Server Actions), React 19, TypeScript
- [Supabase](https://supabase.com): Postgres with Row Level Security, Auth, Storage
- [Google Gemini](https://ai.google.dev) for analysis
- [Supadata](https://supadata.ai) for transcripts, YouTube Data API v3 for video details
- Tailwind CSS 4, Base UI, Zod, Vitest

## Getting started

Requirements: Node.js 20+, a Supabase project, and API keys for Gemini, Supadata and the YouTube Data API.

```bash
npm install
cp .env.example .env.local
```

1. Fill in `.env.local`. Every variable is described in `.env.example`.
2. Run the SQL files in `supabase/migrations/` in order, in the Supabase SQL Editor.
3. Check that the AI key works:

   ```bash
   node --env-file=.env.local scripts/check-ai.mjs
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

   Then open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Serve the production build |
| `npm test` | Run unit tests |
| `npm run typecheck` | Type-check the project |
| `npm run lint` | Lint the project |

## Admin access

Admins are accounts whose Supabase `app_metadata` has `role = admin`. Users cannot set this themselves. Run this in the Supabase SQL Editor, then sign out and back in:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'
where email = 'you@example.com';
```

The admin area is at `/admin`.

## Deployment

Verbatim runs on [Vercel](https://vercel.com) with no extra configuration. Video analysis can take up to five minutes, which fits Vercel's function limit.

1. Push the repository to GitHub and import it into Vercel.
2. In **Settings → Environment Variables**, add the variables from `.env.local`. Set `NEXT_PUBLIC_SITE_URL` to the live address, for example `https://verbatim.example.com`.
3. Set `AI_DAILY_BUDGET_USD` and `AI_USER_DAILY_BUDGET_USD` before opening sign-ups, so AI spending has a hard daily cap.
4. In Supabase, under **Authentication → URL Configuration**, set **Site URL** to the live address and add `https://<your-domain>/auth/callback` to **Redirect URLs**.
5. Deploy. Every push to the main branch deploys again.

Variables that start with `NEXT_PUBLIC_` are built into the app, so redeploy after changing one.

## Project structure

```
app/                  routes, layouts and server actions
components/           UI components
utils/                AI, transcripts, analytics, auth and design logic
supabase/migrations/  database schema, policies and functions
supabase/tests/       row level security tests
scripts/              maintenance scripts
DESIGN.md             colours, type and layout rules for the UI
```
