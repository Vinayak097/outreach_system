import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("SEND_JITTER_MIN_MS", "0");
vi.stubEnv("SEND_JITTER_MAX_MS", "0");

const { prisma, sendOneMock } = vi.hoisted(() => {
  const prisma = {
    emailSend: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    smtpConfig: {
      findUnique: vi.fn(),
    },
    setting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  };
  const sendOneMock = vi.fn();
  return { prisma, sendOneMock };
});

vi.mock("../lib/prisma.js", () => ({ prisma }));
vi.mock("./sender.js", () => ({ sendOne: sendOneMock }));

import { tick } from "./scheduler.js";

describe("scheduler tick", () => {
  beforeEach(() => {
    for (const obj of Object.values(prisma)) {
      for (const fn of Object.values(obj)) (fn as ReturnType<typeof vi.fn>).mockReset();
    }
    sendOneMock.mockReset();
    sendOneMock.mockImplementation(async () => ({ kind: "sent", messageId: "m-1" }));
    prisma.setting.upsert.mockResolvedValue({});
  });

  it("sends every pending per SMTP (bounded by daily limit) in one tick", async () => {
    prisma.emailSend.findMany.mockResolvedValue([
      { id: 1, step: { campaign: { smtpConfigId: 10 } } },
      { id: 2, step: { campaign: { smtpConfigId: 10 } } },
      { id: 3, step: { campaign: { smtpConfigId: 20 } } },
    ]);
    prisma.smtpConfig.findUnique.mockImplementation(async ({ where }) => ({
      id: where.id,
      dailyLimit: 100,
    }));
    prisma.setting.findUnique.mockResolvedValue(null);
    prisma.emailSend.count.mockResolvedValue(0);

    const res = await tick(new Date());
    expect(res.sent).toBe(3);
    expect(sendOneMock).toHaveBeenCalledTimes(3);
    expect(prisma.setting.upsert).toHaveBeenCalledTimes(2);
  });

  it("skips an SMTP when daily limit is hit", async () => {
    prisma.emailSend.findMany.mockResolvedValue([
      { id: 1, step: { campaign: { smtpConfigId: 10 } } },
      { id: 2, step: { campaign: { smtpConfigId: 10 } } },
    ]);
    prisma.smtpConfig.findUnique.mockResolvedValue({ id: 10, dailyLimit: 1 });
    prisma.setting.findUnique.mockResolvedValue(null);
    prisma.emailSend.count.mockResolvedValue(1);

    const res = await tick(new Date());
    expect(res.sent).toBe(0);
    expect(res.skipped).toBe(2);
    expect(sendOneMock).not.toHaveBeenCalled();
  });

  it("partially fills when remaining daily capacity is smaller than batch", async () => {
    prisma.emailSend.findMany.mockResolvedValue([
      { id: 1, step: { campaign: { smtpConfigId: 10 } } },
      { id: 2, step: { campaign: { smtpConfigId: 10 } } },
      { id: 3, step: { campaign: { smtpConfigId: 10 } } },
    ]);
    prisma.smtpConfig.findUnique.mockResolvedValue({ id: 10, dailyLimit: 5 });
    prisma.setting.findUnique.mockResolvedValue(null);
    prisma.emailSend.count.mockResolvedValue(3);

    const res = await tick(new Date());
    expect(res.sent).toBe(2);
    expect(sendOneMock).toHaveBeenCalledTimes(2);
  });
});
