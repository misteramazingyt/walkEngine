-- CreateTable
CREATE TABLE "CandidateWalk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "seedUsed" TEXT NOT NULL,
    "endReason" TEXT NOT NULL,
    "pathScore" TEXT NOT NULL,
    "nodes" TEXT NOT NULL,
    "chosen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateWalk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WalkProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CandidateWalk_projectId_createdAt_idx" ON "CandidateWalk"("projectId", "createdAt");
