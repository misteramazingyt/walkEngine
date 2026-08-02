// Domain-side contracts for the graph walk. The engine depends only on
// WalkGateway; the real MediaWiki implementation and the deterministic test
// fixture both satisfy it. External API shapes never cross this boundary.

export interface ArticleInfo {
  pageId: number;
  title: string;
  url: string;
  /** Article length in bytes, per MediaWiki page info. */
  length: number;
  isDisambiguation: boolean;
  wikidataId?: string;
  /** Plain-text lead summary. */
  summary: string;
  /** True when the page does not exist (redlink or deleted). */
  missing: boolean;
}

/** Thrown by a gateway when the walk's HTTP request budget is exhausted. */
export class RequestBudgetExhaustedError extends Error {
  constructor(public readonly budget: number) {
    super(`Graph request budget exhausted (${budget} requests)`);
    this.name = "RequestBudgetExhaustedError";
  }
}

/**
 * A hard HTTP request budget shared by every gateway a walk uses (Wikipedia
 * and Wikidata draw from the same pool, so the configured maximum counts
 * actual requests, not logical operations).
 */
export class RequestBudget {
  private usedCount = 0;

  constructor(public readonly limit: number) {}

  get used(): number {
    return this.usedCount;
  }

  spend(): void {
    if (this.usedCount >= this.limit) {
      throw new RequestBudgetExhaustedError(this.limit);
    }
    this.usedCount += 1;
  }
}

/** Structured Wikidata facts for one entity, converted at the boundary. */
export interface EntityFacts {
  qid: string;
  /** English labels of P31 (instance of) values. */
  instanceOfLabels: string[];
  /** Era as years (negative = BCE), from inception/birth/death/start/end. */
  eraStart?: number;
  eraEnd?: number;
  coord?: { lat: number; lon: number };
  /** Number of language editions — used as a popularity proxy. */
  sitelinks: number;
  /** QIDs referenced by this entity's claims (documented-relation signal). */
  claimTargetQids: string[];
}

export interface EntityFactsGateway {
  /** Batched entity facts; missing/unknown ids are simply absent. */
  getEntityFacts(qids: string[]): Promise<Map<string, EntityFacts>>;
}

export interface WalkGateway {
  /**
   * Main-namespace outgoing link titles for an article, sorted
   * alphabetically. Bounded internally (link continuation pages are capped),
   * and every underlying HTTP request counts against the budget.
   */
  getOutgoingLinkTitles(title: string): Promise<string[]>;
  /** Batched page metadata. Missing pages come back with missing: true. */
  getArticleInfos(titles: string[]): Promise<Map<string, ArticleInfo>>;
  /** Non-hidden categories for one article. */
  getCategories(title: string): Promise<string[]>;
  /**
   * Optional: full-text search, used by the Burke walker to generate
   * candidates from a navigation question rather than from adjacency alone.
   */
  searchTitles?(phrase: string, limit: number): Promise<string[]>;
  /** HTTP requests spent so far (cache hits are free). */
  requestsUsed(): number;
}

/** Resolves a user start specification to a canonical article title. */
export interface StartResolver {
  resolveStart(start: {
    kind: "TITLE" | "URL" | "TOPIC" | "RANDOM";
    value: string;
  }): Promise<{ title: string }>;
}

export interface WalkEngineConfig {
  walkLength: number;
  branchFactor: number;
  allowRevisits: boolean;
  excludeMetaPages: boolean;
  minArticleLength: number;
}

export type WalkEndReason =
  | "TARGET_LENGTH_REACHED"
  | "NO_ELIGIBLE_CANDIDATES"
  | "REQUEST_BUDGET_EXHAUSTED";

export interface CandidateRecord {
  title: string;
  eligible: boolean;
  /** Why an ineligible candidate was excluded (title-rule, disambiguation…). */
  exclusionReason?: string;
  /** Criteriological mode: normalized feature values for this candidate. */
  features?: import("./features").CandidateFeatures;
  /** Criteriological mode: weighted score. */
  score?: number;
  /** Criteriological mode: human-readable top contributions. */
  why?: string[];
}

export interface VisitedNode {
  info: ArticleInfo;
  categories: string[];
  visitIndex: number;
  /** The sampled candidate pool this node was chosen from (empty for the start node). */
  chosenFrom: CandidateRecord[];
}

export interface WalkResult {
  visited: VisitedNode[];
  endReason: WalkEndReason;
  requestsUsed: number;
}

export interface WalkProgress {
  visitedCount: number;
  targetLength: number;
  requestsUsed: number;
  currentTitle: string;
}
