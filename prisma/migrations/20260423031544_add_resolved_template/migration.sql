-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EmailSend" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leadId" INTEGER NOT NULL,
    "stepId" INTEGER NOT NULL,
    "messageId" TEXT,
    "trackingId" TEXT NOT NULL,
    "resolvedTemplateId" INTEGER,
    "scheduledFor" DATETIME NOT NULL,
    "sentAt" DATETIME,
    "openedAt" DATETIME,
    "clickedAt" DATETIME,
    "repliedAt" DATETIME,
    "bouncedAt" DATETIME,
    "failedAt" DATETIME,
    "errorMessage" TEXT,
    CONSTRAINT "EmailSend_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmailSend_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "SequenceStep" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EmailSend_resolvedTemplateId_fkey" FOREIGN KEY ("resolvedTemplateId") REFERENCES "Template" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EmailSend" ("bouncedAt", "clickedAt", "errorMessage", "failedAt", "id", "leadId", "messageId", "openedAt", "repliedAt", "scheduledFor", "sentAt", "stepId", "trackingId") SELECT "bouncedAt", "clickedAt", "errorMessage", "failedAt", "id", "leadId", "messageId", "openedAt", "repliedAt", "scheduledFor", "sentAt", "stepId", "trackingId" FROM "EmailSend";
DROP TABLE "EmailSend";
ALTER TABLE "new_EmailSend" RENAME TO "EmailSend";
CREATE UNIQUE INDEX "EmailSend_trackingId_key" ON "EmailSend"("trackingId");
CREATE INDEX "EmailSend_scheduledFor_sentAt_idx" ON "EmailSend"("scheduledFor", "sentAt");
CREATE INDEX "EmailSend_messageId_idx" ON "EmailSend"("messageId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
