/**
 * Build the visual guide and image collection for an existing draft.
 *
 *   npm run visuals -- --draft drafts/selfing_20.md
 *
 * Writes {draft}.visuals.md and downloads fitting Commons files into
 * {draft}_visuals/NN-beat-title/. The draft itself is untouched.
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { GeminiProvider } from "@/integrations/gemini/provider";
import { LlmRouteOracle } from "@/integrations/llm/route-oracle";
import { buildVisualGuide } from "./visuals-lib";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let draftPath = "";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--draft") draftPath = argv[++i];
  }
  if (!draftPath) throw new Error("Usage: npm run visuals -- --draft drafts/x_NN.md");

  const md = readFileSync(draftPath, "utf8");
  const beats = md
    .split("\n### ")
    .slice(1)
    .map((block) => {
      const [header, ...rest] = block.split("\n");
      return {
        title: header.replace(/^\d+\.\s*/, "").split(" · ")[0].trim(),
        prose: rest.join("\n").split("\n## ")[0].trim(),
      };
    })
    .filter((b) => b.prose.split(/\s+/).length > 30);

  const oracle = new LlmRouteOracle(new GeminiProvider());
  const stats = await buildVisualGuide({
    oracle,
    beats,
    guidePath: draftPath.replace(/\.md$/, ".visuals.md"),
    imagesDir: draftPath.replace(/\.md$/, "") + "_visuals",
    onProgress: (done, total) =>
      process.stderr.write(`\r  visuals ${done}/${total}   `),
  });
  process.stderr.write("\r                 \r");
  console.log(
    `guide: ${draftPath.replace(/\.md$/, ".visuals.md")}\n` +
      `images: ${draftPath.replace(/\.md$/, "")}_visuals\n` +
      `${stats.found} fit · ${stats.unfit} unfit · ${stats.downloaded} downloaded`,
  );
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
