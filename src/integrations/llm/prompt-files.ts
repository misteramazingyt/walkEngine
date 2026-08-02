import { readFileSync } from "node:fs";
import path from "node:path";

// Versioned prompt loader. Prompts live as files (src/prompts/*.vN.md) so
// changes are reviewable diffs; the promptId doubles as the filename.

const cache = new Map<string, string>();

export function loadPrompt(promptId: string): string {
  const cached = cache.get(promptId);
  if (cached) return cached;
  const filePath = path.join(process.cwd(), "src", "prompts", `${promptId}.md`);
  const text = readFileSync(filePath, "utf8");
  cache.set(promptId, text);
  return text;
}
