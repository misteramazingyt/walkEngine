import {
  RequestBudgetExhaustedError,
  type ArticleInfo,
  type WalkGateway,
} from "@/domain/walk/types";

// Real MediaWiki Action API gateway. Responsibilities:
// - polite serial requests with a minimum gap and a descriptive User-Agent;
// - per-process response cache keyed by canonical (lang, op, params);
// - hard request budget: every cache-missing HTTP request counts, and the
//   budget error aborts the walk, never silently truncates data;
// - conversion of raw API shapes into domain ArticleInfo at this boundary.

const USER_AGENT =
  "MotifWalk/0.2 (https://github.com/misteramazingyt/walkEngine; research instrument; contact via repo issues)";

const MIN_REQUEST_GAP_MS = 120;
const LINK_CONTINUATION_CAP = 3; // ≤1500 links per article
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 2000;

interface CacheEntry {
  at: number;
  value: unknown;
}

// Module-level cache so successive walks in one server process share it.
const responseCache = new Map<string, CacheEntry>();

function cacheGet(key: string): unknown | undefined {
  const entry = responseCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    responseCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key: string, value: unknown): void {
  if (responseCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (oldest !== undefined) responseCache.delete(oldest);
  }
  responseCache.set(key, { at: Date.now(), value });
}

let lastRequestAt = 0;
async function politeDelay(): Promise<void> {
  const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

export class WikipediaGateway implements WalkGateway {
  private used = 0;

  constructor(
    private readonly language: string,
    private readonly budget: number,
  ) {}

  requestsUsed(): number {
    return this.used;
  }

  private endpoint(): string {
    return `https://${this.language}.wikipedia.org/w/api.php`;
  }

  /** One budgeted, cached GET against the Action API. */
  private async apiGet(params: Record<string, string>): Promise<unknown> {
    const query = new URLSearchParams({
      format: "json",
      formatversion: "2",
      ...params,
    });
    const key = `${this.language}|${query.toString()}`;
    const cached = cacheGet(key);
    if (cached !== undefined) return cached;

    if (this.used >= this.budget) {
      throw new RequestBudgetExhaustedError(this.budget);
    }
    this.used += 1;

    await politeDelay();
    const response = await fetch(`${this.endpoint()}?${query.toString()}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!response.ok) {
      throw new Error(
        `Wikipedia API ${response.status} for ${query.get("action")}`,
      );
    }
    const body = (await response.json()) as { error?: { info?: string } };
    if (body.error) {
      throw new Error(`Wikipedia API error: ${body.error.info ?? "unknown"}`);
    }
    cacheSet(key, body);
    return body;
  }

  async getOutgoingLinkTitles(title: string): Promise<string[]> {
    const titles: string[] = [];
    let continueToken: string | undefined;

    for (let page = 0; page < LINK_CONTINUATION_CAP; page++) {
      const body = (await this.apiGet({
        action: "query",
        titles: title,
        prop: "links",
        plnamespace: "0",
        pllimit: "max",
        redirects: "1",
        ...(continueToken ? { plcontinue: continueToken } : {}),
      })) as {
        continue?: { plcontinue?: string };
        query?: { pages?: Array<{ links?: Array<{ title: string }> }> };
      };

      const links = body.query?.pages?.[0]?.links ?? [];
      for (const link of links) titles.push(link.title);

      continueToken = body.continue?.plcontinue;
      if (!continueToken) break;
    }

    return titles.sort();
  }

  async getArticleInfos(titles: string[]): Promise<Map<string, ArticleInfo>> {
    if (titles.length === 0) return new Map();
    if (titles.length > 20) {
      throw new Error(
        `getArticleInfos batch too large (${titles.length}); extracts allow 20`,
      );
    }

    const body = (await this.apiGet({
      action: "query",
      titles: titles.join("|"),
      redirects: "1",
      prop: "info|pageprops|extracts",
      inprop: "url",
      ppprop: "wikibase_item|disambiguation",
      exintro: "1",
      explaintext: "1",
      exlimit: "20",
    })) as {
      query?: {
        redirects?: Array<{ from: string; to: string }>;
        pages?: Array<{
          pageid?: number;
          title: string;
          missing?: boolean;
          length?: number;
          fullurl?: string;
          extract?: string;
          pageprops?: { wikibase_item?: string; disambiguation?: string };
        }>;
      };
    };

    const redirectMap = new Map<string, string>();
    for (const r of body.query?.redirects ?? []) redirectMap.set(r.to, r.from);

    const result = new Map<string, ArticleInfo>();
    for (const page of body.query?.pages ?? []) {
      const info: ArticleInfo = {
        pageId: page.pageid ?? -1,
        title: page.title,
        url:
          page.fullurl ??
          `https://${this.language}.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`,
        length: page.length ?? 0,
        isDisambiguation: page.pageprops?.disambiguation !== undefined,
        wikidataId: page.pageprops?.wikibase_item,
        summary: (page.extract ?? "").trim(),
        missing: page.missing === true,
      };
      // Key by both the canonical title and the requested (pre-redirect)
      // title so callers can look up what they asked for.
      result.set(page.title, info);
      const requestedAs = redirectMap.get(page.title);
      if (requestedAs) result.set(requestedAs, info);
    }
    return result;
  }

  async getCategories(title: string): Promise<string[]> {
    const body = (await this.apiGet({
      action: "query",
      titles: title,
      prop: "categories",
      clshow: "!hidden",
      cllimit: "max",
      redirects: "1",
    })) as {
      query?: {
        pages?: Array<{ categories?: Array<{ title: string }> }>;
      };
    };
    return (body.query?.pages?.[0]?.categories ?? []).map((c) =>
      c.title.replace(/^Category:/, ""),
    );
  }

  /** Resolve a start specification to a canonical article title. */
  async resolveStart(start: {
    kind: "TITLE" | "URL" | "TOPIC" | "RANDOM";
    value: string;
  }): Promise<{ title: string }> {
    switch (start.kind) {
      case "TITLE": {
        const infos = await this.getArticleInfos([start.value.trim()]);
        const info = [...infos.values()].find((i) => !i.missing);
        if (!info) {
          throw new Error(`No Wikipedia article titled "${start.value}"`);
        }
        return { title: info.title };
      }
      case "URL": {
        const match = start.value.match(/\/wiki\/([^?#]+)/);
        if (!match) {
          throw new Error(`Not a recognizable Wikipedia URL: ${start.value}`);
        }
        const title = decodeURIComponent(match[1]).replaceAll("_", " ");
        return this.resolveStart({ kind: "TITLE", value: title });
      }
      case "TOPIC": {
        const body = (await this.apiGet({
          action: "query",
          list: "search",
          srsearch: start.value,
          srnamespace: "0",
          srlimit: "1",
        })) as { query?: { search?: Array<{ title: string }> } };
        const hit = body.query?.search?.[0];
        if (!hit) {
          throw new Error(`No article found for topic "${start.value}"`);
        }
        return { title: hit.title };
      }
      case "RANDOM": {
        const body = (await this.apiGet({
          action: "query",
          list: "random",
          rnnamespace: "0",
          rnfilterredir: "nonredirects",
          rnlimit: "1",
          // Cache-buster: a random draw must not be served from cache.
          _mwrandom: String(Date.now()),
        })) as { query?: { random?: Array<{ title: string }> } };
        const hit = body.query?.random?.[0];
        if (!hit) throw new Error("Wikipedia returned no random article");
        return { title: hit.title };
      }
    }
  }
}
