/**
 * Write a script from a brief, planning before sampling.
 *
 *   npm run script -- "the meaning of life is exactly what you make it..."
 *   npm run script -- --plan-only "…"      the route, no prose
 *   npm run script -- --steps 20 "…"
 *
 * The existing walk modes discover by crawling links, and their prose reads
 * like a crawl because adjacency is the only relation a crawl can see. Here
 * the route is planned first, verified against Wikipedia, and only then
 * written — so a step is in the script because it belongs in the argument,
 * not because it was reachable.
 */

import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { verifyRoute } from "@/domain/route/verify";
import { RequestBudget } from "@/domain/walk/types";
import { WikipediaGateway } from "@/integrations/wikipedia/gateway";
import { GeminiProvider } from "@/integrations/gemini/provider";
import { LlmRouteOracle, LlmScriptOracle } from "@/integrations/llm/route-oracle";
import { createBriefOracle } from "@/server/oracle-factory";

const rule = (label: string) =>
  console.log(`\n── ${label} ${"─".repeat(Math.max(0, 64 - label.length))}`);

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let planOnly = false;
  let steps = 18;
  let out = "drafts/script.md";
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--plan-only") planOnly = true;
    else if (argv[i] === "--steps") steps = Number(argv[++i]);
    else if (argv[i] === "--out") out = argv[++i];
    else if (argv[i] === "--brief-file") rest.push(readFileSync(argv[++i], "utf8"));
    else rest.push(argv[i]);
  }
  const brief = rest.join(" ").trim();
  if (!brief) throw new Error('Give a brief: npm run script -- "…"');

  rule("Brief");
  console.log(brief);

  const parsed = await createBriefOracle().parse({ brief });
  rule("Read as");
  console.log(parsed.reading);

  const provider = new GeminiProvider();
  const routeOracle = new LlmRouteOracle(provider);
  const scriptOracle = new LlmScriptOracle(provider);

  rule("Planning the route");
  const plan = await routeOracle.plan({
    seed: parsed.seedText,
    attention: parsed.attentionProgram,
    temporalStart: parsed.temporalStart,
    temporalEnd: parsed.temporalEnd,
    stepTarget: steps,
  });
  console.log(`${plan.title}\n\n${plan.thesis}\n`);

  rule("Verifying against Wikipedia");
  const gateway = new WikipediaGateway("en", new RequestBudget(400));
  const verified = await verifyRoute({ plan, wikipedia: gateway, oracle: routeOracle });
  console.log(
    `${verified.steps.length} of ${plan.steps.length} steps verified` +
      ` · ${verified.repaired.length} repaired · ${verified.dropped.length} dropped` +
      ` · ${gateway.requestsUsed()} requests`,
  );
  for (const r of verified.repaired) console.log(`  repaired ${r.from} → ${r.to}`);
  for (const d of verified.dropped) console.log(`  dropped ${d.pageTitle} — ${d.reason}`);

  rule("Object of inquiry");
  console.log(`${plan.objectOfInquiry}

question: ${plan.question}
stance:   ${plan.stance}`);
  console.log(`
before: ${plan.openingUnderstanding}`);
  console.log(`after:  ${plan.closingUnderstanding}`);

  rule("Route");
  verified.steps.forEach((v, i) => {
    const rev = v.step.revises.length ? ` revises ${v.step.revises.join(",")}` : "";
    console.log(
      `${String(i + 1).padStart(3)}. ${v.title}   [${v.step.beatKind}/${v.step.edgeType}]${rev}`,
    );
    console.log(`      + ${v.step.determination}`);
  });

  if (planOnly) {
    console.log("\nDrop --plan-only to write it.");
    return;
  }

  rule("Writing");
  const beats: Array<{ title: string; prose: string; kind: string }> = [];
  const ledger: Array<{ index: number; determination: string }> = [];
  let previous = "";
  for (let i = 0; i < verified.steps.length; i++) {
    const v = verified.steps[i];
    process.stderr.write(`\r  beat ${i + 1}/${verified.steps.length}   `);
    // Only determinations already established are visible: a beat cannot
    // lean on one the reader has not been given yet.
    const revises = v.step.revises
      .map((n) => ledger.find((d) => d.index === n))
      .filter((d): d is { index: number; determination: string } => !!d);
    const written = await scriptOracle.writeBeat({
      index: i + 1,
      total: verified.steps.length,
      seed: parsed.seedText,
      step: v.step,
      title: v.title,
      summary: v.summary,
      previousProse: previous,
      objectOfInquiry: plan.objectOfInquiry,
      question: plan.question,
      stance: plan.stance,
      ledger: [...ledger],
      revises,
    });
    ledger.push({ index: i + 1, determination: v.step.determination });
    beats.push({ title: v.title, prose: written.prose, kind: v.step.beatKind });
    previous = written.prose;
  }
  process.stderr.write("\r                 \r");

  // Accretion depth: how often a beat reopens an earlier determination.
  // Burke's equivalent is 2.3%, which is the measurement of his not doing it.
  const revisions = verified.steps.reduce((n, v) => n + v.step.revises.length, 0);
  const depth = revisions / Math.max(1, verified.steps.length);

  const lines = [
    `# ${plan.title}`,
    "",
    `*${plan.thesis}*`,
    "",
    `**Object of inquiry:** ${plan.objectOfInquiry}`,
    "",
    `**Question:** ${plan.question}  ·  **Stance:** ${plan.stance}`,
    "",
    `**Before:** ${plan.openingUnderstanding}`,
    "",
    `**After:** ${plan.closingUnderstanding}`,
    "",
    `*${revisions} revisions of earlier determinations across ${verified.steps.length} beats — accretion depth ${depth.toFixed(2)}.*`,
    "",
  ];
  beats.forEach((b, i) => {
    const mark = b.kind === "advance" ? "" : ` · ${b.kind}`;
    lines.push(`### ${i + 1}. ${b.title}${mark}`, "", b.prose, "");
  });
  lines.push("---", "", plan.closing);
  mkdirSync("drafts", { recursive: true });
  writeFileSync(out, lines.join("\n"), "utf8");

  for (const b of beats) console.log(`\n### ${b.title}\n\n${b.prose}`);
  console.log(`\nWritten to ${out}`);
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
