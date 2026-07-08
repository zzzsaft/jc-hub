import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const { prisma } = await import("../apps/server/src/lib/prisma.ts");

try {
  const er = await prisma.extractionResult.findFirst({
    where: { documentId: 199n },
    orderBy: { createdAt: "desc" },
    select: { id: true, extractionJson: true, normalizedExtractionJson: true, dictionaryProposals: true },
  });
  console.log(JSON.stringify({
    id: String(er?.id),
    raw: er?.extractionJson?.items?.[0]?.raw_fields,
    fields: er?.normalizedExtractionJson?.items?.[0]?.fields,
    proposals: er?.dictionaryProposals?.proposals?.filter((p) => /45|fine|微调|挤出|方向/u.test(JSON.stringify(p))),
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
