/**
 * Run a walk from a brief written in ordinary language.
 *
 *   npm run walk -- --dry "the meaning of life is exactly what you make it.
 *                          over a large time scale, pay attention to..."
 *   npm run walk -- "…brief…"                  parse, walk, then braid
 *   npm run walk -- --brief-file brief.txt
 *
 * `--dry` parses and prints the configuration without spending anything, so
 * a misreading is caught before a walk is paid for. The parse reports what
 * it could NOT express as well as what it could: an instruction the
 * configuration cannot represent is named rather than dropped.
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { composeBraid } from "@/domain/braid/compose";
import { planBraid, type BraidSource } from "@/domain/braid/plan";
import { BRAID_DEFAULTS } from "@/domain/braid/types";
import type { BurkeClusterState } from "@/domain/burkecluster/types";
import { walkConfigurationSchema } from "@/schemas/walk-configuration";
import { createPrismaClient } from "@/server/db";
import { createProject } from "@/server/projects";
import { createBraidOracle, createBriefOracle } from "@/server/oracle-factory";
import { getWalk, startWalk } from "@/server/walks";

const rule = (label: string) =>
  console.log(`\n── ${label} ${"─".repeat(Math.max(0, 66 - label.length))}`);

interface Args {
  brief: string;
  dry: boolean;
  title?: string;
  seed: string;
  requests: number;
  noBraid: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    brief: "",
    dry: false,
    seed: "motif-walk",
    requests: 800,
    noBraid: false,
  };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--dry": args.dry = true; break;
      case "--no-braid": args.noBraid = true; break;
      case "--title": args.title = value; i++; break;
      case "--seed": args.seed = value; i++; break;
      case "--requests": args.requests = Number(value); i++; break;
      case "--brief-file": args.brief = readFileSync(value, "utf8"); i++; break;
      default:
        if (flag.startsWith("--")) throw new Error(`Unknown flag ${flag}`);
        rest.push(flag);
    }
  }
  if (!args.brief) args.brief = rest.join(" ").trim();
  if (!args.brief) {
    throw new Error('Give a brief: npm run walk -- "…" (or --brief-file path)');
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  rule("Brief");
  console.log(args.brief);

  const parsed = await createBriefOracle().parse({ brief: args.brief });

  rule("Read as");
  console.log(parsed.reading);
  console.log(`\nseed:      ${parsed.seedText}`);
  console.log(`attention: ${parsed.attentionProgram}`);
  console.log(
    `period:    ${parsed.temporalStart ?? "unbounded"} to ${parsed.temporalEnd ?? "unbounded"}`,
  );
  console.log(`subjects:  ${parsed.subjectCount}`);
  if (parsed.unhonoured.length > 0) {
    rule("NOT expressible in the configuration");
    for (const item of parsed.unhonoured) console.log(`  · ${item}`);
  } else {
    console.log("\nEverything in the brief was expressible.");
  }

  const configuration = walkConfigurationSchema.parse({
    walkMode: "BURKECLUSTER",
    seed: args.seed,
    maxGraphRequests: args.requests,
    start: { kind: "LLM", value: "" },
    temporalBounds: { start: parsed.temporalStart, end: parsed.temporalEnd },
    burkeCluster: {
      seedText: parsed.seedText,
      attentionProgram: parsed.attentionProgram,
      minimumSubjectCount: Math.max(2, parsed.subjectCount - 1),
      maxSubjectDepth: parsed.subjectCount,
    },
  });

  if (args.dry) {
    rule("Configuration (not run)");
    console.log(
      JSON.stringify(
        {
          walkMode: configuration.walkMode,
          maxGraphRequests: configuration.maxGraphRequests,
          start: configuration.start,
          temporalBounds: configuration.temporalBounds,
          burkeCluster: {
            seedText: configuration.burkeCluster.seedText,
            minimumSubjectCount: configuration.burkeCluster.minimumSubjectCount,
            maxSubjectDepth: configuration.burkeCluster.maxSubjectDepth,
          },
        },
        null,
        1,
      ),
    );
    console.log("\nDrop --dry to run it.");
    return;
  }

  const db = createPrismaClient();
  try {
    const title = args.title ?? parsed.seedText.slice(0, 60);
    const project = await createProject({ title, configuration }, db);
    rule(`Walking — project ${project.id}`);

    const started = await startWalk(project.id, { mode: "fresh" }, db);
    if (!started.ok) throw new Error(started.error);

    let last = "";
    for (;;) {
      await new Promise((r) => setTimeout(r, 3000));
      const { latestJob } = await getWalk(project.id, db);
      if (!latestJob) continue;
      if (latestJob.currentStep && latestJob.currentStep !== last) {
        last = latestJob.currentStep;
        console.log(`  ${last}`);
      }
      if (latestJob.status === "FAILED") throw new Error(latestJob.error ?? "walk failed");
      if (latestJob.status === "COMPLETE") break;
    }

    const run = await db.burkeClusterRun.findFirst({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
    });
    if (!run) throw new Error("Walk completed but stored no cluster run");
    const state = JSON.parse(run.state) as BurkeClusterState;

    rule("Route");
    console.log(
      `seed region: ${state.seed.resolvedPages.map((p) => p.title).join(", ")}`,
    );
    state.acceptedClusters.forEach((c, i) => {
      const into = state.transitions.find((t) => t.toSubjectId === c.subject.id);
      console.log(`\n[${i + 1}] ${c.subject.label}`);
      if (into) {
        console.log(`    seed relation: ${into.incipit.seedQuestionRelation}`);
        console.log(`    fidelity:      ${into.incipit.seedFidelity}`);
      }
    });
    const refusedForSeed = state.rejectedSubjects.filter((r) =>
      /still answers the seed|illustration/.test(r.reason),
    );
    if (refusedForSeed.length > 0) {
      rule("Refused for leaving the seed");
      for (const r of refusedForSeed) console.log(`  ${r.label} — ${r.reason}`);
    }

    if (args.noBraid) return;

    const nodes = JSON.parse(run.graphNodes || "[]") as Array<{
      title: string;
      summary?: string;
    }>;
    const source: BraidSource = {
      state,
      pages: new Map(
        nodes.map((n) => [n.title, { title: n.title, summary: n.summary ?? "" }]),
      ),
    };

    const plan = planBraid(source, BRAID_DEFAULTS);
    rule("Beat sheet");
    for (const beat of plan.beats) {
      const entry = plan.live.get(beat.topicSubjectId)!;
      const arc = plan.arcs.get(beat.topicSubjectId);
      const plants = beat.plantedSubjectIds
        .map((id) => plan.live.get(id)?.subject.label)
        .filter(Boolean);
      console.log(
        `${String(beat.index).padStart(3)}. ${entry.subject.label}` +
          (arc ? `   [${arc.slice(0, 44)}]` : ""),
      );
      if (plants.length) console.log(`      plants: ${plants.join(", ")}`);
    }
    console.log(`\n${JSON.stringify(plan.diagnostics)}`);

    rule("Draft 0");
    const { composition } = await composeBraid({
      source,
      oracle: createBraidOracle(),
      config: BRAID_DEFAULTS,
      seedLabel: state.currentSubject?.label ?? parsed.seedText,
      onProgress: (beat, total) => {
        process.stderr.write(`\r  writing ${beat}/${total}   `);
      },
    });
    process.stderr.write("\r                    \r");

    for (const beat of composition.beats) {
      console.log(`\n### ${beat.index}. ${beat.topicLabel}\n`);
      console.log(beat.prose);
    }
    if (composition.notes.length > 0) {
      rule("Where the writing left the plan");
      for (const note of composition.notes) console.log(`  ${note}`);
    }

    await db.burkeClusterRun.update({
      where: { id: run.id },
      data: {
        braid: JSON.stringify({
          diagnostics: plan.diagnostics,
          config: BRAID_DEFAULTS,
          composition,
          createdAt: new Date().toISOString(),
        }),
      },
    });
    console.log(`\nProject ${project.id}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
