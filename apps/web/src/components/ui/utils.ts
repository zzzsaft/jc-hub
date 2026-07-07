export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function getByPath(source: any, path: any): any {
  const parts = Array.isArray(path) ? path : String(path ?? "").split(".");
  return parts.reduce((value, key) => (value == null ? value : value[key]), source);
}

export function setByPath(source: any, path: any, nextValue: any) {
  const parts = Array.isArray(path) ? path : String(path ?? "").split(".");
  const clone = Array.isArray(source) ? [...source] : { ...(source || {}) };
  let cursor = clone;
  parts.forEach((key, index) => {
    if (index === parts.length - 1) {
      cursor[key] = nextValue;
      return;
    }
    cursor[key] = Array.isArray(cursor[key]) ? [...cursor[key]] : { ...(cursor[key] || {}) };
    cursor = cursor[key];
  });
  return clone;
}
