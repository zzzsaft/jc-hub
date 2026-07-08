import { prisma } from "../apps/server/src/lib/prisma.ts";

const c = await prisma.productDocument.count();
console.log("documents", c);
await prisma.$disconnect();
