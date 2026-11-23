# Verbatim Design System

Source of truth for tokens is `app/globals.css`; this file explains how to use them.

## 1. Visual Theme & Atmosphere

Verbatim pulls exact quotes out of long conversations and checks each one against the transcript. The look is a printed transcript with a highlighter: neutral paper, a green-black bottle ink for every word, shape and button, and a real highlighter yellow as the one accent. A slab serif for headings, a clean sans for reading. Flat surfaces, square-ish corners, no ornament. Confidence comes from large type and real product content, not decoration.

- Landing page: paper ground, ink type, solid ink bands for the product stage, the live check and the closing section.
- App screens: paper page, ink type, solid ink for primary buttons, the Verified label and the video header; highlighter yellow (`mark`) behind the chosen quote, the header's one action and Needs review.

## 2. Color Palette & Roles

| Token | Value | Role |
| --- | --- | --- |
| `--ink` / `foreground` / `primary` | `#0d2a1c` | All text, primary buttons, solid bands, Verified label |
| `--ink-hover` | `#1d4231` | Hover on solid ink |
| `--ink-soft` / `muted-foreground` | `#5f6b64` | Secondary metadata only, never running text |
| `--paper` / `background` | `#f7f7f7` | Page; text colour on solid ink |
| `card` | `#ffffff` | Product fragments and dialogs on paper or ink |
| `muted` / `surface` | `#ebebeb` | Surfaces, cards, rows (a tone step, never a border) |
| `surface-hover` | `#e1e1e1` | Hover on surface rows |
| `--mark` | `#f6e016` | Highlighter yellow: chosen quote, header action, Needs review label, avatar, notices |
| `border` | `#dcdcdc` | Lines inside product fragments only |
| `input` | `#7a837e` | Form field borders (3:1 on paper) |
| `destructive` | `#b42318` | Errors, delete, liked heart |

Rules:
- One ink, one accent. Ink and its neutrals do everything; yellow is the only colour. No second accent, no purple, no gradients.
- Yellow only ever sits behind ink text. Never yellow text on paper, never a thin yellow line or icon on paper (it disappears).
- Keep yellow rare: about one yellow thing per screen region. Chips, tags and category labels are neutral.
- Text on solid ink is `text-paper` (`text-paper/75` for metadata). Text on `mark` or `surface` is `text-ink`.
- Running text is full ink. `ink-soft` is for metadata.
- All colours are tokens in `app/globals.css`. Never hardcode hex in components.

## 3. Typography Rules

Two families: **Zilla Slab** (600) for headings, display type and the wordmark (`font-display`, `heading-display`, `t-head`, `t-display`), and **Geist** for reading and interface text (`font-sans`, the default). Both load with `next/font/google`.

App scale (Tailwind steps are enlarged in `globals.css`; nothing renders below 14px):

| Class | Size | Use |
| --- | --- | --- |
| `heading-display text-3xl/4xl` | 34/44px, 600, -0.025em | Page titles |
| `text-2xl font-semibold` | 26px | Section headings |
| `text-lg` / `text-xl` | 20/22px | Card titles, quotes |
| `text-base` | 18px | Running text, descriptions |
| `text-sm` | 16px | Metadata, buttons, labels |
| `text-xs` | 14px | Rare; truly secondary only |

Landing scale (`.landing`): `t-small`, `t-body`, `t-lead`, `t-head`, `t-display`. Five sizes, nothing in between.

Principles: sentence case everywhere. No uppercase letter-spaced labels. No monospace (use `tabular-nums` for timestamps). Headlines two lines or fewer. No styled accent word inside a headline.

## 4. Component Stylings

**Buttons** (`components/ui/button.tsx`): radius 4px, never pill. Primary = ink fill, paper text. Outline = 1px input border. Press = `scale(0.98)`. Sizes: default h-9, lg h-12. Labels name the action ("Analyze a video", "Make a quote card"), never "Get started".

**Quote status** (`components/quote-status.tsx`), the signature component:
- Verified: solid ink fill, paper text, check icon.
- Needs review: highlighter yellow (`mark`) fill, ink text.
- Not in transcript: muted fill, red text.
- Not checked: muted fill, grey text.

**Cards and rows**: `bg-muted p-5`, no border, no shadow. Hover = background step to `#e2e6e9`.

**Inputs**: h-11, 1px `border-input`, white fill, focus ring 1px ink. Every field has a visible `<label>`.

**Tabs and segmented controls**: muted track, active segment white. Use `role="tablist"`/`radiogroup`.

**Navigation**: sidebar on `bg-sidebar` (muted). Active item = paper fill with a 4px ink bar on the left, `aria-current="page"`.

**Avatars**: the only place `rounded-full` is allowed (or rounded-md squircle).

## 5. Layout Principles

- Containers: `max-w-6xl` for lists and dashboards, `max-w-4xl` for reading pages, `max-w-2xl` for forms. Gutters `px-4 sm:px-6`.
- Page header: title, one sentence, then `mb-10` to `mb-12`.
- Separate with space or a tone step. No decorative divider lines.
- One radius: 4px (`--radius`), mapped to every Tailwind radius step.
- Use `dvh`/`svh`, never `100vh`.

## 6. Depth & Elevation

Flat. Shadows only on things that truly float above the page: dialogs, toasts, the export overlay. Nothing at rest has a shadow. No glass or backdrop blur.

## 7. Do's and Don'ts

Do:
- Show real product content (transcripts, quotes, labels) instead of illustrations.
- Label example content as an example.
- Keep claims to what the code does (YouTube links only, 2-hour limit, four quote labels).

Don't:
- Purple gradients, any gradient, pill-shaped buttons.
- Fake reviews, testimonials, users, metrics or customer counters.
- Vague hero text, emoji icons, em dashes, cliche marketing copy, stock photos.
- Over-the-top scroll animation, cursor animation, scroll hijacking.
- Dead links (`href="#"`). Remove the link or build the page.

## 8. Responsive Behavior

- Breakpoints: Tailwind defaults. The landing split stage starts at `lg` (1024px); below that it stacks with the product stage sticky on top.
- Touch targets at least 44px (nav items h-11/h-12, buttons h-11+ on forms).
- Grids collapse to one column; quote card wall goes from 4 to 2 columns.
- Motion: entrances use `data-rise` / `data-reveal` (see `globals.css`), gated behind `html.js` and `prefers-reduced-motion: no-preference`. Transform and opacity only.

