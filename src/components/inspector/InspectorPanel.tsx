"use client";

import { useWorkbenchStore } from "@/state/workbench-store";
import type { WalkProjectDto } from "@/server/projects";
import type { SourceNodeDto } from "@/server/walks";

// Bottom panel. With a source node selected it shows the factual dossier:
// what was fetched, where it came from, and why the walk went there. The
// candidate-pool record makes the walk auditable — every hop can show what
// else was on the table and why the rest was excluded.

export function InspectorPanel({
  project,
  sourceNodes,
}: {
  project: WalkProjectDto;
  sourceNodes: SourceNodeDto[];
}) {
  const selection = useWorkbenchStore((s) => s.selection);
  const selected =
    selection?.kind === "node"
      ? sourceNodes.find((n) => n.id === selection.id)
      : undefined;

  if (!selected) {
    return (
      <div className="flex flex-col gap-2 px-3 py-2 text-[12px] lg:flex-row lg:items-start lg:gap-6">
        <div>
          <span className="font-bold">Selection:</span>{" "}
          {sourceNodes.length === 0
            ? "nothing selected — generate a walk, then click a node"
            : "nothing selected — click a node in the flowchart"}
        </div>
        <div className="text-ink-dim">
          <span className="font-bold text-ink">Project:</span> {project.id} ·
          status {project.status} · seed “{project.configuration.seed}”
        </div>
      </div>
    );
  }

  const eligible = selected.outgoingLinks.filter((c) => c.eligible);
  const excluded = selected.outgoingLinks.filter((c) => !c.eligible);
  // Criteriological mode: the node's own scoring record sits in the pool it
  // was chosen from; runner-ups are the other eligible candidates by score.
  const ownRecord = selected.outgoingLinks.find(
    (c) => c.title === selected.title && c.eligible,
  );
  const runnersUp = eligible
    .filter((c) => c.title !== selected.title && c.score !== undefined)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 3);

  return (
    <div className="grid gap-x-6 gap-y-2 px-3 py-2 text-[12px] lg:grid-cols-3">
      <div>
        <div className="font-bold">
          {selected.title}{" "}
          <span className="bg-titlebar px-1 text-[10px] text-titlebar-text">
            visit {selected.visitIndex}
          </span>
        </div>
        <p className="mt-1 line-clamp-3 text-ink-dim">{selected.summary}</p>
        <p className="mt-1">
          <a
            href={selected.url}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline"
          >
            Wikipedia source
          </a>
          {selected.wikidataId && (
            <span className="ml-2 text-ink-dim">
              Wikidata {selected.wikidataId}
            </span>
          )}
        </p>
      </div>
      <div>
        <div className="font-bold">Facts (fetched)</div>
        <p className="mt-1 text-ink-dim">
          {selected.entityTypes.length > 0 && (
            <>Type: {selected.entityTypes.slice(0, 3).join(", ")} · </>
          )}
          {selected.dateStart !== null && (
            <>
              Era: {selected.dateStart}
              {selected.dateEnd !== null && selected.dateEnd !== selected.dateStart
                ? `–${selected.dateEnd}`
                : ""}{" "}
              ·{" "}
            </>
          )}
          {selected.categories.length > 0
            ? selected.categories.slice(0, 6).join(" · ")
            : "no categories recorded"}
        </p>
        {ownRecord?.score !== undefined ? (
          <div className="mt-1">
            <span className="font-bold">
              Why this node (score {ownRecord.score.toFixed(3)}):
            </span>
            <ul className="mt-0.5 text-[11px] text-ink-dim">
              {(ownRecord.why ?? []).map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-ink-dim">
            The incoming edge records hyperlink adjacency only — it carries no
            historical warrant until Phase 4 orchestration types it.
          </p>
        )}
      </div>
      <div>
        <div className="font-bold">
          Chosen from {selected.visitIndex === 0 ? "—" : `${eligible.length} eligible candidates`}
        </div>
        {selected.visitIndex === 0 ? (
          <p className="mt-1 text-ink-dim">
            Start node: resolved from the configured starting point, not
            chosen from a candidate pool.
          </p>
        ) : (
          <>
            {runnersUp.length > 0 ? (
              <ul className="mt-1 text-[11px] text-ink-dim">
                {runnersUp.map((c) => (
                  <li key={c.title}>
                    · {c.title} (score {(c.score ?? 0).toFixed(3)})
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 line-clamp-2 text-ink-dim">
                {eligible.map((c) => c.title).join(" · ") || "pool not recorded"}
              </p>
            )}
            {excluded.length > 0 && (
              <p className="mt-1 line-clamp-2 text-[11px] text-ink-dim">
                Excluded: {excluded.slice(0, 6).map((c) => `${c.title} (${c.exclusionReason})`).join(" · ")}
                {excluded.length > 6 ? ` · +${excluded.length - 6} more` : ""}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
