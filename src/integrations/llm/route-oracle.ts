import type { RouteOracle, ScriptOracle } from "@/domain/route/types";
import { beatSchema, routePlanSchema } from "@/schemas/route";
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
    return this.provider.generateStructured({
      promptId: "write-beat.v1",
      system: loadPrompt("write-beat.v1"),
      user: [
        `THE ROUTE IS BUILDING TOWARD: "${input.seed}"`,
        `BEAT ${input.index} of ${input.total}`,
        `SUBJECT: ${input.title}`,
        `ENCYCLOPEDIA SUMMARY (real; use its specifics):
${input.summary}`,
        `SCENE THE PLANNER WANTED: ${input.step.scene}`,
        `CONFIGURATION:
  substrate: ${input.step.substrate}
  institution: ${input.step.institution}
  self-understanding: ${input.step.selfUnderstanding}`,
        `ARISES FROM WHAT CAME BEFORE (${input.step.edgeType}): ${input.step.arisesFrom}`,
        `THE FORK — carry this in the paragraph: ${input.step.forkAlternative}. Had it gone that way: ${input.step.forkWhatWouldDiffer}`,
        `PARTICULAR TO USE: ${input.step.particular}`,
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
        `Aim for about ${input.stepTarget} steps.`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: routePlanSchema,
      temperature: 0.9,
      maxTokens: 40000,
    });
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
