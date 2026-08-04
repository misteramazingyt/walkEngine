import type { RouteOracle, ScriptOracle } from "@/domain/route/types";
import { beatSchema, carrierVerdictSchema, dwellExpansionSchema, routePlanSchema, specifyVerdictSchema, beatCheckSchema } from "@/schemas/route";
import { z } from "zod";
import { loadPrompt } from "./prompt-files";
import type { LanguageModelProvider } from "./provider";

const repairSchema = z.object({
  replacements: z
    .array(
      z.object({
        replacesTitle: z.string().min(1),
        pageTitle: z.string().min(1),
      }),
    )
    .default([]),
});

export class LlmScriptOracle implements ScriptOracle {
  constructor(private readonly provider: LanguageModelProvider) {}

  async writeBeat(input: Parameters<ScriptOracle["writeBeat"]>[0]) {
    const card = input.card;
    const cardLines = card
      ? [
          "PERFORMANCE CARD — realise every line of it:",
          card.voice === "address"
            ? "  · speak to the viewer directly in this beat (you/your, or the narrator in first person admitting something)"
            : card.voice === "question"
              ? "  · ask one real question in this beat and let the piece pursue it"
              : "  · no direct address in this beat",
          card.aside
            ? "  · include one wry aside — a joke or dry remark with no structural duty"
            : "  · no aside in this beat",
          card.rest
            ? "  · this beat is a REST: no turn, no reversal, no surprise. Report cleanly; the rests are what make the turns land"
            : "",
          `  · hard cap ${card.wordCap} words`,
        ]
          .filter(Boolean)
          .join("\n")
      : "";
    const violationLines =
      input.violations && input.violations.length > 0
        ? "THE PREVIOUS ATTEMPT FAILED ITS CARD — fix exactly these, changing nothing else:\n" +
          input.violations.map((v) => `  · ${v}`).join("\n")
        : "";
    return this.provider.generateStructured({
      promptId: "write-beat.v1",
      system: loadPrompt("write-beat.v1") + "\n\n" + loadPrompt("voice.v1"),
      user: [
        cardLines,
        violationLines,
        `THE ROUTE IS BUILDING TOWARD: "${input.seed}"`,
        `OBJECT OF INQUIRY (its understanding must accumulate): ${input.objectOfInquiry}`,
        `THE QUESTION BEING ASKED OF IT: ${input.question}`,
        `STANCE: ${input.stance}`,
        `THIS BEAT IS A ${input.step.beatKind.toUpperCase()}`,
        `BRIDGE KIND FOR THIS SEAM — realise this one: ${input.step.bridgeKind ?? "consequence"}`,
        input.ledger.length > 0
          ? "DETERMINATIONS ESTABLISHED SO FAR:\n" +
            input.ledger
              .map((d) => `  [${d.index}] ${d.determination}`)
              .join("\n")
          : "",
        input.revises.length > 0
          ? "REOPEN THESE — this beat must qualify, complicate or overturn them:\n" +
            input.revises
              .map((d) => `  [${d.index}] ${d.determination}`)
              .join("\n")
          : "",
        `WHAT THIS BEAT ADDS: ${input.step.determination}`,
        `HOW THE OBJECT LOOKS AFTERWARDS: ${input.step.changesTheObject}`,
        `BEAT ${input.index} of ${input.total}`,
        `SUBJECT: ${input.title}`,
        input.extract.trim().length > 200
          ? `THE ARTICLE (real; find the pressure this person or thing was under):
${input.extract}`
          : `ENCYCLOPEDIA SUMMARY (real; use its specifics):
${input.summary}`,
        `SCENE THE PLANNER WANTED: ${input.step.scene}`,
        `CONFIGURATION:
  substrate: ${input.substrate}
  institution: ${input.institution}
  self-understanding: ${input.selfUnderstanding}`,
        `ARISES FROM WHAT CAME BEFORE (${input.step.edgeType}): ${input.step.arisesFrom}`,
        input.step.carrier.trim()
          ? `THE CARRIER — narrate this as something that happened, do not summarise the change: ${input.step.carrier}
EVIDENCE FOR IT: ${input.step.carrierEvidence}`
          : "",
        input.step.inheritedPressure.trim()
          ? `PRESSURE INHERITED: ${input.step.inheritedPressure}
PRESSURE TRANSFORMED INTO: ${input.step.transformedPressure}`
          : "",
        input.step.forkAlternative.trim().length > 0
          ? `THE FORK — carry this in the paragraph: ${input.step.forkAlternative}. Had it gone that way: ${input.step.forkWhatWouldDiffer}`
          : "NO FORK for this beat — its subject's fork was carried on arrival.",
        input.step.someoneWanted.trim()
          ? `SOMEBODY WANTED: ${input.step.someoneWanted}
THEY TRIED: ${input.step.whatTheyTried}
WHAT HAPPENED INSTEAD: ${input.step.whatHappenedInstead}`
          : "",
        input.supporting.length > 0
          ? "ALSO LIVE — mention these without explaining them; seven of ten of Burke's mentions are a subject helping account for something else:\n" +
            input.supporting
              .map((x) => `  ${x.title}${x.firstMention ? " [first mention — introduce indefinitely]" : ""}: ${x.gloss}`)
              .join("\n")
          : "",
        `PARTICULAR TO USE: ${input.step.particular}`,
        `WORD BUDGET FOR THIS BEAT: ${input.step.words}`,
        input.step.entry.trim()
          ? `ENTRY — open with this, or close to it, then leave it behind:
${input.step.entry}`
          : "NO ENTRY CLAUSE — begin this beat cleanly; a cut is legitimate.",
        input.previousProse
          ? `PREVIOUS BEAT — continue from it:
${input.previousProse}`
          : "This is the opening beat. Begin in an ordinary scene.",
      ].join("\n\n"),
      schema: beatSchema,
      temperature: 0.85,
      maxTokens: 12000,
    });
  }
}

