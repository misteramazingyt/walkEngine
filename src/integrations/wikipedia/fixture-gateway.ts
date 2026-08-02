import {
  RequestBudget,
  type ArticleInfo,
  type EntityFacts,
  type EntityFactsGateway,
  type WalkGateway,
} from "@/domain/walk/types";

// Deterministic in-memory gateway over a synthetic article graph, modeled on
// the seed demonstration chain (touchstone → coinage → … → radar). Used by
// the automated tests and by WIKIPEDIA_MODE=fixture for offline development.
// It counts "requests" with the same granularity as the real gateway so
// budget behavior is testable.

export interface FixtureArticle {
  title: string;
  summary: string;
  length: number;
  isDisambiguation?: boolean;
  wikidataId?: string;
  categories: string[];
  links: string[];
  /** Synthetic Wikidata-style facts for criteriological enrichment. */
  facts?: {
    types: string[];
    eraStart?: number;
    eraEnd?: number;
    coord?: { lat: number; lon: number };
    sitelinks?: number;
    claimTargets?: string[]; // titles of related fixture articles
  };
}

export function buildDemonstrationGraph(): Map<string, FixtureArticle> {
  const articles: FixtureArticle[] = [
    {
      title: "Touchstone (assaying tool)",
      summary:
        "A touchstone is a small tablet of dark stone used for assaying precious metal alloys by the color of their streak.",
      length: 9000,
      wikidataId: "Q1519002",
      categories: ["Metallurgy", "Assaying"],
      facts: {
        types: ["tool"],
        eraStart: -600,
        eraEnd: -500,
        coord: { lat: 38.5, lon: 28.0 },
        sitelinks: 25,
        claimTargets: ["Lydia", "Gold", "Electrum"],
      },
      links: [
        "Coinage",
        "Lydia",
        "Gold",
        "Electrum",
        "List of assaying techniques",
        "Touchstone (disambiguation)",
        "1905",
        "Basanite stub",
      ],
    },
    {
      title: "Coinage",
      summary:
        "Coinage is the production of standardized metal money whose value is warranted by an issuing authority.",
      length: 24000,
      wikidataId: "Q41207",
      categories: ["Currency", "Economic history"],
      facts: {
        types: ["economic practice"],
        eraStart: -600,
        eraEnd: 2000,
        coord: { lat: 38.5, lon: 28.0 },
        sitelinks: 80,
        claimTargets: ["Lydia", "Touchstone (assaying tool)", "Mint (facility)"],
      },
      links: [
        "Long-distance trade",
        "Lydia",
        "Mint (facility)",
        "Touchstone (assaying tool)",
        "Seigniorage",
        "List of currencies",
        "March 3",
      ],
    },
    {
      title: "Long-distance trade",
      summary:
        "Long-distance trade moved goods, standards, and information between societies that never met face to face.",
      length: 18000,
      wikidataId: "Q601401",
      categories: ["Trade", "Economic history"],
      facts: {
        types: ["economic practice"],
        eraStart: -500,
        eraEnd: 1800,
        sitelinks: 40,
        claimTargets: ["Coinage", "Silk Road"],
      },
      links: [
        "Alexandria",
        "Silk Road",
        "Coinage",
        "Incense trade route",
        "Comparison of trade routes",
      ],
    },
    {
      title: "Alexandria",
      summary:
        "Alexandria was a Mediterranean port city whose institutions concentrated shipping records, scholarship, and astronomy.",
      length: 41000,
      wikidataId: "Q87",
      categories: ["Port cities", "Hellenistic Egypt"],
      facts: {
        types: ["city"],
        eraStart: -331,
        eraEnd: 2000,
        coord: { lat: 31.2, lon: 29.9 },
        sitelinks: 200,
        claimTargets: ["Library of Alexandria", "Lighthouse of Alexandria"],
      },
      links: [
        "Astronomical tables",
        "Library of Alexandria",
        "Ptolemy",
        "Long-distance trade",
        "Lighthouse of Alexandria",
      ],
    },
    {
      title: "Astronomical tables",
      summary:
        "Astronomical tables reduced the motions of the heavens to columns of numbers a navigator or astrologer could use.",
      length: 15000,
      wikidataId: "Q1140444",
      categories: ["Astronomy", "Navigation"],
      facts: {
        types: ["document"],
        eraStart: 150,
        eraEnd: 1800,
        coord: { lat: 31.2, lon: 29.9 },
        sitelinks: 30,
        claimTargets: ["Ptolemy", "Ephemeris", "Alexandria"],
      },
      links: [
        "Oceanic navigation",
        "Ptolemy",
        "Ephemeris",
        "Alexandria",
        "Index of astronomy articles",
      ],
    },
    {
      title: "Oceanic navigation",
      summary:
        "Oceanic navigation carried instruments and tables beyond sight of land, where errors compounded for weeks.",
      length: 20000,
      wikidataId: "Q639907",
      categories: ["Navigation", "Age of Sail"],
      facts: {
        types: ["practice"],
        eraStart: 1400,
        eraEnd: 1900,
        coord: { lat: 38.7, lon: -9.1 },
        sitelinks: 35,
        claimTargets: ["Astronomical tables", "Dead reckoning", "Marine chronometer"],
      },
      links: [
        "Compass variation",
        "Astronomical tables",
        "Dead reckoning",
        "Marine chronometer",
      ],
    },
    {
      title: "Compass variation",
      summary:
        "Compass variation is the angle between magnetic and true north, a nuisance that became a datum.",
      length: 12000,
      wikidataId: "Q679033",
      categories: ["Navigation", "Geomagnetism"],
      facts: {
        types: ["physical phenomenon"],
        eraStart: 1500,
        eraEnd: 1900,
        coord: { lat: 51.5, lon: -0.1 },
        sitelinks: 22,
        claimTargets: ["Terrestrial magnetism", "Edmond Halley"],
      },
      links: ["Terrestrial magnetism", "Oceanic navigation", "Edmond Halley"],
    },
    {
      title: "Terrestrial magnetism",
      summary:
        "The study of Earth's magnetic field turned a navigational annoyance into a planetary science.",
      length: 22000,
      wikidataId: "Q7362",
      categories: ["Geophysics"],
      facts: {
        types: ["scientific field"],
        eraStart: 1600,
        eraEnd: 2000,
        sitelinks: 45,
        claimTargets: ["William Gilbert (physician)", "Compass variation"],
      },
      links: [
        "Static electricity",
        "Compass variation",
        "William Gilbert (physician)",
      ],
    },
    {
      title: "Static electricity",
      summary:
        "Static electricity was a parlor curiosity before it was a subject: rubbed amber, sparks, and Leyden jars.",
      length: 17000,
      wikidataId: "Q26336",
      categories: ["Electrostatics"],
      facts: {
        types: ["physical phenomenon"],
        eraStart: 1650,
        eraEnd: 1800,
        coord: { lat: 52.2, lon: 4.5 },
        sitelinks: 55,
        claimTargets: ["Leyden jar"],
      },
      links: [
        "Atmospheric experimentation",
        "Terrestrial magnetism",
        "Leyden jar",
      ],
    },
    {
      title: "Atmospheric experimentation",
      summary:
        "Kites, balloons, and mountaintop instruments took laboratory questions into the weather itself.",
      length: 11000,
      wikidataId: "Q3141560",
      categories: ["History of science"],
      facts: {
        types: ["practice"],
        eraStart: 1750,
        eraEnd: 1950,
        coord: { lat: 39.9, lon: -75.2 },
        sitelinks: 12,
        claimTargets: ["Lightning rod", "Cloud chamber"],
      },
      links: ["Cloud chamber", "Static electricity", "Lightning rod"],
    },
    {
      title: "Cloud chamber",
      summary:
        "The cloud chamber made the invisible tracks of charged particles visible as trails of condensation.",
      length: 14000,
      wikidataId: "Q244989",
      categories: ["Particle detectors"],
      facts: {
        types: ["instrument"],
        eraStart: 1911,
        eraEnd: 1960,
        coord: { lat: 55.9, lon: -3.2 },
        sitelinks: 38,
        claimTargets: ["Nuclear physics", "Atmospheric experimentation"],
      },
      links: ["Radar", "Nuclear physics", "Atmospheric experimentation"],
    },
    {
      title: "Radar",
      summary:
        "Radar turned reflected radio pulses into a picture of things too far, too fast, or too dark to see.",
      length: 52000,
      wikidataId: "Q47528",
      categories: ["Radio technology", "Military technology"],
      facts: {
        types: ["instrument"],
        eraStart: 1935,
        eraEnd: 2000,
        coord: { lat: 51.5, lon: -0.1 },
        sitelinks: 120,
        claimTargets: ["Cavity magnetron", "Cloud chamber"],
      },
      links: ["Nuclear physics", "Cloud chamber", "Cavity magnetron"],
    },
    {
      title: "Nuclear physics",
      summary:
        "Nuclear physics studies the constituents and transformations of atomic nuclei.",
      length: 48000,
      wikidataId: "Q81197",
      categories: ["Nuclear physics"],
      facts: {
        types: ["scientific field"],
        eraStart: 1896,
        eraEnd: 2000,
        sitelinks: 110,
        claimTargets: ["Cloud chamber", "Radar"],
      },
      links: ["Radar", "Cloud chamber"],
    },
    // Distractors that exclusion rules must catch.
    {
      title: "Touchstone (disambiguation)",
      summary: "Topics referred to by the same term.",
      length: 3000,
      isDisambiguation: true,
      categories: ["Disambiguation pages"],
      links: [],
    },
    {
      title: "Basanite stub",
      summary: "A very short article.",
      length: 180,
      categories: ["Stubs"],
      links: [],
    },
    // Legitimate side articles so walks can branch. Humans carry human
    // facts so biography-repetition penalties are testable; places carry
    // coordinates; objects carry concrete types.
    ...(
      [
        ["Lydia", "kingdom", -700, -540, { lat: 38.5, lon: 28.0 }, 60],
        ["Gold", "chemical element", undefined, undefined, undefined, 150],
        ["Electrum", "alloy", -700, -500, { lat: 38.5, lon: 28.0 }, 30],
        ["Mint (facility)", "building", -600, 2000, { lat: 41.9, lon: 12.5 }, 45],
        ["Seigniorage", "economic concept", 1200, 2000, undefined, 25],
        ["Silk Road", "trade route", -130, 1450, { lat: 40.0, lon: 65.0 }, 130],
        ["Incense trade route", "trade route", -700, 200, { lat: 15.0, lon: 45.0 }, 20],
        ["Library of Alexandria", "building", -285, 270, { lat: 31.2, lon: 29.9 }, 140],
        ["Ptolemy", "human", 100, 170, { lat: 31.2, lon: 29.9 }, 160],
        ["Lighthouse of Alexandria", "building", -280, 1300, { lat: 31.2, lon: 29.9 }, 90],
        ["Ephemeris", "document", 150, 2000, undefined, 35],
        ["Dead reckoning", "practice", 1400, 1900, undefined, 28],
        ["Marine chronometer", "instrument", 1730, 1900, { lat: 51.5, lon: -0.1 }, 42],
        ["Edmond Halley", "human", 1656, 1742, { lat: 51.5, lon: -0.1 }, 95],
        ["William Gilbert (physician)", "human", 1544, 1603, { lat: 51.5, lon: -0.1 }, 55],
        ["Leyden jar", "instrument", 1745, 1900, { lat: 52.2, lon: 4.5 }, 40],
        ["Lightning rod", "instrument", 1752, 2000, { lat: 39.9, lon: -75.2 }, 48],
        ["Cavity magnetron", "instrument", 1940, 2000, { lat: 52.2, lon: 0.1 }, 33],
      ] as Array<
        [string, string, number | undefined, number | undefined, { lat: number; lon: number } | undefined, number]
      >
    ).map(([title, type, eraStart, eraEnd, coord, sitelinks]) => ({
      title,
      summary: `${title} is a fixture side-article (${type}) with enough length to be eligible.`,
      length: 8000,
      categories: ["Fixture side articles", type],
      links: ["Coinage", "Alexandria", "Radar"],
      facts: { types: [type], eraStart, eraEnd, coord, sitelinks },
    })),
  ];

  return new Map(articles.map((a) => [a.title, a]));
}

