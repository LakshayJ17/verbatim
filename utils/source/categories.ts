export const ALLOWED_CATEGORIES = [
  "Music",
  "Entertainment",
  "Sports",
  "Spirituality",
  "Business",
  "Startups",
  "Technology",
  "Programming",
  "Education",
  "Science",
  "Psychology",
  "Self Improvement",
  "Health",
  "Finance",
  "Politics",
  "History",
  "News",
  "Culture",
  "Comedy",
  "Lifestyle",
  "Career",
] as const;

export type SourceCategory = typeof ALLOWED_CATEGORIES[number];

export function isValidCategory(category: string): category is SourceCategory {
  return ALLOWED_CATEGORIES.includes(category as SourceCategory);
}

export function filterValidCategories(categories: string[]): SourceCategory[] {
  // Enforce max 3, no duplicates
  const unique = Array.from(new Set(categories));
  return unique.filter(isValidCategory).slice(0, 3);
}

export type ContentSafety = "SAFE" | "SENSITIVE" | "DISALLOWED";
