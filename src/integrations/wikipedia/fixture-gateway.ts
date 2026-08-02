import {
  RequestBudgetExhaustedError,
  type ArticleInfo,
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
      links: ["Terrestrial magnetism", "Oceanic navigation", "Edmond Halley"],
    },
    {
      title: "Terrestrial magnetism",
      summary:
        "The study of Earth's magnetic field turned a navigational annoyance into a planetary science.",
      length: 22000,
      wikidataId: "Q7362",
      categories: ["Geophysics"],
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
      links: ["Cloud chamber", "Static electricity", "Lightning rod"],
    },
    {
      title: "Cloud chamber",
      summary:
        "The cloud chamber made the invisible tracks of charged particles visible as trails of condensation.",
      length: 14000,
      wikidataId: "Q244989",
      categories: ["Particle detectors"],
      links: ["Radar", "Nuclear physics", "Atmospheric experimentation"],
    },
    {
      title: "Radar",
      summary:
        "Radar turned reflected radio pulses into a picture of things too far, too fast, or too dark to see.",
      length: 52000,
      wikidataId: "Q47528",
      categories: ["Radio technology", "Military technology"],
      links: ["Nuclear physics", "Cloud chamber", "Cavity magnetron"],
    },
    {
      title: "Nuclear physics",
      summary:
        "Nuclear physics studies the constituents and transformations of atomic nuclei.",
      length: 48000,
      wikidataId: "Q81197",
      categories: ["Nuclear physics"],
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
    // Legitimate side articles so walks can branch.
    ...[
      "Lydia",
      "Gold",
      "Electrum",
      "Mint (facility)",
      "Seigniorage",
      "Silk Road",
      "Incense trade route",
      "Library of Alexandria",
      "Ptolemy",
      "Lighthouse of Alexandria",
      "Ephemeris",
      "Dead reckoning",
      "Marine chronometer",
      "Edmond Halley",
      "William Gilbert (physician)",
      "Leyden jar",
      "Lightning rod",
      "Cavity magnetron",
    ].map((title) => ({
      title,
      summary: `${title} is a fixture side-article with enough length to be eligible.`,
      length: 8000,
      categories: ["Fixture side articles"],
      links: ["Coinage", "Alexandria", "Radar"],
    })),
  ];

  return new Map(articles.map((a) => [a.title, a]));
}

export class FixtureWikipediaGateway implements WalkGateway {
  private used = 0;

  constructor(
    private readonly graph: Map<string, FixtureArticle> = buildDemonstrationGraph(),
    private readonly budget: number = Number.POSITIVE_INFINITY,
  ) {}

  requestsUsed(): number {
    return this.used;
  }

  private spend(): void {
    if (this.used >= this.budget) {
      throw new RequestBudgetExhaustedError(this.budget);
    }
    this.used += 1;
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
      wikidataId: article.wikidataId,
      summary: article.summary,
      missing: false,
    };
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
