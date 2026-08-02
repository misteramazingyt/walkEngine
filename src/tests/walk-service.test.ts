import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/server/db";
import { createProject } from "@/server/projects";
import { chooseCandidateWalk, getWalk, startWalk } from "@/server/walks";
import { FixtureWikipediaGateway } from "@/integrations/wikipedia/fixture-gateway";
import { RequestBudget } from "@/domain/walk/types";
import type { GatewayBundle } from "@/server/walk-gateway-factory";
import { walkConfigurationSchema } from "@/schemas/walk-configuration";

// End-to-end walk service test against a real temp database and the fixture
// gateway: start a walk job, wait for it to settle, and verify persistence
// and same-seed reproducibility.

let dir: string;
let db: PrismaClient;

const fixtureFactory = (_language: string, budgetLimit: number): GatewayBundle => {
  const budget = new RequestBudget(budgetLimit);
  const fixture = new FixtureWikipediaGateway(undefined, budget);
  return { wikipedia: fixture, entityFacts: fixture, budget };
};

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "motif-walk-svc-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, "../.."),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  db = createPrismaClient(url);
});

afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

async function waitForJobSettled(projectId: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const { latestJob } = await getWalk(projectId, db);
    if (latestJob && (latestJob.status === "COMPLETE" || latestJob.status === "FAILED")) {
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Walk job did not settle in time");
}

describe("walk service", () => {
  it("runs a walk job, persists source nodes, and updates project status", async () => {
    const project = await createProject(
      {
        title: "Fixture walk",
        configuration: walkConfigurationSchema.parse({
          seed: "svc-seed",
          walkLength: 6,
          branchFactor: 5,
          minArticleLength: 500,
          start: { kind: "TITLE", value: "Touchstone" },
        }),
      },
      db,
    );

    const started = await startWalk(project.id, { mode: "fresh" }, db, fixtureFactory);
    expect(started.ok).toBe(true);
    await waitForJobSettled(project.id);

    const { sourceNodes, latestJob } = await getWalk(project.id, db);
    expect(latestJob?.status).toBe("COMPLETE");
    expect(sourceNodes.length).toBe(6);
    expect(sourceNodes[0].title).toBe("Touchstone (assaying tool)");
    expect(sourceNodes.map((n) => n.visitIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const node of sourceNodes) {
      expect(node.url).toContain("wiki");
      expect(Array.isArray(node.categories)).toBe(true);
    }

    const updated = await db.walkProject.findUnique({ where: { id: project.id } });
    expect(updated?.status).toBe("WALK_READY");
    expect(updated?.startNodeId).toBe(sourceNodes[0].id);
  });

  it("same-seed regeneration reproduces the identical path", async () => {
    const project = await createProject(
      {
        title: "Reproducible walk",
        configuration: walkConfigurationSchema.parse({
          seed: "repro-seed",
          walkLength: 5,
          branchFactor: 5,
          minArticleLength: 500,
          start: { kind: "TITLE", value: "Coinage" },
        }),
      },
      db,
    );

    await startWalk(project.id, { mode: "fresh" }, db, fixtureFactory);
    await waitForJobSettled(project.id);
    const first = (await getWalk(project.id, db)).sourceNodes.map((n) => n.title);

    await startWalk(project.id, { mode: "same-seed" }, db, fixtureFactory);
    await waitForJobSettled(project.id);
    const second = (await getWalk(project.id, db)).sourceNodes.map((n) => n.title);

    expect(second).toEqual(first);
  });

  it("rejects a same-seed regeneration when no walk exists", async () => {
    const project = await createProject({ title: "No walk yet" }, db);
    const result = await startWalk(project.id, { mode: "same-seed" }, db, fixtureFactory);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });

  it("criteriological mode stores three candidate paths, and choosing one materializes it", async () => {
    const project = await createProject(
      {
        title: "Criteriological candidates",
        configuration: walkConfigurationSchema.parse({
          walkMode: "CRITERIOLOGICAL",
          seed: "cand-seed",
          walkLength: 5,
          branchFactor: 6,
          minArticleLength: 500,
          samplingMode: "WEIGHTED",
          criteriaWeights: { temporalContinuity: 4, visualizability: 3 },
          start: { kind: "TITLE", value: "Touchstone" },
        }),
      },
      db,
    );

    await startWalk(project.id, { mode: "fresh" }, db, fixtureFactory);
    await waitForJobSettled(project.id);

    const walk = await getWalk(project.id, db);
    expect(walk.latestJob?.status).toBe("COMPLETE");
    expect(walk.candidateWalks).toHaveLength(3);
    expect(walk.sourceNodes).toHaveLength(0); // nothing materialized yet
    expect(walk.candidateWalks.map((c) => c.label)).toEqual(["A", "B", "C"]);
    for (const candidate of walk.candidateWalks) {
      expect(candidate.titles[0]).toBe("Touchstone (assaying tool)");
      expect(candidate.titles.length).toBeGreaterThan(1);
      for (const value of Object.values(candidate.pathScore)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }

    const chosen = walk.candidateWalks[1];
    const result = await chooseCandidateWalk(project.id, chosen.id, db);
    expect(result.ok).toBe(true);

    const after = await getWalk(project.id, db);
    expect(after.sourceNodes.map((n) => n.title)).toEqual(chosen.titles);
    expect(after.candidateWalks.find((c) => c.id === chosen.id)?.chosen).toBe(true);
    // Scored hops carry their score and explanation into SourceNodes.
    for (const node of after.sourceNodes.slice(1)) {
      expect(node.rawWalkScore).not.toBeNull();
      const own = node.outgoingLinks.find((c) => c.title === node.title);
      expect(own?.why?.length).toBeGreaterThan(0);
    }

    const updated = await db.walkProject.findUnique({ where: { id: project.id } });
    expect(updated?.startNodeId).toBe(after.sourceNodes[0].id);
  });

  it("criteriological same-seed regeneration reproduces all three candidate paths", async () => {
    const project = await createProject(
      {
        title: "Criteriological repro",
        configuration: walkConfigurationSchema.parse({
          walkMode: "CRITERIOLOGICAL",
          seed: "cand-repro",
          walkLength: 4,
          branchFactor: 6,
          minArticleLength: 500,
          start: { kind: "TITLE", value: "Coinage" },
        }),
      },
      db,
    );

    await startWalk(project.id, { mode: "fresh" }, db, fixtureFactory);
    await waitForJobSettled(project.id);
    const first = (await getWalk(project.id, db)).candidateWalks.map((c) => c.titles);

    await startWalk(project.id, { mode: "same-seed" }, db, fixtureFactory);
    await waitForJobSettled(project.id);
    const second = (await getWalk(project.id, db)).candidateWalks.map((c) => c.titles);

    expect(second).toEqual(first);
  });

  it("BURKE mode persists source nodes and the Burke run (notes, salience, redescription)", async () => {
    const { FixtureBurkeOracle } = await import(
      "@/integrations/llm/fixture-burke-oracle"
    );
    const project = await createProject(
      {
        title: "Burke run",
        configuration: walkConfigurationSchema.parse({
          walkMode: "BURKE",
          seed: "burke-svc",
          branchFactor: 8,
          start: { kind: "TITLE", value: "Touchstone" },
          burke: {
            seedKind: "OBJECT",
            seedText: "AI slop is soulless.",
            priming: "authenticity, mechanism, reproduction, taste",
            motif: "",
            elasticityInterval: 3,
            maxPages: 7,
          },
        }),
      },
      db,
    );

    await startWalk(
      project.id,
      { mode: "fresh" },
      db,
      fixtureFactory,
      () => new FixtureBurkeOracle(),
    );
    await waitForJobSettled(project.id);

    const walk = await getWalk(project.id, db);
    expect(walk.latestJob?.status).toBe("COMPLETE");
    expect(walk.sourceNodes.length).toBeGreaterThan(1);
    expect(walk.burkeRun).not.toBeNull();
    expect(walk.burkeRun?.notes.length).toBe(walk.sourceNodes.length - 1);

    // The story state round-trips: theory, its versions, and the questions.
    const state = walk.burkeRun!.storyState;
    expect(state.currentTheory).not.toBe(state.theoryVersions[0].theory);
    expect(state.unresolvedQuestions.length).toBeGreaterThan(0);
    expect(state.curiosityProgram.mattersOfConcern.length).toBeGreaterThan(0);
    expect(walk.burkeRun?.narrative?.pivots.length).toBe(
      walk.burkeRun?.notes.length,
    );

    for (const note of walk.burkeRun?.notes ?? []) {
      expect(note.navigationQuestion).toBeTruthy();
      expect(note.claimEstablishedOrChallenged).toBeTruthy();
      expect(note.theoryBefore).not.toBe(note.theoryAfter);
    }

    // Candidate assessments persist as the per-node audit trail.
    const scored = walk.sourceNodes[1].outgoingLinks;
    expect(scored.some((c) => c.eligible && c.why && c.why.length > 0)).toBe(
      true,
    );
  });

  it("BURKE mode without a seed fails loudly", async () => {
    const { FixtureBurkeOracle } = await import(
      "@/integrations/llm/fixture-burke-oracle"
    );
    const project = await createProject(
      {
        title: "Burke without seed",
        configuration: walkConfigurationSchema.parse({
          walkMode: "BURKE",
          seed: "burke-noseed",
        }),
      },
      db,
    );
    await startWalk(
      project.id,
      { mode: "fresh" },
      db,
      fixtureFactory,
      () => new FixtureBurkeOracle(),
    );
    await waitForJobSettled(project.id);
    const walk = await getWalk(project.id, db);
    expect(walk.latestJob?.status).toBe("FAILED");
    expect(walk.latestJob?.error).toMatch(/seed/i);
  });

  it("marks the job FAILED when the start cannot be resolved", async () => {
    const project = await createProject(
      {
        title: "Bad start",
        configuration: walkConfigurationSchema.parse({
          seed: "bad-start",
          start: { kind: "TITLE", value: "Zzz-no-such-article-zzz" },
        }),
      },
      db,
    );
    await startWalk(project.id, { mode: "fresh" }, db, fixtureFactory);
    await waitForJobSettled(project.id);

    const { latestJob, sourceNodes } = await getWalk(project.id, db);
    expect(latestJob?.status).toBe("FAILED");
    expect(latestJob?.error).toBeTruthy();
    expect(sourceNodes).toHaveLength(0);

    const updated = await db.walkProject.findUnique({ where: { id: project.id } });
    expect(updated?.status).toBe("FAILED");
  });
});
