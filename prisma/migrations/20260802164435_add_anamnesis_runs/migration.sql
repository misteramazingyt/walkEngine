-- CreateTable
CREATE TABLE "AnamnesisRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "state" TEXT NOT NULL,
    "mediations" TEXT NOT NULL,
    "recollectionTests" TEXT NOT NULL DEFAULT '[]',
    "composition" TEXT,
    "abandonedRoutes" TEXT NOT NULL DEFAULT '[]',
    "endReason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnamnesisRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WalkProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BurkeRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "storyState" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "checkpoints" TEXT NOT NULL,
    "coherenceReports" TEXT NOT NULL DEFAULT '[]',
    "narrative" TEXT,
    "rejectedRoutes" TEXT NOT NULL DEFAULT '[]',
    "backtrackCount" INTEGER NOT NULL DEFAULT 0,
    "endReason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BurkeRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WalkProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BurkeRun" ("backtrackCount", "checkpoints", "coherenceReports", "createdAt", "endReason", "id", "narrative", "notes", "projectId", "rejectedRoutes", "storyState") SELECT "backtrackCount", "checkpoints", "coherenceReports", "createdAt", "endReason", "id", "narrative", "notes", "projectId", "rejectedRoutes", "storyState" FROM "BurkeRun";
DROP TABLE "BurkeRun";
ALTER TABLE "new_BurkeRun" RENAME TO "BurkeRun";
CREATE INDEX "BurkeRun_projectId_createdAt_idx" ON "BurkeRun"("projectId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AnamnesisRun_projectId_createdAt_idx" ON "AnamnesisRun"("projectId", "createdAt");
