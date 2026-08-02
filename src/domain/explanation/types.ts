// Vocabulary shared by every strategy that moves through the archive by
// following a LACK rather than a resemblance.
//
// Burke's lack is an *explanatory deficiency*: the current account cannot
// explain something. Anamnesis's lack is an *unpaid debt*: the terminal
// sentence asserts something the reader has not been prepared to receive.
// These are deliberately NOT unified into one type — they direct the walk
// differently, and collapsing them would blur what each mode is for. What
// is genuinely common lives here.

/** The evidential character of a claim. Never conflate these. */
export type EvidenceStatus =
  | "documented transmission"
  | "historical precondition"
  | "institutional relation"
  | "shared condition"
  | "structural analogy"
  | "speculative resonance";

export const EVIDENCE_STATUSES: readonly EvidenceStatus[] = [
  "documented transmission",
  "historical precondition",
  "institutional relation",
  "shared condition",
  "structural analogy",
  "speculative resonance",
] as const;

/** Statuses that may not carry a pivot on their own. */
export const WEAK_EVIDENCE_STATUSES: readonly EvidenceStatus[] = [
  "structural analogy",
  "speculative resonance",
] as const;

/**
 * The sentence justifying a transition, written BEFORE the node is accepted.
 * `standsAlone` is the discipline: a bridge that only works by invoking the
 * destination (the seed, the terminal sentence) is forcing, not motivating.
 */
export interface NarrativeBridge {
  fromTitle: string;
  toTitle: string;
  /** What the previous node left unexplained or unearned. */
  unresolvedByPrevious: string;
  /** Why this node is the next reasonable place to look. */
  whyNext: string;
  standsAlone: boolean;
}

/** A concrete thing a reader can hold: a scene, object, person, procedure. */
export interface ConcreteAnchor {
  description: string;
  kind: "scene" | "object" | "person" | "procedure" | "institution" | "image";
  sourceTitle: string;
}

/** Weighted-sum helper shared by the strategies' scoring modules. */
export function weightedScore<K extends string>(
  scores: Record<K, number>,
  positive: Partial<Record<K, number>>,
  negative: Partial<Record<K, number>>,
): number {
  let total = 0;
  for (const [key, weight] of Object.entries(positive) as Array<[K, number]>) {
    total += weight * (scores[key] ?? 0);
  }
  for (const [key, weight] of Object.entries(negative) as Array<[K, number]>) {
    total -= weight * (scores[key] ?? 0);
  }
  return total;
}
