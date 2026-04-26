-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "segmentColumn" TEXT;

-- CreateTable
CREATE TABLE "StepSegmentRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stepId" INTEGER NOT NULL,
    "segmentValue" TEXT NOT NULL,
    "templateId" INTEGER NOT NULL,
    CONSTRAINT "StepSegmentRule_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "SequenceStep" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StepSegmentRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StepSegmentRule_templateId_idx" ON "StepSegmentRule"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "StepSegmentRule_stepId_segmentValue_key" ON "StepSegmentRule"("stepId", "segmentValue");
