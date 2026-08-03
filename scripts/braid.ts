/**
 * Braid a BurkeCluster walk from the terminal.
 *
 *   npm run braid -- --list                  which projects have a walk
 *   npm run braid -- --plan                  the topic sequence, no model calls
 *   npm run braid -- --plan --trace          plus how the walk got there
 *   npm run braid -- --compose               write it (costs Gemini calls)
 *   npm run braid -- --project <id> --plan --live 16 --topic-beats 2
 *
 * `--plan` is the fast loop: it reads the stored run, builds the beat plan,
 * and prints what each beat would be about without writing a word. Tuning
 * the shape does not need to cost anything.
 *
 * `--trace` prints the walk's own route — seed, accepted subjects, and the
 * deficiency that motivated each pivot — because when a composition reads as
 * unrelated to the seed, the question is almost always where the WALK went,
 * not how the braid rendered it.
 */

import "dotenv/config";
import { composeBraid } from "@/domain/braid/compose";
import { planBraid, type BraidSource } from "@/domain/braid/plan";
import { BRAID_DEFAULTS, type BraidPlanConfig } from "@/domain/braid/types";
import type { BurkeClusterState } from "@/domain/burkecluster/types";
import { createPrismaClient } from "@/server/db";
import { createBraidOracle } from "@/server/oracle-factory";

interface Args {
  list: boolean;
  plan: boolean;
  compose: boolean;
  trace: boolean;
  project?: string;
  config: BraidPlanConfig;
  full: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    list: false,
    plan: false,
    compose: false,
    trace: false,
    full: false,
    config: { ...BRAID_DEFAULTS },
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--list": args.list = true; break;
      case "--plan": args.plan = true; break;
      case "--compose": args.compose = true; break;
      case "--trace": args.trace = true; break;
      case "--full": args.full = true; break;
      case "--project": args.project = value; i++; break;
      case "--topic-beats": args.config.topicBeats = Number(value); i++; break;
      case "--live": args.config.liveTarget = Number(value); i++; break;
      case "--plant-lead": args.config.plantLead = Number(value); i++; break;
      case "--tail": args.config.tailBeats = Number(value); i++; break;
      default:
        if (flag.startsWith("--")) {
          throw new Error(`Unknown flag ${flag}`);
        }
    }
  }
  if (!args.list && !args.plan && !args.compose) args.plan = true;
  return args;
}

const rule = (label: string) =>
  console.log(`\n── ${label} ${"─".repeat(Math.max(0, 66 - label.length))}`);

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const db = createPrismaClient();

  try {
    const runs = await db.burkeClusterRun.findMany({
      orderBy: { createdAt: "desc" },
      include: { project: true },
    });

    if (args.list || runs.length === 0) {
      rule("BurkeCluster runs");
      if (runs.length === 0) {
        console.log("None. Run a BurkeCluster walk first.");
        return;
      }
      for (const run of runs) {
        const state = JSON.parse(run.state) as BurkeClusterState;
        console.log(
          `${run.projectId}  ${run.project.title}\n` +
            `   seed "${state.seed.rawInput}" · ${state.acceptedClusters.length} subjects` +
            ` · ${run.endReason.replaceAll("_", " ").toLowerCase()}` +
            ` · braided: ${run.braid ? "yes" : "no"}`,
        );
      }
      if (args.list) return;
    }

    const run = args.project
      ? runs.find((r) => r.projectId === args.project)
      : runs[0];
    if (!run) throw new Error(`No BurkeCluster run for project ${args.project}`);

    const state = JSON.parse(run.state) as BurkeClusterState;
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
    const seedLabel = state.currentSubject?.label ?? state.seed.rawInput;

    rule(`${run.project.title} — seed "${state.seed.rawInput}"`);
    console.log(
      `stored pages ${nodes.length} · accepted subjects ${state.acceptedClusters.length}` +
        ` · cycles ${state.cycles.length}`,
    );

    if (args.trace) {
      rule("What the walk did");
      console.log(`seed region: ${state.seed.resolvedPages.map((p) => p.title).join(", ")}`);
      state.acceptedClusters.forEach((c, i) => {
        const into = state.transitions.find((t) => t.toSubjectId === c.subject.id);
        console.log(`\n[${i + 1}] ${c.subject.label}`);
        console.log(`    pages: ${(c.subject.constitutivePages ?? []).join(", ")}`);
        if (into) {
          console.log(`    because: ${into.incipit.deficiencyStatement}`);
          console.log(`    latent:  ${into.incipit.whyLatentInPreviousNarration}`);
        }
      });
    }

    const plan = planBraid(source, args.config);
    rule("Plan");
    console.log(JSON.stringify(plan.diagnostics, null, 1));
    console.log(
      `\nconfig: topicBeats ${args.config.topicBeats} · live ${args.config.liveTarget}` +
        ` · plantLead ${args.config.plantLead} · tail ${args.config.tailBeats}`,
    );

    rule("Topic sequence");
    for (const beat of plan.beats) {
      const entry = plan.live.get(beat.topicSubjectId)!;
      const arc = plan.arcs.get(beat.topicSubjectId);
      const planted = beat.plantedSubjectIds
        .map((id) => plan.live.get(id)?.subject.label)
        .filter(Boolean);
      console.log(
        `${String(beat.index).padStart(3)}. ${entry.subject.label}` +
          (arc ? `   [${arc.slice(0, 40)}]` : "") +
          (planted.length ? `\n      plants: ${planted.join(", ")}` : ""),
      );
    }

    if (!args.compose) {
      console.log(
        `\n${plan.beats.length} beats planned. Add --compose to write them.`,
      );
      return;
    }

    rule("Composing");
    const { composition } = await composeBraid({
      source,
      oracle: createBraidOracle(),
      config: args.config,
      seedLabel,
      onProgress: (beat, total) =>
        process.stdout.write(`\r  beat ${beat}/${total}   `),
    });
    console.log("\n");

    for (const beat of composition.beats) {
      console.log(`\n[${beat.index}] ${beat.topicLabel}`);
      console.log(args.full ? beat.prose : beat.prose.slice(0, 400));
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
          config: args.config,
          composition,
          createdAt: new Date().toISOString(),
        }),
      },
    });
    console.log(`\nSaved to project ${run.projectId}.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
