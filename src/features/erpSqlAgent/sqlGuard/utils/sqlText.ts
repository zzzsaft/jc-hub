const TRAILING_SEMICOLON_PATTERN = /;\s*$/u;

/** Removes comments and string bodies so keyword scans do not match inert text. */
export function maskSqlLiteralsAndComments(sql: string): string {
  let output = "";
  let index = 0;
  while (index < sql.length) {
    const current = sql[index];
    const next = sql[index + 1];

    if (current === "-" && next === "-") {
      const end = sql.indexOf("\n", index + 2);
      const stop = end === -1 ? sql.length : end;
      output += " ".repeat(stop - index);
      index = stop;
      continue;
    }

    if (current === "/" && next === "*") {
      const end = sql.indexOf("*/", index + 2);
      const stop = end === -1 ? sql.length : end + 2;
      output += " ".repeat(stop - index);
      index = stop;
      continue;
    }

    if (current === "'" || current === "\"") {
      const quote = current;
      output += " ";
      index += 1;
      while (index < sql.length) {
        const character = sql[index];
        output += " ";
        if (character === quote) {
          if (sql[index + 1] === quote) {
            output += " ";
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    output += current;
    index += 1;
  }
  return output;
}

/** Returns true when semicolon usage indicates more than one executable statement. */
export function hasMultipleSqlStatements(sql: string): boolean {
  const masked = maskSqlLiteralsAndComments(sql).trim();
  const withoutOneTrailingSemicolon = masked.replace(TRAILING_SEMICOLON_PATTERN, "");
  return withoutOneTrailingSemicolon.includes(";");
}

/** Normalizes parser/safety names by removing SQL Server brackets. */
export function normalizeIdentifier(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Creates a stable case-insensitive key for schema objects. */
export function schemaObjectKey(schemaName: string, tableName: string): string {
  return `${schemaName.toLowerCase()}.${tableName.toLowerCase()}`;
}

/** Creates a stable case-insensitive key for schema fields. */
export function schemaFieldKey(schemaName: string, tableName: string, fieldName: string): string {
  return `${schemaObjectKey(schemaName, tableName)}.${fieldName.toLowerCase()}`;
}
