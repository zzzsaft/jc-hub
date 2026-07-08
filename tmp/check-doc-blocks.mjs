import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: ['error', 'warn'] });

const rows = await prisma.documentBlock.findMany({
  take: 5,
  orderBy: { id: 'asc' },
});

console.log(
  JSON.stringify(
    rows.map((row) => ({
      id: Number(row.id),
      documentId: Number(row.documentId),
      parserVersion: row.parserVersion,
    })),
    null,
    2,
  ),
);

await prisma.$disconnect();
