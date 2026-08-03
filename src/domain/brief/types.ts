// A brief is what a writer actually says when asked what they want:
//
//   "the meaning of life is exactly what you make it. over a large time
//    scale, pay special attention to disputes over 'meaning of life'
//    according to average and ordinary individuals..."
//
// One paragraph carrying four different kinds of instruction — a
// proposition to arrive at, a field of attention, a temporal scale, and a
// preference about the rhythm of the route. The configuration form has a
// separate control for each, which is why filling it in feels like
// translating yourself into someone else's ontology.
//
// Parsing is therefore a real operation with a real failure mode, and the
// failure that matters is silent dropping: a brief that asked for something
// the configuration cannot express should say so, not proceed as though it
// had been understood.

export interface ParsedBrief {
  targetWords: number | null;
  density: "sparse" | "moderate" | "dense";
  namedConnections: string[];
  thesis: string;
  /** The proposition the route culminates in. */
  seedText: string;
  /** The field of salience — what to become sensitive to, not a thesis. */
  attentionProgram: string;
  /** Years, negative for BCE. Null where the brief implies no bound. */
  temporalStart: number | null;
  temporalEnd: number | null;
  /** How many subjects the route should discover. */
  subjectCount: number;
  /** What the parser took the brief to be asking, in its own words. */
  reading: string;
  /**
   * Instructions the configuration cannot express. Never empty out of
   * politeness: an unhonoured instruction reported is a limitation, and an
   * unhonoured instruction hidden is a lie about what the walk did.
   */
  unhonoured: string[];
}

export interface BriefOracle {
  parse(input: { brief: string }): Promise<ParsedBrief>;
}
