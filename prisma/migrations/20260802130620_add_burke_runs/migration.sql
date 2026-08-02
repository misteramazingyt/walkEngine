-- CreateTable
CREATE TABLE "BurkeRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "salience" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "checkpoints" TEXT NOT NULL,
    "finalRedescription" TEXT NOT NULL,
    "endReason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BurkeRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WalkProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BurkeRun_projectId_createdAt_idx" ON "BurkeRun"("projectId", "createdAt");
