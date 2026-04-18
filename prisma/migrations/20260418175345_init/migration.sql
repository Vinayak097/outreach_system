-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SmtpConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "secure" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "imapHost" TEXT,
    "imapPort" INTEGER,
    "imapUser" TEXT,
    "imapPass" TEXT,
    "dailyLimit" INTEGER NOT NULL DEFAULT 50,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "smtpConfigId" INTEGER NOT NULL,
    "originalFileName" TEXT,
    "columnMapping" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Campaign_smtpConfigId_fkey" FOREIGN KEY ("smtpConfigId") REFERENCES "SmtpConfig" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "campaignId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "company" TEXT,
    "jobTitle" TEXT,
    "customFields" TEXT NOT NULL DEFAULT '{}',
    "sourceRowIndex" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SequenceStep" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "campaignId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "subjectTpl" TEXT NOT NULL,
    "bodyTpl" TEXT NOT NULL,
    "delayDays" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SequenceStep_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailSend" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leadId" INTEGER NOT NULL,
    "stepId" INTEGER NOT NULL,
    "messageId" TEXT,
    "trackingId" TEXT NOT NULL,
    "scheduledFor" DATETIME NOT NULL,
    "sentAt" DATETIME,
    "openedAt" DATETIME,
    "clickedAt" DATETIME,
    "repliedAt" DATETIME,
    "bouncedAt" DATETIME,
    "failedAt" DATETIME,
    "errorMessage" TEXT,
    CONSTRAINT "EmailSend_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmailSend_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "SequenceStep" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Lead_campaignId_status_idx" ON "Lead"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSend_trackingId_key" ON "EmailSend"("trackingId");

-- CreateIndex
CREATE INDEX "EmailSend_scheduledFor_sentAt_idx" ON "EmailSend"("scheduledFor", "sentAt");

-- CreateIndex
CREATE INDEX "EmailSend_messageId_idx" ON "EmailSend"("messageId");
