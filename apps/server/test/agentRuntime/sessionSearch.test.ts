import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import { AgentRuntimeService } from "../../src/ai/agentRuntime/service.js";

const baseSession = {
  id: 1n,
  agentType: "mastraErpSqlAgent",
  title: "采购查询",
  ownerUserId: "u1",
  status: "active",
  metadataJsonb: {},
  createdAt: new Date("2026-07-09T00:00:00.000Z"),
  updatedAt: new Date("2026-07-09T00:01:00.000Z"),
};

test("agent runtime listSessions keeps existing Prisma pagination without keyword", async () => {
  const service = new AgentRuntimeService();
  const originalFindMany = prisma.agentSession.findMany;
  const originalCount = prisma.agentSession.count;
  const calls: unknown[] = [];

  (prisma.agentSession.findMany as any) = async (args: unknown) => {
    calls.push(args);
    return [baseSession];
  };
  (prisma.agentSession.count as any) = async (args: unknown) => {
    calls.push(args);
    return 1;
  };

  try {
    const result = await service.listSessions({
      ownerUserId: "u1",
      agentType: "mastraErpSqlAgent",
      status: "active",
      page: 2,
      pageSize: 10,
    });

    assert.equal(result.page, 2);
    assert.equal(result.pageSize, 10);
    assert.equal(result.total, 1);
    assert.equal(result.items[0]?.title, "采购查询");
    assert.deepEqual(calls[0], {
      where: { ownerUserId: "u1", agentType: "mastraErpSqlAgent", status: "active" },
      orderBy: { updatedAt: "desc" },
      skip: 10,
      take: 10,
    });
    assert.deepEqual(calls[1], {
      where: { ownerUserId: "u1", agentType: "mastraErpSqlAgent", status: "active" },
    });
  } finally {
    (prisma.agentSession.findMany as any) = originalFindMany;
    (prisma.agentSession.count as any) = originalCount;
  }
});

test("agent runtime listSessions searches title or message content with keyword", async () => {
  const service = new AgentRuntimeService();
  const originalQueryRaw = prisma.$queryRaw;
  const queries: unknown[] = [];

  (prisma.$queryRaw as any) = async (query: unknown) => {
    queries.push(query);
    return queries.length === 1 ? [baseSession] : [{ total: 1n }];
  };

  try {
    const result = await service.listSessions({
      ownerUserId: "u1",
      agentType: "mastraErpSqlAgent",
      status: "active",
      keyword: "采购",
      page: 1,
      pageSize: 20,
    });

    assert.equal(result.total, 1);
    assert.equal(result.items[0]?.id, "1");
    assert.equal(queries.length, 2);
    const query = queries[0] as { strings?: string[]; values?: unknown[] };
    assert.match(query.strings?.join("") ?? "", /agent_messages/);
    assert.ok(query.values?.includes("%采购%"));
  } finally {
    (prisma.$queryRaw as any) = originalQueryRaw;
  }
});
