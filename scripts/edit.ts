/**
 * Local seam surgery on a finished draft.
 *
 *   npm run edit -- --draft drafts/selfing_14.md --seam 1 "guidance..."
 *
 * The re-roll path (`npm run script -- --revise`) regenerates a whole draft
 * under a command. This edits: the two beats around the named seam are
 * FIXED, and a story is scouted between them — an intermediary hunted if
 * the story runs through one, background subjects leaned on if they serve,
 * and a Burke mechanism chosen deliberately from the measured vocabulary.
 * The draft itself is the state: beat titles are resolved article pages, so
 * nothing needs to have been persisted for surgery to work on any draft.
 *
 * --seam N operates between beat N and beat N+1. The result is written as
 * the next number in the draft's family; the original is untouched.
 */

import "dotenv/config";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { RequestBudget } from "@/domain/walk/types";
import { WikipediaGateway } from "@/integrations/wikipedia/gateway";
import { GeminiProvider } from "@/integrations/gemini/provider";
import { loadPrompt } from "@/integrations/llm/prompt-files";
import { seamPatchSchema, seamScoutSchema } from "@/schemas/seam";

interface Beat {
  header: string;
  title: string;
  prose: string;
}

function parseDraft(md: string): { front: string; beats: Beat[] } {
  const parts = md.split("\n### ");
  const front = parts[0];
  const beats = parts.slice(1).map((block) => {
    const [header, ...rest] = block.split("\n");
    const title = header
      .replace(/^\d+\.\s*/, "")
      .split(" · ")[0]
      .trim();
    return { header, title, prose: rest.join("\n").trim() };
  });
  return { front, beats };
}

function assemble(front: string, beats: Beat[], inserts: Map<number, string>): string {
  const out: string[] = [front.trimEnd(), ""];
  beats.forEach((beat, i) => {
    out.push(`### ${beat.header}`, "", beat.prose, "");
    const extra = inserts.get(i);
    if (extra) out.push(extra.trim(), "");
  });
  return out.join("\n");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let draftPath = "";
  let seam = 0;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--draft") draftPath = argv[++i];
    else if (argv[i] === "--seam") seam = Number(argv[++i]);
    else rest.push(argv[i]);
  }
  const guidance = rest.join(" ").trim();
  if (!draftPath || !seam) {
    throw new Error('Usage: npm run edit -- --draft drafts/x_01.md --seam N "guidance"');
  }

  const md = readFileSync(draftPath, "utf8");
  const { front, beats } = parseDraft(md);
  if (seam < 1 || seam >= beats.length) {
    throw new Error(`--seam must be between 1 and ${beats.length - 1}`);
  }
  const a = beats[seam - 1];
  const b = beats[seam];
  const background = beats
    .filter((x) => x !== a && x !== b)
    .map((x) => x.title)
    .filter((t, i, all) => all.indexOf(t) === i);

  console.log(`seam ${seam}: ${a.title} → ${b.title}`);

  const gateway = new WikipediaGateway("en", new RequestBudget(60));
  const fetchExtract = async (title: string): Promise<string> => {
    try {
      const infos = await gateway.getArticleInfos([title]);
      const info = [...infos.values()].find((x) => !x.missing);
      return info ? await gateway.getArticleExtract(info.title) : "";
    } catch {
      return "";
    }
  };
  const [extractA, extractB] = [await fetchExtract(a.title), await fetchExtract(b.title)];

  const provider = new GeminiProvider();

  const scout = await provider.generateStructured({
    promptId: "scout-seam.v1",
    system: loadPrompt("scout-seam.v1"),
    user: [
      guidance ? `THE WRITER'S GUIDANCE:\n${guidance}` : "",
      `FIRST PASSAGE — FIXED (${a.title}):\n${a.prose}`,
      `SECOND PASSAGE — FIXED (${b.title}):\n${b.prose}`,
      `BACKGROUND SUBJECTS IN THE DRAFT: ${background.join(", ") || "(none)"}`,
      extractA ? `ARTICLE ON ${a.title}:\n${extractA.slice(0, 7000)}` : "",
      extractB ? `ARTICLE ON ${b.title}:\n${extractB.slice(0, 7000)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    schema: seamScoutSchema,
    temperature: 0.6,
    maxTokens: 8000,
  });
  console.log(`mechanism: ${scout.mechanism}`);
  console.log(`sketch: ${scout.sketch}`);

  const intermediaries: Array<{ title: string; extract: string }> = [];
  for (const name of scout.huntFor.slice(0, 3)) {
    const extract = await fetchExtract(name);
    if (extract.trim().length > 400) {
      intermediaries.push({ title: name, extract });
      console.log(`fetched intermediary: ${name}`);
    }
  }

  const patch = await provider.generateStructured({
    promptId: "patch-seam.v1",
    system: loadPrompt("patch-seam.v1"),
    user: [
      guidance ? `THE WRITER'S GUIDANCE:\n${guidance}` : "",
      `MECHANISM: ${scout.mechanism}`,
      `SCOUTED STORY:\n${scout.sketch}`,
      `FIRST PASSAGE — FIXED (${a.title}):\n${a.prose}`,
      `SECOND PASSAGE (${b.title}):\n${b.prose}`,
      ...intermediaries.map(
        (x) => `INTERMEDIARY ARTICLE — ${x.title}:\n${x.extract.slice(0, 7000)}`,
      ),
    ]
      .filter(Boolean)
      .join("\n\n"),
    schema: seamPatchSchema,
    temperature: 0.7,
    maxTokens: 16000,
  });

  const inserts = new Map<number, string>();
  const patched = [...beats];
  if (patch.mode === "insert" && patch.insertParagraph.trim()) {
    inserts.set(seam - 1, patch.insertParagraph);
    console.log(`\ninserted mini paragraph after beat ${seam}:`);
    console.log(patch.insertParagraph);
  } else if (patch.mode === "rewrite_opening" && patch.revisedNextBeat.trim()) {
    patched[seam] = { ...b, prose: patch.revisedNextBeat.trim() };
    console.log(`\nrewrote the opening of beat ${seam + 1}.`);
  } else {
    throw new Error("The patch came back empty; nothing was changed.");
  }

  // Next number in the family; the original stays as it was.
  const match = draftPath.match(/^(.*)_(\d+)\.md$/);
  if (!match) throw new Error(`Draft name is not {title}_NN: ${draftPath}`);
  let n = Number(match[2]);
  const pad = () => String(n).padStart(2, "0");
  do n += 1;
  while (existsSync(`${match[1]}_${pad()}.md`));
  const outPath = `${match[1]}_${pad()}.md`;

  writeFileSync(outPath, assemble(front, patched, inserts), "utf8");
  const planSrc = draftPath.replace(/\.md$/, ".plan.json");
  if (existsSync(planSrc)) copyFileSync(planSrc, outPath.replace(/\.md$/, ".plan.json"));
  console.log(`\nWritten to ${outPath}`);
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
