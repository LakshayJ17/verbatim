/**
 * Real lines from podcast episodes, shown on the landing page grid and the
 * sign-in panel. Each one was checked word for word against the episode's
 * published transcript (the `source` link). Keep it that way: Verbatim is
 * about exact quotes, so never shorten, tidy or paraphrase one here.
 */
export interface PodcastQuote {
  text: string;
  speaker: string;
  show: string;
  episode: string;
  year: number;
  source: string;
}

export const PODCAST_QUOTES = {
  nadella: {
    // Excerpt of "The way to think about it is, longevity is not a goal; relevance is."
    text: "Longevity is not a goal; relevance is.",
    speaker: "Satya Nadella",
    show: "Dwarkesh Podcast",
    episode: "Satya Nadella: Microsoft's AGI plan & quantum breakthrough",
    year: 2025,
    source: "https://www.dwarkesh.com/p/satya-nadella",
  },
  tao: {
    text: "Sometimes actually it's even productive to make mistakes.",
    speaker: "Terence Tao",
    show: "Lex Fridman Podcast",
    episode: "#472",
    year: 2025,
    source: "https://lexfridman.com/terence-tao-transcript/",
  },
  pichai: {
    text: "Listen to your heart and see whether you actually enjoy doing it.",
    speaker: "Sundar Pichai",
    show: "Lex Fridman Podcast",
    episode: "#471",
    year: 2025,
    source: "https://lexfridman.com/sundar-pichai-transcript/",
  },
  naval: {
    text: "If you have peace of body, it's easier to have peace of mind.",
    speaker: "Naval Ravikant",
    show: "The Tim Ferriss Show",
    episode: "#136",
    year: 2016,
    source: "https://tim.blog/naval-ravikant-on-the-tim-ferriss-show-transcript/",
  },
  hassabis: {
    text: "You can learn something kind of equally valuable from an experiment that doesn't work.",
    speaker: "Demis Hassabis",
    show: "Lex Fridman Podcast",
    episode: "#475",
    year: 2025,
    source: "https://lexfridman.com/demis-hassabis-2-transcript/",
  },
  sethi: {
    text: "The more dialed in your rich life becomes, the more incomprehensible it should become to everybody else.",
    speaker: "Ramit Sethi",
    show: "The Tim Ferriss Show",
    episode: "#524",
    year: 2021,
    source: "https://tim.blog/2021/07/31/ramit-sethi-2-transcript/",
  },
  bezos: {
    text: "Every day you are deciding what you're going to do and you are not trapped by what you were or who you were or any self-consistency.",
    speaker: "Jeff Bezos",
    show: "Lex Fridman Podcast",
    episode: "#405",
    year: 2023,
    source: "https://lexfridman.com/jeff-bezos-transcript/",
  },
  srinivas: {
    // Excerpt: the sentence opens with "But" and continues past "living for it".
    text: "If there is a certain idea that really just occupies your mind all the time, it's worth making your life about that idea and living for it.",
    speaker: "Aravind Srinivas",
    show: "Lex Fridman Podcast",
    episode: "#434",
    year: 2024,
    source: "https://lexfridman.com/aravind-srinivas-transcript/",
  },
} satisfies Record<string, PodcastQuote>;