export class FixtureWikipediaGateway implements WalkGateway, EntityFactsGateway {
  private readonly budget: RequestBudget;
  private readonly qidIndex = new Map<string, FixtureArticle>();

  constructor(
    private readonly graph: Map<string, FixtureArticle> = buildDemonstrationGraph(),
    budget: RequestBudget | number = Number.MAX_SAFE_INTEGER,
  ) {
    this.budget =
      budget instanceof RequestBudget ? budget : new RequestBudget(budget);
    for (const article of this.graph.values()) {
      this.qidIndex.set(this.qidFor(article), article);
    }
  }

  requestsUsed(): number {
    return this.budget.used;
  }

  private spend(): void {
    this.budget.spend();
  }

  /** Every fixture article gets a stable synthetic QID when none is set. */
  private qidFor(article: FixtureArticle): string {
    return article.wikidataId ?? `QF${Math.abs(hashCode(article.title))}`;
  }

  private toInfo(title: string): ArticleInfo {
    const article = this.graph.get(title);
    if (!article) {
      return {
        pageId: -1,
        title,
        url: `https://fixture.local/wiki/${encodeURIComponent(title)}`,
        length: 0,
        isDisambiguation: false,
        summary: "",
        missing: true,
      };
    }
    return {
      pageId: Math.abs(hashCode(title)),
      title: article.title,
      url: `https://fixture.local/wiki/${encodeURIComponent(article.title)}`,
      length: article.length,
      isDisambiguation: article.isDisambiguation === true,
      wikidataId: this.qidFor(article),
      summary: article.summary,
      missing: false,
    };
  }

