"use client";

import type { CandidateWalkDto } from "@/server/walks";
import { RetroButton } from "@/components/ui/retro";

// Comparison screen for the three criteriological candidate paths. Scores
// are deterministic path-level metrics, not judgments of historical truth —
// warrant here means "documented Wikidata relations along the path".

const SCORE_ROWS: Array<{ key: keyof CandidateWalkDto["pathScore"]; label: string; invert?: boolean }> = [
  { key: "warrant", label: "Documented relations" },
  { key: "novelty", label: "Novelty" },
  { key: "entityDiversity", label: "Entity diversity" },
  { key: "edgeTypeDiversity", label: "Transition variety" },
  { key: "motifDevelopment", label: "Motif affinity" },
  { key: "concreteCarrierDensity", label: "Concrete carriers" },
  { key: "endpointStrength", label: "Endpoint strength" },
  { key: "redundancyPenalty", label: "Redundancy", invert: true },
];

function ScoreBar({ value, invert }: { value: number; invert?: boolean }) {
  const pct = Math.round(value * 100);
  return (
    <div className="bevel-in h-3 w-24 shrink-0">
      <div
        className="h-full"
        style={{
          width: `${pct}%`,
          background: invert ? "var(--color-warn)" : "var(--color-accent)",
          opacity: 0.75,
        }}
      />
    </div>
  );
}

export function CandidateComparison({
  candidates,
  onChoose,
  choosing,
}: {
  candidates: CandidateWalkDto[];
  onChoose: (candidateWalkId: string) => void;
  choosing: boolean;
}) {
  return (
    <div className="m-2 flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-1">
      <p className="text-[12px] text-ink-dim">
        Three candidate paths were generated from your weights (seeds{" "}
        {candidates.map((c) => `“…::${c.label}”`).join(", ")}). Compare and
        choose one; the others stay stored.
      </p>
      {candidates.map((candidate) => (
        <div key={candidate.id} className="bevel-out p-[3px]">
          <div className="titlebar-gradient flex items-center justify-between px-2 py-0.5 text-[12px] font-bold text-titlebar-text">
            <span>
              Path {candidate.label} · {candidate.titles.length} nodes
            </span>
            <span className="font-normal">{candidate.endReason.replaceAll("_", " ").toLowerCase()}</span>
          </div>
          <div className="flex flex-col gap-2 p-2 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] leading-relaxed">
                {candidate.titles.join(" → ")}
              </p>
              <RetroButton
                primary
                className="mt-2"
                disabled={choosing}
                onClick={() => onChoose(candidate.id)}
              >
                Choose path {candidate.label}
              </RetroButton>
            </div>
            <div className="shrink-0">
              {SCORE_ROWS.map((row) => (
                <div key={row.key} className="flex items-center gap-2 py-0.5">
                  <span className="w-36 text-right text-[10px] text-ink-dim">
                    {row.label}
                  </span>
                  <ScoreBar
                    value={candidate.pathScore[row.key]}
                    invert={row.invert}
                  />
                  <span className="w-8 text-[10px] text-ink-dim">
                    {candidate.pathScore[row.key].toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
