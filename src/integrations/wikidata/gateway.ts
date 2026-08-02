import {
  RequestBudget,
  type EntityFacts,
  type EntityFactsGateway,
} from "@/domain/walk/types";

// Wikidata Action API gateway for candidate enrichment. Shares the walk's
// RequestBudget with the Wikipedia gateway — the configured maximum bounds
// total HTTP requests across both. Raw wbgetentities shapes never leave this
// module; only EntityFacts do.

const USER_AGENT =
  "MotifWalk/0.3 (https://github.com/misteramazingyt/walkEngine; research instrument; contact via repo issues)";

const MIN_REQUEST_GAP_MS = 120;
const CACHE_TTL_MS = 15 * 60 * 1000;

const factsCache = new Map<string, { at: number; value: EntityFacts }>();
const labelCache = new Map<string, string>();

let lastRequestAt = 0;
async function politeDelay(): Promise<void> {
  const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

interface WbClaimSnak {
  mainsnak?: {
    datavalue?: {
      type?: string;
      value?: unknown;
    };
  };
}

interface WbEntity {
  id: string;
  claims?: Record<string, WbClaimSnak[]>;
  sitelinks?: Record<string, unknown>;
  labels?: Record<string, { value?: string }>;
}

function parseWikidataYear(value: unknown): number | undefined {
  const time = (value as { time?: string } | undefined)?.time;
  if (!time) return undefined;
  const match = time.match(/^([+-]\d{1,16})-/);
  if (!match) return undefined;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : undefined;
}

function claimEntityIds(claims: WbClaimSnak[] | undefined): string[] {
  if (!claims) return [];
  const ids: string[] = [];
  for (const claim of claims) {
    const value = claim.mainsnak?.datavalue;
    if (value?.type === "wikibase-entityid") {
      const id = (value.value as { id?: string })?.id;
      if (id) ids.push(id);
    }
  }
  return ids;
}

export class WikidataGateway implements EntityFactsGateway {
  constructor(private readonly budget: RequestBudget) {}

  private async apiGet(params: Record<string, string>): Promise<unknown> {
    this.budget.spend();
    await politeDelay();
    const query = new URLSearchParams({ format: "json", ...params });
    const response = await fetch(
      `https://www.wikidata.org/w/api.php?${query.toString()}`,
      { headers: { "User-Agent": USER_AGENT } },
    );
    if (!response.ok) {
      throw new Error(`Wikidata API ${response.status}`);
    }
    const body = (await response.json()) as { error?: { info?: string } };
    if (body.error) {
      throw new Error(`Wikidata API error: ${body.error.info ?? "unknown"}`);
    }
    return body;
  }

  /** English labels for a set of QIDs (used for P31 instance-of values). */
  private async getLabels(qids: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const missing: string[] = [];
    for (const qid of qids) {
      const cached = labelCache.get(qid);
      if (cached !== undefined) result.set(qid, cached);
      else missing.push(qid);
    }

    for (let i = 0; i < missing.length; i += 50) {
      const chunk = missing.slice(i, i + 50);
      const body = (await this.apiGet({
        action: "wbgetentities",
        ids: chunk.join("|"),
        props: "labels",
        languages: "en",
      })) as { entities?: Record<string, WbEntity> };
      for (const [qid, entity] of Object.entries(body.entities ?? {})) {
        const label = entity.labels?.en?.value ?? qid;
        labelCache.set(qid, label);
        result.set(qid, label);
      }
    }
    return result;
  }

  async getEntityFacts(qids: string[]): Promise<Map<string, EntityFacts>> {
    const result = new Map<string, EntityFacts>();
    const missing: string[] = [];
    const now = Date.now();
    for (const qid of qids) {
      const cached = factsCache.get(qid);
      if (cached && now - cached.at < CACHE_TTL_MS) result.set(qid, cached.value);
      else missing.push(qid);
    }

    const pendingInstanceOf = new Map<string, string[]>();

    for (let i = 0; i < missing.length; i += 50) {
      const chunk = missing.slice(i, i + 50);
      const body = (await this.apiGet({
        action: "wbgetentities",
        ids: chunk.join("|"),
        props: "claims|sitelinks",
      })) as { entities?: Record<string, WbEntity> };

      for (const [qid, entity] of Object.entries(body.entities ?? {})) {
        const claims = entity.claims ?? {};

        const years: number[] = [];
        for (const property of ["P571", "P569", "P580", "P585"]) {
          for (const claim of claims[property] ?? []) {
            const year = parseWikidataYear(claim.mainsnak?.datavalue?.value);
            if (year !== undefined) years.push(year);
          }
        }
        const endYears: number[] = [];
        for (const property of ["P570", "P582", "P576"]) {
          for (const claim of claims[property] ?? []) {
            const year = parseWikidataYear(claim.mainsnak?.datavalue?.value);
            if (year !== undefined) endYears.push(year);
          }
        }

        let coord: EntityFacts["coord"];
        const coordValue = claims["P625"]?.[0]?.mainsnak?.datavalue;
        if (coordValue?.type === "globecoordinate") {
          const v = coordValue.value as { latitude?: number; longitude?: number };
          if (v.latitude !== undefined && v.longitude !== undefined) {
            coord = { lat: v.latitude, lon: v.longitude };
          }
        }

        const claimTargetQids: string[] = [];
        for (const propertyClaims of Object.values(claims)) {
          claimTargetQids.push(...claimEntityIds(propertyClaims));
          if (claimTargetQids.length > 300) break;
        }

        const facts: EntityFacts = {
          qid,
          instanceOfLabels: [], // filled after the label fetch below
          eraStart: years.length > 0 ? Math.min(...years) : undefined,
          eraEnd:
            endYears.length > 0
              ? Math.max(...endYears)
              : years.length > 0
                ? Math.max(...years)
                : undefined,
          coord,
          sitelinks: Object.keys(entity.sitelinks ?? {}).length,
          claimTargetQids,
        };
        result.set(qid, facts);
        pendingInstanceOf.set(qid, claimEntityIds(claims["P31"]));
      }
    }

    // Resolve instance-of labels in one batched, heavily cached pass.
    const allTypeQids = [...new Set([...pendingInstanceOf.values()].flat())];
    if (allTypeQids.length > 0) {
      const labels = await this.getLabels(allTypeQids);
      for (const [qid, typeQids] of pendingInstanceOf) {
        const facts = result.get(qid);
        if (facts) {
          facts.instanceOfLabels = typeQids.map((t) => labels.get(t) ?? t);
        }
      }
    }

    for (const qid of missing) {
      const facts = result.get(qid);
      if (facts) factsCache.set(qid, { at: now, value: facts });
    }
    return result;
  }
}
