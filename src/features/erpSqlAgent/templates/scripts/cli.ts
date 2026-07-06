export function parseArgs(args: string[]): Record<string, string | true> {
  const parsed: Record<string, string | true> = {};
  for (const arg of args) {
    if (!arg.startsWith("--")) continue;
    const [key, ...rest] = arg.slice(2).split("=");
    parsed[key] = rest.length ? rest.join("=") : true;
  }
  return parsed;
}

export function requireArg(args: Record<string, string | true>, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing required --${name}=...`);
  return value;
}

export function readBigIntArg(args: Record<string, string | true>, name: string): bigint {
  return BigInt(requireArg(args, name));
}
