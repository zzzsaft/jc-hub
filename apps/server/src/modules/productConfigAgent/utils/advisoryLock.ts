export type AdvisoryLockResult<T> = { acquired: false } | { acquired: true; value: T };

export type PrismaAdvisoryLockClient = {
  $transaction<T>(fn: (tx: PrismaAdvisoryLockTransaction) => Promise<T>): Promise<T>;
};

export type PrismaAdvisoryLockTransaction = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};

export async function withTryAdvisoryTransactionLock<T>(
  client: PrismaAdvisoryLockClient,
  key: number,
  action: (tx: PrismaAdvisoryLockTransaction) => Promise<T>,
): Promise<AdvisoryLockResult<T>> {
  return client.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ locked: boolean }>>(
      "SELECT pg_try_advisory_xact_lock($1) AS locked",
      key,
    );
    if (rows?.[0]?.locked !== true) return { acquired: false };
    return { acquired: true, value: await action(tx) };
  });
}
