-- CreateTable
CREATE TABLE "WalkProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'RANDOM',
    "seed" TEXT NOT NULL,
    "startNodeId" TEXT,
    "endpointNodeId" TEXT,
    "configuration" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT'
);

-- CreateTable
CREATE TABLE "SourceNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "wikipediaPageId" INTEGER NOT NULL,
    "wikidataId" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "relevantExtracts" TEXT NOT NULL DEFAULT '[]',
    "dateStart" INTEGER,
    "dateEnd" INTEGER,
    "locations" TEXT NOT NULL DEFAULT '[]',
    "entityTypes" TEXT NOT NULL DEFAULT '[]',
    "categories" TEXT NOT NULL DEFAULT '[]',
    "outgoingLinks" TEXT NOT NULL DEFAULT '[]',
    "visitIndex" INTEGER NOT NULL,
    "rawWalkScore" REAL,
    CONSTRAINT "SourceNode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WalkProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NarrativeNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "displayTitle" TEXT NOT NULL,
    "narrativeFunction" TEXT NOT NULL,
    "historicalClaim" TEXT NOT NULL,
    "significance" TEXT NOT NULL,
    "actorHorizon" TEXT,
    "laterInterpretation" TEXT,
    "presentMotif" TEXT,
    "immanentComplication" TEXT,
    "proposedNewMotif" TEXT,
    "visualObjects" TEXT NOT NULL DEFAULT '[]',
    "confidence" REAL NOT NULL,
    "positionX" REAL NOT NULL DEFAULT 0,
    "positionY" REAL NOT NULL DEFAULT 0,
    "orderIndex" INTEGER NOT NULL,
    CONSTRAINT "NarrativeNode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WalkProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NarrativeNode_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "SourceNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NarrativeEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sourceNarrativeNodeId" TEXT NOT NULL,
    "targetNarrativeNodeId" TEXT NOT NULL,
    "edgeType" TEXT NOT NULL,
    "warrantClass" TEXT NOT NULL,
    "transitionClaim" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "inheritedPressure" TEXT NOT NULL,
    "transformedPressure" TEXT NOT NULL,
    "evidence" TEXT NOT NULL DEFAULT '[]',
    "counterargument" TEXT,
    "confidence" REAL NOT NULL,
    "userApproved" BOOLEAN NOT NULL DEFAULT false,
    "verifierVerdict" TEXT,
    "verifierCritique" TEXT,
    CONSTRAINT "NarrativeEdge_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WalkProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NarrativeEdge_sourceNarrativeNodeId_fkey" FOREIGN KEY ("sourceNarrativeNodeId") REFERENCES "NarrativeNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NarrativeEdge_targetNarrativeNodeId_fkey" FOREIGN KEY ("targetNarrativeNodeId") REFERENCES "NarrativeNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DraftSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "narrativeNodeId" TEXT,
    "narrativeEdgeId" TEXT,
    "segmentType" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "userEdited" BOOLEAN NOT NULL DEFAULT false,
    "generationMeta" TEXT,
    CONSTRAINT "DraftSegment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WalkProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DraftSegment_narrativeNodeId_fkey" FOREIGN KEY ("narrativeNodeId") REFERENCES "NarrativeNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DraftSegment_narrativeEdgeId_fkey" FOREIGN KEY ("narrativeEdgeId") REFERENCES "NarrativeEdge" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" REAL NOT NULL DEFAULT 0,
    "currentStep" TEXT NOT NULL DEFAULT '',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GenerationJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WalkProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SourceNode_projectId_visitIndex_idx" ON "SourceNode"("projectId", "visitIndex");

-- CreateIndex
CREATE INDEX "NarrativeNode_projectId_orderIndex_idx" ON "NarrativeNode"("projectId", "orderIndex");

-- CreateIndex
CREATE INDEX "NarrativeEdge_projectId_idx" ON "NarrativeEdge"("projectId");

-- CreateIndex
CREATE INDEX "DraftSegment_projectId_orderIndex_idx" ON "DraftSegment"("projectId", "orderIndex");

-- CreateIndex
CREATE INDEX "GenerationJob_projectId_createdAt_idx" ON "GenerationJob"("projectId", "createdAt");
