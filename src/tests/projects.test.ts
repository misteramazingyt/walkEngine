import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/server/db";
import {
  createProject,
  getProject,
  listProjects,
  updateProject,
} from "@/server/projects";
import { defaultWalkConfiguration } from "@/schemas/walk-configuration";

// Round-trip persistence tests against a real (temporary) SQLite database:
// the Phase 1 acceptance criterion is that a project can be created and
// reopened.

let dir: string;
let db: PrismaClient;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "motif-walk-test-"));
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

describe("project persistence", () => {
  it("creates a project with defaulted configuration and reopens it", async () => {
    const created = await createProject({ title: "Touchstone to radar" }, db);
    expect(created.id).toBeTruthy();
    expect(created.status).toBe("DRAFT");
    expect(created.configuration).toEqual(defaultWalkConfiguration());

    const reopened = await getProject(created.id, db);
    expect(reopened).not.toBeNull();
    expect(reopened).toEqual(created);
  });

  it("lists projects most recently updated first", async () => {
    const a = await createProject({ title: "First" }, db);
    const b = await createProject({ title: "Second" }, db);
    await updateProject(a.id, { title: "First (renamed)" }, db);

    const projects = await listProjects(db);
    const ids = projects.map((p) => p.id);
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
  });

  it("persists configuration edits and mirrors mode and seed columns", async () => {
    const created = await createProject({ title: "Config edits" }, db);
    const configuration = {
      ...created.configuration,
      walkMode: "CRITERIOLOGICAL" as const,
      seed: "edited-seed",
      walkLength: 20,
      criteriaWeights: {
        ...created.configuration.criteriaWeights,
        motifAffinity: 5,
      },
    };

    const updated = await updateProject(created.id, { configuration }, db);
    expect(updated?.mode).toBe("CRITERIOLOGICAL");
    expect(updated?.seed).toBe("edited-seed");

    const reopened = await getProject(created.id, db);
    expect(reopened?.configuration.walkLength).toBe(20);
    expect(reopened?.configuration.criteriaWeights.motifAffinity).toBe(5);
  });

  it("returns null for a missing project instead of inventing one", async () => {
    expect(await getProject("does-not-exist", db)).toBeNull();
    expect(await updateProject("does-not-exist", { title: "x" }, db)).toBeNull();
  });

  it("rejects invalid input instead of coercing it", async () => {
    await expect(createProject({ title: "" }, db)).rejects.toThrow();
    const created = await createProject({ title: "Invalid patch" }, db);
    await expect(
      updateProject(
        created.id,
        {
          configuration: {
            ...created.configuration,
            walkLength: -3,
          },
        },
        db,
      ),
    ).rejects.toThrow();
  });
});
