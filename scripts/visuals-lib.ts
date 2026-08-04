/**
 * The visual-beat guide as a shared stage: propose concrete-first visuals
 * per beat, verify them against Wikimedia Commons, DOWNLOAD what fits, and
 * write the guide to its own file beside the draft.
 *
 * Verification now checks fitness, not mere existence: a search hit is
 * accepted only when it shares enough significant terms with the query.
 * "Roman scribe writing papyrus" matching the Rhind Mathematical Papyrus
 * was existence without aboutness — the Byzantine-district bug one layer
 * down — and once files land on disk, junk is no longer harmless.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const STOP = new Set([
  "the", "a", "an", "of", "in", "on", "at", "by", "and", "or", "with",
  "for", "to", "from", "writing", "image", "picture", "photo",
]);

export function significantTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3 && !STOP.has(t));
}

/** Term-overlap with prefix tolerance, so Socrates matches Socrate. */
export function fitScore(query: string, fileTitle: string): number {
  const title = fileTitle.toLowerCase();
  const terms = significantTerms(query);
  if (terms.length === 0) return 0;
  let hit = 0;
  for (const term of terms) {
    const stem = term.slice(0, Math.max(4, term.length - 2));
    if (title.includes(term) || title.includes(stem)) hit += 1;
  }
  return hit / terms.length;
}

const UA = { "User-Agent": "motif-walk/0.1 (research tool)" };
const API = "https://commons.wikimedia.org/w/api.php";

export async function commonsSearch(q: string): Promise<string[]> {
  try {
    const url =
      `${API}?action=query&format=json&formatversion=2&list=search` +
      `&srnamespace=6&srlimit=5&srsearch=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: UA });
    const j = (await res.json()) as {
      query?: { search?: Array<{ title: string }> };
    };
    return (j.query?.search ?? []).map((x) => x.title);
  } catch {
    return [];
  }
}

export async function commonsFileUrl(fileTitle: string): Promise<string> {
  try {
    const url =
      `${API}?action=query&format=json&formatversion=2&prop=imageinfo` +
      `&iiprop=url&iiurlwidth=1600&titles=${encodeURIComponent(fileTitle)}`;
    const res = await fetch(url, { headers: UA });
    const j = (await res.json()) as {
      query?: {
        pages?: Array<{
          imageinfo?: Array<{ thumburl?: string; url?: string }>;
        }>;
      };
    };
    const info = j.query?.pages?.[0]?.imageinfo?.[0];
    return info?.thumburl ?? info?.url ?? "";
  } catch {
    return "";
  }
}

export function sanitizeName(s: string): string {
  return s.replace(/^File:/, "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

export interface VisualsOracle {
  proposeVisuals(input: { title: string; prose: string }): Promise<{
    visuals: Array<{
      kind: "concrete" | "abstract";
      query: string;
      why: string;
      licence: string;
      spectation: string;
    }>;
  }>;
}

export async function buildVisualGuide(options: {
  oracle: VisualsOracle;
  beats: Array<{ title: string; prose: string }>;
  guidePath: string;
  imagesDir: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ found: number; unfit: number; downloaded: number }> {
  const lines: string[] = ["# Visual guide", ""];
  let found = 0;
  let unfit = 0;
  let downloaded = 0;

  for (let i = 0; i < options.beats.length; i++) {
    const beat = options.beats[i];
    lines.push(`## ${i + 1}. ${beat.title}`, "");
    try {
      const proposal = await options.oracle.proposeVisuals({
        title: beat.title,
        prose: beat.prose,
      });
      const beatDir = path.join(
        options.imagesDir,
        `${String(i + 1).padStart(2, "0")}-${sanitizeName(beat.title).toLowerCase()}`,
      );
      for (const v of proposal.visuals) {
        if (v.kind === "abstract") {
          lines.push(
            `- abstract (licence: ${v.licence || "unstated"}) · "${v.query}" — ${v.why}`,
          );
          continue;
        }
        const hits = await commonsSearch(v.query);
        const scored = hits
          .map((h) => ({ title: h, score: fitScore(v.query, h) }))
          .sort((a, b) => b.score - a.score);
        const best = scored[0];
        // Half the significant terms must appear; existence is not fitness.
        if (!best || best.score < 0.5) {
          unfit += 1;
          lines.push(
            `- concrete · "${v.query}" — ${v.why} [✗ no fitting file` +
              (best ? `; best hit was ${best.title}` : "") +
              "]",
          );
          continue;
        }
        found += 1;
        let saved = "";
        const fileUrl = await commonsFileUrl(best.title);
        if (fileUrl) {
          try {
            const res = await fetch(fileUrl, { headers: UA });
            if (res.ok) {
              const buf = Buffer.from(await res.arrayBuffer());
              mkdirSync(beatDir, { recursive: true });
              const ext = path.extname(new URL(fileUrl).pathname) || ".jpg";
              const fileName =
                sanitizeName(best.title).replace(/\.[a-zA-Z0-9]+$/, "") + ext;
              const dest = path.join(beatDir, fileName);
              writeFileSync(dest, buf);
              saved = dest;
              downloaded += 1;
            }
          } catch {
            /* an undownloaded image is still a verified reference */
          }
        }
        lines.push(
          `- concrete · "${v.query}" — ${v.why} [✓ ${best.title}]` +
            (saved ? `\n  - saved: ${saved}` : ""),
        );
        if (v.spectation) lines.push(`  - spectation: ${v.spectation}`);
      }
    } catch {
      lines.push("- (visual proposal failed for this beat)");
    }
    lines.push("");
    options.onProgress?.(i + 1, options.beats.length);
  }

  writeFileSync(options.guidePath, lines.join("\n"), "utf8");
  return { found, unfit, downloaded };
}
