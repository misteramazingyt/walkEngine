-- CreateTable
CREATE TABLE "BurkeClusterRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "randomSeed" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "narrative" TEXT,
    "transitionTable" TEXT NOT NULL DEFAULT '[]',
    "graphNodes" TEXT NOT NULL DEFAULT '[]',
    "graphEdges" TEXT NOT NULL DEFAULT '[]',
    "endReason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BurkeClusterRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WalkProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BurkeClusterRun_projectId_createdAt_idx" ON "BurkeClusterRun"("projectId", "createdAt");