  async getEntityFacts(qids: string[]): Promise<Map<string, EntityFacts>> {
    this.spend();
    const result = new Map<string, EntityFacts>();
    for (const qid of qids) {
      const article = this.qidIndex.get(qid);
      const facts = article?.facts;
      if (!article) continue;
      result.set(qid, {
        qid,
        instanceOfLabels: facts?.types ?? ["concept"],
        eraStart: facts?.eraStart,
        eraEnd: facts?.eraEnd,
        coord: facts?.coord,
        sitelinks: facts?.sitelinks ?? 10,
        claimTargetQids: (facts?.claimTargets ?? [])
          .map((title) => {
            const target = this.graph.get(title);
            return target ? this.qidFor(target) : null;
          })
          .filter((q): q is string => q !== null),
      });
    }
    return result;
  }

  async getOutgoingLinkTitles(title: string): Promise<string[]> {
    this.spend();
    return [...(this.graph.get(title)?.links ?? [])].sort();
  }

  async getArticleInfos(titles: string[]): Promise<Map<string, ArticleInfo>> {
    this.spend();
    return new Map(titles.map((t) => [t, this.toInfo(t)]));
  }

  async getCategories(title: string): Promise<string[]> {
    this.spend();
    return this.graph.get(title)?.categories ?? [];
  }

  async searchTitles(phrase: string, limit: number): Promise<string[]> {
    this.spend();
    const needle = phrase.toLowerCase();
    const words = needle.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    const hits: string[] = [];
    for (const article of this.graph.values()) {
      const haystack = `${article.title} ${article.summary}`.toLowerCase();
      if (words.some((w) => haystack.includes(w))) hits.push(article.title);
    }
    return hits.slice(0, limit);
  }

  async resolveStart(start: {
    kind: "TITLE" | "URL" | "TOPIC" | "RANDOM";
    value: string;
  }): Promise<{ title: string }> {
    this.spend();
    if (start.kind === "RANDOM") {
      return { title: "Touchstone (assaying tool)" };
    }
    const needle = start.value.trim().toLowerCase();
    for (const title of this.graph.keys()) {
      if (title.toLowerCase().includes(needle)) return { title };
    }
    throw new Error(`Fixture graph has no article matching "${start.value}"`);
  }
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}
