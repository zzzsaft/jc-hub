export const readStorageValue = (key: string) => {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};

export const writeStorageValue = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export function extractJsonFromText(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = (fenced?.[1] || text).trim();
  if (!source) throw new Error("JSON 为空");
  try {
    return JSON.parse(source);
  } catch {
    const startCandidates = [
      source.indexOf("{"),
      source.indexOf("["),
    ].filter((item) => item >= 0);
    const start = Math.min(...startCandidates);
    const end = Math.max(source.lastIndexOf("}"), source.lastIndexOf("]"));
    if (!Number.isFinite(start) || end <= start) throw new Error("没有找到可解析的 JSON");
    return JSON.parse(source.slice(start, end + 1));
  }
}

export async function copyTextToClipboard(text: string) {
  try {
    await navigator.clipboard?.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      return document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
  }
}
