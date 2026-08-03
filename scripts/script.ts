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
import { allocateBeats, assignBridgeKinds, computeLiveness } from "@/domain/route/braid";
import { RequestBudget } from "@/domain/walk/types";
import { WikipediaGateway } from "@/integrations/wikipedia/gateway";
import { GeminiProvider } from "@/integrations/gemini/provider";
import { LlmRouteOracle, LlmScriptOracle } from "@/integrations/llm/route-oracle";
import type { RoutePlan } from "@/domain/route/types";
import { createBriefOracle } from "@/server/oracle-factory";

const rule = (label: string) =>
  console.log(`\n── ${label} ${"─".repeat(Math.max(0, 64 - label.length))}`);

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let planOnly = false;
  let steps = 0;
  let words = 0;
  let out2 = "drafts/script.md";
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--plan-only") planOnly = true;
    else if (argv[i] === "--steps") steps = Number(argv[++i]);
    else if (argv[i] === "--words") words = Number(argv[++i]);
    else if (argv[i] === "--out") out2 = argv[++i];
    else if (argv[i] === "--brief-file") rest.push(readFileSync(argv[++i], "utf8"));
    else rest.push(argv[i]);
  }
  const brief = rest.join(" ").trim();
  if (!brief) throw new Error('Give a brief: npm run script -- "…"');

  rule("Brief");
  console.log(brief);

  const parsed = await createBriefOracle().parse({ brief });

  // The brief's own numbers win unless a flag overrides them. Beat count is\n// derived from the budget at Burke's median paragraph length rather than
  // set independently: asking for 1950 words in 18 beats and for beats of
  // 102 words are the same request, and only one of them can be honoured.
  const targetWords = words || parsed.targetWords || 1800;
  const stepTarget = steps || Math.max(6, Math.min(30, Math.round(targetWords / 115)));

  rule("Read as");
  console.log(parsed.reading);
  console.log(
    `\nlength:  ${targetWords} words in about ${stepTarget} beats` +
      `\ndensity: ${parsed.density}` +
      (parsed.thesis ? `\nthesis:  ${parsed.thesis}` : ""),
  );
  if (parsed.namedConnections.length > 0) {
    console.log("\nconnections already given:");
    for (const c of parsed.namedConnections) console.log(`  · ${c}`);
  }

  const provider = new GeminiProvider();
  const routeOracle = new LlmRouteOracle(provider);
  const scriptOracle = new LlmScriptOracle(provider);

  rule("Planning the route");
  const plan: RoutePlan = await routeOracle.plan({
    seed: parsed.seedText,
    attention: parsed.attentionProgram,
    temporalStart: parsed.temporalStart,
    temporalEnd: parsed.temporalEnd,
    stepTarget,
    targetWords,
    density: parsed.density,
    namedConnections: parsed.namedConnections,
    thesis: parsed.thesis,
  });
  console.log(`${plan.title}\n\n${plan.thesis}\n`);

  rule("Verifying against Wikipedia");
  const gateway = new WikipediaGateway("en", new RequestBudget(400));
  const verified = await verifyRoute({ plan, wikipedia: gateway, oracle: routeOracle });
  console.log(
    `${verified.subjects.size} of ${plan.cast.length} cast verified` +
      ` · ${verified.repaired.length} repaired · ${verified.dropped.length} dropped` +
      ` · ${gateway.requestsUsed()} requests`,
  );
  for (const r of verified.repaired) console.log(`  repaired ${r.from} → ${r.to}`);
  for (const d of verified.dropped) console.log(`  dropped ${d.pageTitle} — ${d.reason}`);

  // Beats whose subject did not survive verification cannot be written.
  plan.steps = plan.steps.filter((st) => verified.subjects.has(st.subjectId));
  if (plan.steps.length === 0) throw new Error("No beats survived verification");

  // Beats earned per subject, from incident and causal work. The planner's
  // own beat list is reshaped to match: it reliably gives almost every beat
  // a different subject when asked for a proportion, so the proportion is
  // computed and the beats redistributed rather than requested.
  const allocation = allocateBeats(plan, plan.steps.length);
  const reshaped: typeof plan.steps = [];
  const order: string[] = [];
  for (const st of plan.steps) if (!order.includes(st.subjectId)) order.push(st.subjectId);
  for (const id of order) {
    const source = plan.steps.filter((st) => st.subjectId === id);
    const want = allocation.get(id) ?? 1;
    for (let k = 0; k < want; k++) {
      reshaped.push({ ...source[Math.min(k, source.length - 1)] });
    }
  }
  plan.steps = reshaped.slice(0, Math.max(4, plan.steps.length));

  rule("Beats earned");
  for (const id of order) {
    const m = plan.cast.find((c) => c.id === id);
    if (!m) continue;
    console.log(
      `  ${(verified.subjects.get(id)?.title ?? id).slice(0, 34).padEnd(36)}` +
        `${allocation.get(id) ?? 1} beats · ${m.incidents} incidents` +
        `${m.producesSubjectId ? " · produces next" : ""}`,
    );
  }

  assignBridgeKinds(plan);
  const braid = computeLiveness(plan, { liveTarget: 12 });

  rule("Object of inquiry");
  console.log(
    `${plan.objectOfInquiry}

question: ${plan.question}
stance:   ${plan.stance}`,
  );
  console.log(`
before: ${plan.openingUnderstanding}`);
  console.log(`after:  ${plan.closingUnderstanding}`);

  rule("Braid");
  console.log(JSON.stringify(braid.diagnostics, null, 1));

  rule("Beats");
  plan.steps.forEach((st, i) => {
    const subj = verified.subjects.get(st.subjectId)!;
    const support = braid.supportingAt[i]
      .map((id) => verified.subjects.get(id)?.title)
      .filter(Boolean);
    console.log(`${String(i + 1).padStart(3)}. ${subj.title}  [${st.beatKind}]`);
    console.log(`      ${st.bridgeKind} · with: ${support.join(", ") || "—"}`);
  });

  if (planOnly) {
    console.log("\nDrop --plan-only to write it.");
    return;
  }

  rule("Writing");
  const beats: Array<{ title: string; prose: string; kind: string }> = [];
  const ledger: Array<{ index: number; determination: string }> = [];
  const introduced = new Set<string>();
  let previous = "";
  for (let i = 0; i < plan.steps.length; i++) {
    const st = plan.steps[i];
    const subj = verified.subjects.get(st.subjectId)!;
    process.stderr.write(`
  beat ${i + 1}/${plan.steps.length}   `);
    const revises = st.revises
      .map((n) => ledger.find((d) => d.index === n))
      .filter((d): d is { index: number; determination: string } => !!d);
    const supporting = braid.supportingAt[i]
      .map((id) => verified.subjects.get(id))
      .filter((v): v is NonNullable<typeof v> => !!v)
      .map((v) => ({
        title: v.title,
        gloss: v.gloss,
        firstMention: !introduced.has(v.title),
      }));
    const out = await scriptOracle.writeBeat({
      index: i + 1,
      total: plan.steps.length,
      seed: parsed.seedText,
      step: st,
      title: subj.title,
      summary: subj.summary,
      previousProse: previous,
      objectOfInquiry: plan.objectOfInquiry,
      question: plan.question,
      stance: plan.stance,
      ledger: [...ledger],
      revises,
      supporting,
      substrate: subj.substrate,
      institution: subj.institution,
      selfUnderstanding: subj.selfUnderstanding,
    });
    for (const sup of supporting) introduced.add(sup.title);
    introduced.add(subj.title);
    ledger.push({ index: i + 1, determination: st.determination });
    beats.push({ title: subj.title, prose: out.prose, kind: st.beatKind });
    previous = out.prose;
  }
  process.stderr.write("    clearing    ");

  const written = beats.reduce((n, b) => n + b.prose.split(/\s+/).length, 0);
  const revisions = plan.steps.reduce(
    (n, st, i) => n + st.revises.filter((r) => r < i + 1).length,
    0,
  );

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
    `*${written} words · ${plan.steps.length} beats over ${braid.diagnostics.topicHolders} subjects ` +
      `(${braid.diagnostics.meanBeatsPerTopicSubject} beats each) · ` +
      `${braid.diagnostics.medianLiveAtOnce} live at once · ` +
      `${braid.diagnostics.carriedSeamsPct}% of seams carry the subject forward · ` +
      `${revisions} revisions.*`,
    "",
  ];
  beats.forEach((b, i) => {
    const mark = b.kind === "advance" ? "" : ` · ${b.kind}`;
    lines.push(`### ${i + 1}. ${b.title}${mark}`, "", b.prose, "");
  });
  lines.push("---", "", plan.closing);
  mkdirSync("drafts", { recursive: true });
  writeFileSync(out2, lines.join("\n"), "utf8");

  for (const b of beats) console.log(`\n### ${b.title}\n\n${b.prose}`);
  console.log(`\nWritten to ${out2}`);
}

main().catch((e) => {
  console.error(`
${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
