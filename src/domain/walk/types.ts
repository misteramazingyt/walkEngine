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
