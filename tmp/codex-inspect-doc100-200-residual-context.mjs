import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const { prisma } = await import("../apps/server/src/lib/prisma.ts");

const docs = [104, 106, 110, 117, 164, 178, 187, 190, 192, 194, 195, 199];
const pattern = /2311|流延膜|形状|板材|航空插头|外堵式|类似沥青|进料口|图纸接线|0\.7mm|整体结构|"45"/u;

try {
  for (const id of docs) {
    const er = await prisma.extractionResult.findFirst({
      where: { documentId: BigInt(id) },
      orderBy: { createdAt: "desc" },
      select: { id: true, normalizedExtractionJson: true },
    });
    const items = er?.normalizedExtractionJson?.items ?? [];
    const hits = [];
    for (const item of items) {
      for (const [field, value] of Object.entries(item.fields ?? {})) {
        if (pattern.test(JSON.stringify(value))) {
          hits.push({ item: item.item_index, field, value });
        }
      }
    }
    console.log(JSON.stringify({ documentId: id, extractionResultId: String(er?.id), hits }, null, 2));
  }
} finally {
  await prisma.$disconnect();
}
