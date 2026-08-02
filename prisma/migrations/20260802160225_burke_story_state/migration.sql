/*
  Warnings:

  - You are about to drop the column `finalRedescription` on the `BurkeRun` table. All the data in the column will be lost.
  - You are about to drop the column `salience` on the `BurkeRun` table. All the data in the column will be lost.
  - Added the required column `storyState` to the `BurkeRun` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BurkeRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
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
INSERT INTO "new_BurkeRun" ("checkpoints", "createdAt", "endReason", "id", "notes", "projectId") SELECT "checkpoints", "createdAt", "endReason", "id", "notes", "projectId" FROM "BurkeRun";
DROP TABLE "BurkeRun";
ALTER TABLE "new_BurkeRun" RENAME TO "BurkeRun";
CREATE INDEX "BurkeRun_projectId_createdAt_idx" ON "BurkeRun"("projectId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
