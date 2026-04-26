-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "originalHeaders" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Lead" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "campaignId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "company" TEXT,
    "jobTitle" TEXT,
    "customFields" TEXT NOT NULL DEFAULT '{}',
    "rawRow" TEXT NOT NULL DEFAULT '{}',
    "sourceRowIndex" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Lead" ("campaignId", "company", "createdAt", "currentStep", "customFields", "email", "firstName", "id", "jobTitle", "lastName", "sourceRowIndex", "status") SELECT "campaignId", "company", "createdAt", "currentStep", "customFields", "email", "firstName", "id", "jobTitle", "lastName", "sourceRowIndex", "status" FROM "Lead";
DROP TABLE "Lead";
ALTER TABLE "new_Lead" RENAME TO "Lead";
CREATE INDEX "Lead_campaignId_status_idx" ON "Lead"("campaignId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
