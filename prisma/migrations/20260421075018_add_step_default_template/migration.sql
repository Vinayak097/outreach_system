-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SequenceStep" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "campaignId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "subjectTpl" TEXT NOT NULL DEFAULT '',
    "bodyTpl" TEXT NOT NULL DEFAULT '',
    "delayDays" INTEGER NOT NULL DEFAULT 0,
    "defaultTemplateId" INTEGER,
    CONSTRAINT "SequenceStep_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SequenceStep_defaultTemplateId_fkey" FOREIGN KEY ("defaultTemplateId") REFERENCES "Template" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SequenceStep" ("bodyTpl", "campaignId", "delayDays", "id", "order", "subjectTpl") SELECT "bodyTpl", "campaignId", "delayDays", "id", "order", "subjectTpl" FROM "SequenceStep";
DROP TABLE "SequenceStep";
ALTER TABLE "new_SequenceStep" RENAME TO "SequenceStep";
CREATE INDEX "SequenceStep_defaultTemplateId_idx" ON "SequenceStep"("defaultTemplateId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
