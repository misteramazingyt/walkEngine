import type { ArticleInfo, WalkEngineConfig } from "./types";

// Exclusion rules for candidate pages. Title rules run before any metadata
// is fetched (they are free); metadata rules run on the sampled pool.

const META_TITLE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^Lists? of /i, reason: "list page" },
  { pattern: /^Index of /i, reason: "index page" },
  { pattern: /^Outline of /i, reason: "outline page" },
  { pattern: /^Glossary of /i, reason: "glossary page" },
  { pattern: /^Timeline of /i, reason: "timeline page" },
  { pattern: /^Comparison of /i, reason: "comparison page" },
  { pattern: /\(disambiguation\)$/i, reason: "disambiguation page" },
  // Bare years ("1905", "44 BC") and calendar days ("March 3") link
  // everywhere and derail walks into chronology.
  { pattern: /^\d{1,4}s?( (BC|BCE|AD|CE))?$/, reason: "calendar page" },
  {
    pattern:
      /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}$/,
    reason: "calendar page",
  },
  { pattern: /^ISO \d/, reason: "standard-number page" },
  { pattern: /^ISBN$|^ISSN$|^Digital object identifier$/i, reason: "identifier page" },
  // Reference works that enumerate a field rather than being of it. These
  // are not prefix-anchored because the giveaway sits mid-title: "AFI
  // Catalog of Feature Films" passed every rule above and arrived in a
  // composition as though it were a historical subject.
  { pattern: /\bcatalogs? of\b|\bcatalogues? of\b/i, reason: "catalogue page" },
  { pattern: /\bbibliograph(y|ies)\b/i, reason: "bibliography page" },
  { pattern: /\bfilmograph(y|ies)\b/i, reason: "filmography page" },
  { pattern: /\bdiscograph(y|ies)\b/i, reason: "discography page" },
  { pattern: /\b(encyclopedia|encyclopaedia) of\b/i, reason: "encyclopedia page" },
  // Namespace leakage: these are not articles at all.
  {
    pattern: /^(Category|Portal|Template|Wikipedia|Help|Draft|Module):/i,
    reason: "non-article namespace",
  },
];

/** Title-level exclusion; returns a reason or null when the title is fine. */
export function titleExclusionReason(
  title: string,
  config: Pick<WalkEngineConfig, "excludeMetaPages">,
): string | null {
  if (!config.excludeMetaPages) return null;
  for (const { pattern, reason } of META_TITLE_PATTERNS) {
    if (pattern.test(title)) return reason;
  }
  return null;
}

/** Metadata-level exclusion; returns a reason or null when the page is fine. */
export function infoExclusionReason(
  info: ArticleInfo,
  config: Pick<WalkEngineConfig, "excludeMetaPages" | "minArticleLength">,
): string | null {
  if (info.missing) return "missing page";
  if (config.excludeMetaPages && info.isDisambiguation) {
    return "disambiguation page";
  }
  if (config.minArticleLength > 0 && info.length < config.minArticleLength) {
    return `article shorter than ${config.minArticleLength} bytes`;
  }
  return null;
}
