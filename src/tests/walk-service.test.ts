import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/server/db";
import { createProject } from "@/server/projects";
import { getWalk, startWalk } from "@/server/walks";
import { FixtureWikipediaGateway } from "@/integrations/wikipedia/fixture-gateway";
import { walkConfigurationSchema } from "@/schemas/walk-configuration";

// End-to-end walk service test against a real temp database and the fixture
// gateway: start a walk job, wait for it to settle, and verify persistence
// and same-seed reproducibility.

let dir: string;
let db: PrismaClient;

const fixtureFactory = (_language: string, budget: number) =>
  new FixtureWikipediaGateway(undefined, budget);

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
