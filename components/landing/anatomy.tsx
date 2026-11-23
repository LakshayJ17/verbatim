import Link from "next/link";
import { DownloadSimple, ShareNetwork, UsersThree } from "@phosphor-icons/react/dist/ssr";
import { ScaledRenderer } from "@/components/creator/scaled-renderer";
import { DESIGN_STYLES } from "@/utils/design/styles";
import ScrollReveal from "@/components/reactbits/scroll-reveal";
import { EPISODE } from "./example-episode";
import { SHOWCASE_LINES } from "./example-config";

const LEFT = [
  {
    title: "The exact words",
    body: "Checked against the video's transcript. A close but inexact match is flagged before you can post it.",
  },
  {
    title: "Who said it",
    body: "The speaker's name travels with the quote, so it never turns into an anonymous saying.",
  },
];

const RIGHT = [
  {
    title: "Where it is from",
    body: "The video's title sits under the name, so anyone can find the original.",
  },
  {
    title: "The right size",
    body: "Portrait for feeds, story for reels, banners for channels. Exported at full resolution.",
  },
];

function Callout({ title, body, align }: { title: string; body: string; align: "left" | "right" }) {
  return (
    <div data-reveal className={align === "left" ? "lg:text-right" : undefined}>
      <h3 className="font-display text-[1.375rem] font-semibold leading-tight tracking-[-0.02em]">{title}</h3>
      <p className="mt-3 text-[17px] leading-relaxed">{body}</p>
    </div>
  );
}

/** What every Verbatim image carries, shown on one real card. */
export function Anatomy() {
  const style = DESIGN_STYLES.old_school;
  return (
    <section aria-label="What every image carries" className="bg-white px-5 py-28 md:px-[8%] md:py-40">
      <div className="mx-auto max-w-6xl">
        <ScrollReveal
          mode="enter"
          effect="rise"
          baseRotation={0}
          enableBlur={false}
          stagger={0.06}
          duration={0.6}
          containerClassName="t-head mx-auto max-w-[16ch] text-center"
          textClassName="t-head"
        >
          Every image carries its source
        </ScrollReveal>

        <div className="mt-20 grid items-center gap-14 lg:mt-24 lg:grid-cols-[1fr_minmax(0,22rem)_1fr] lg:gap-20">
          <div className="order-2 grid gap-14 lg:order-1">
            {LEFT.map((c) => (
              <Callout key={c.title} {...c} align="left" />
            ))}
          </div>

          <figure data-ui className="order-1 m-0 lg:order-2">
            <div className="mx-auto aspect-[4/5] w-full max-w-[22rem] overflow-hidden rounded-[var(--radius)] drop-shadow-[0_24px_40px_rgb(6_82_92/0.2)]">
              <ScaledRenderer
                config={{
                  format: "portrait",
                  style: "old_school",
                  palette: style.defaultPalette,
                  typography: style.defaultTypography,
                  content: {
                    type: "quote",
                    text: SHOWCASE_LINES[1],
                    speakerName: EPISODE.guest,
                    sourceTitle: `${EPISODE.show}, ${EPISODE.episode.toLowerCase()}`,
                  },
                  showAttribution: true,
                  showSource: true,
                  rendererVersion: 1,
                }}
              />
            </div>
          </figure>

          <div className="order-3 grid gap-14">
            {RIGHT.map((c) => (
              <Callout key={c.title} {...c} align="right" />
            ))}
          </div>
        </div>

        <div className="mx-auto mt-24 flex max-w-4xl flex-col items-center gap-4 rounded-[var(--radius)] bg-surface px-8 py-6 text-[17px] md:flex-row md:justify-between">
          <span className="font-semibold">Then</span>
          <span className="flex items-center gap-2">
            <DownloadSimple className="size-5" aria-hidden="true" /> download the PNG
          </span>
          <span className="flex items-center gap-2">
            <ShareNetwork className="size-5" aria-hidden="true" /> send it to a friend
          </span>
          <span className="flex items-center gap-2">
            <UsersThree className="size-5" aria-hidden="true" />
            <span>
              post it to{" "}
              <Link href="/discover" className="underline underline-offset-4">
                Commonplace
              </Link>
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