export class LlmRouteOracle implements RouteOracle {
  constructor(private readonly provider: LanguageModelProvider) {}

  async plan(input: Parameters<RouteOracle["plan"]>[0]) {
    const period =
      input.temporalStart !== null || input.temporalEnd !== null
        ? `PERIOD: ${input.temporalStart ?? "unbounded"} to ${input.temporalEnd ?? "unbounded"} (negative is BCE)`
        : "";
    return this.provider.generateStructured({
      promptId: "plan-route.v1",
      system: loadPrompt("plan-route.v1"),
      user: [
        `PROPOSITION: "${input.seed}"`,
        input.attention.trim() ? `ATTENTION:\n${input.attention}` : "",
        period,
        `WORD BUDGET: about ${input.targetWords} words in total.`,
        `NUMBER OF BEATS: exactly ${input.stepTarget}, of roughly ${Math.round(input.targetWords / Math.max(1, input.stepTarget))} words each — vary them.`,
        `CAST SIZE: aim for about ${Math.max(5, Math.round(input.stepTarget * 0.6))} subjects, so that several hold the floor for more than one beat.`,
        `DENSITY: ${input.density}`,
        input.thesis.trim() ? `THESIS THE PIECE ARGUES: ${input.thesis}` : "",
        input.namedConnections.length > 0
          ? "NAMED CONNECTIONS — the material left at the scene; sniff outward from these rather than merely covering them:\n" +
            input.namedConnections.map((c) => `  · ${c}`).join("\n")
          : "NAMED CONNECTIONS: none given — the search must do the work.",
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: routePlanSchema,
      temperature: 0.9,
      maxTokens: 60000,
    });
  }

  async checkBeat(input: { prose: string }) {
    return this.provider.generateStructured({
      promptId: "check-beat.v1",
      system: loadPrompt("check-beat.v1"),
      user: `THE PARAGRAPH:\n${input.prose}`,
      schema: beatCheckSchema,
      temperature: 0.1,
      maxTokens: 4000,
    });
  }

  async revisePlan(input: {
    plan: unknown;
    command: string;
    targetWords: number;
    stepTarget: number;
  }) {
    return this.provider.generateStructured({
      promptId: "revise-plan.v1",
      system: loadPrompt("revise-plan.v1"),
      user: [
        `THE WRITER'S COMMAND:\n${input.command}`,
        `WORD BUDGET: about ${input.targetWords} words. BEATS: about ${input.stepTarget}.`,
        `CURRENT PLAN:\n${JSON.stringify(input.plan, null, 1).slice(0, 30000)}`,
      ].join("\n\n"),
      schema: routePlanSchema,
      temperature: 0.8,
      maxTokens: 60000,
    });
  }

  async specifySubject(input: {
    title: string;
    extract: string;
    role: string;
    seed: string;
  }) {
    return this.provider.generateStructured({
      promptId: "specify-subject.v1",
      system: loadPrompt("specify-subject.v1"),
      user: [
        `SUBJECT (a survey to descend from): ${input.title}`,
        `ITS ROLE IN THE ROUTE: ${input.role}`,
        `THE ROUTE IS BUILDING TOWARD: "${input.seed}"`,
        `THE ARTICLE:
${input.extract.slice(0, 12000)}`,
      ].join("\n\n"),
      schema: specifyVerdictSchema,
      temperature: 0.4,
      maxTokens: 8000,
    });
  }

  async verifyCarrier(input: {
    prevTitle: string;
    prevExtract: string;
    nextTitle: string;
    nextExtract: string;
    claimed: string;
    claimedEvidence: string;
    changedEnvironment: string;
    extraArticles?: Array<{ title: string; extract: string }>;
  }) {
    return this.provider.generateStructured({
      promptId: "verify-carrier.v1",
      system: loadPrompt("verify-carrier.v1"),
      user: [
        `FROM: ${input.prevTitle}`,
        `TO: ${input.nextTitle}`,
        `WHAT THE FIRST SUBJECT LEFT CHANGED IN THE WORLD: ${input.changedEnvironment}`,
        `CLAIMED CARRIER: ${input.claimed}`,
        `CLAIMED EVIDENCE: ${input.claimedEvidence}`,
        `ARTICLE ON ${input.prevTitle}:
${input.prevExtract.slice(0, 9000)}`,
        `ARTICLE ON ${input.nextTitle}:
${input.nextExtract.slice(0, 9000)}`,
        ...(input.extraArticles ?? []).map(
          (x) => `INTERMEDIARY ARTICLE, fetched at your request — ${x.title}:
${x.extract.slice(0, 8000)}`,
        ),
      ].join("\n\n"),
      schema: carrierVerdictSchema,
      temperature: 0.2,
      maxTokens: 8000,
    });
  }

  async expandDwell(input: {
    title: string;
    extract: string;
    baseStep: { arisesFrom: string; carrier: string; determination: string };
    phases: number;
    objectOfInquiry: string;
    seed: string;
  }) {
    const result = await this.provider.generateStructured({
      promptId: "expand-dwell.v1",
      system: loadPrompt("expand-dwell.v1"),
      user: [
        `SUBJECT: ${input.title}`,
        `PHASES REQUESTED: ${input.phases}`,
        `OBJECT OF INQUIRY: ${input.objectOfInquiry}`,
        `THE ROUTE IS BUILDING TOWARD: "${input.seed}"`,
        `THE SEAM THAT BROUGHT US HERE (first phase begins from this): ${input.baseStep.carrier}`,
        `WHAT THE STAY MUST ESTABLISH OVERALL: ${input.baseStep.determination}`,
        `THE ARTICLE:
${input.extract.slice(0, 14000)}`,
      ].join("\n\n"),
      schema: dwellExpansionSchema,
      temperature: 0.6,
      maxTokens: 16000,
    });
    return result.phases;
  }

  async repair(input: { failures: Array<{ step: { pageTitle: string; bearsOnSeed: string }; candidates: string[] }> }) {
    const result = await this.provider.generateStructured({
      promptId: "plan-route.v1",
      system:
        "Some planned steps name Wikipedia pages that do not exist. For each," +
        " choose a replacement from the candidate titles that were actually" +
        " found, keeping the step's role in the route. Choose the most" +
        " concrete candidate. If none fits, do not replace it.",
      user: input.failures
        .map(
          (f) =>
            `MISSING: ${f.step.pageTitle}\n  role: ${f.step.bearsOnSeed}\n  candidates: ${f.candidates.join(", ") || "(none found)"}`,
        )
        .join("\n\n"),
      schema: repairSchema,
      temperature: 0.2,
      maxTokens: 8000,
    });
    return result.replacements;
  }
}
