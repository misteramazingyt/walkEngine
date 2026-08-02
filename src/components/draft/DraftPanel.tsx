"use client";

import { BURKE_QUESTION_LABELS } from "@/domain/enums";
import type { BurkeRunDto } from "@/server/walks";

// The right panel. In Burke mode it is the walker's journal: salience,
// the four-field note stream, elasticity checkpoints, and the final
// recoding. Draft 0 proper (the Burkean documentary draft) arrives with
// Phase 5 and will live here too.

export function DraftPanel({ burkeRun }: { burkeRun: BurkeRunDto | null }) {
  if (!burkeRun) {
    return (
      <div className="flex h-full flex-col p-3">
        <div className="bevel-in min-h-0 flex-1 overflow-auto p-4">
          <p className="font-(family-name:--font-prose) text-[14px] leading-relaxed text-ink-dim">
            Draft 0 will appear here after composition (Phase 5): an
            endpoint-first, backward-planned, forward-written narrative whose
            every transition names its carrier, inherited pressure, and
            warrant class. In Burke walker mode, this panel becomes the
            walker&apos;s journal — its notes, story checkpoints, and final
            redescription of your seed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-3">
      <div className="bevel-in min-h-0 flex-1 overflow-auto p-4">
        <div className="mb-3">
          <div className="text-[11px] font-bold tracking-wide uppercase text-ink-dim">
            Attend
          </div>
          <p className="mt-1 text-[12px]">
            {burkeRun.salience
              .map((s) => `${s.term} ${"+".repeat(Math.round(s.weight))}`)
              .join(" · ")}
          </p>
        </div>

        <div className="text-[11px] font-bold tracking-wide uppercase text-ink-dim">
          Notes
        </div>
        {burkeRun.notes.map((note) => (
          <div key={note.visitIndex} className="groupbox mt-2 p-2">
            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
              <span className="font-bold">
                #{note.visitIndex} {note.articleTitle}
              </span>
              <span
                className="bg-titlebar px-1 font-bold text-titlebar-text"
                title={BURKE_QUESTION_LABELS[note.question]}
              >
                {note.question}
              </span>
            </div>
            <dl className="mt-1 text-[12px] leading-snug">
              <dt className="font-bold text-ink-dim">Observation</dt>
              <dd>{note.observation}</dd>
              <dt className="mt-1 font-bold text-ink-dim">Changed understanding</dt>
              <dd>{note.changedUnderstanding}</dd>
              <dt className="mt-1 font-bold text-ink-dim">Return to seed</dt>
              <dd>{note.returnToSeed}</dd>
            </dl>
          </div>
        ))}

        {burkeRun.checkpoints.length > 0 && (
          <>
            <div className="mt-3 text-[11px] font-bold tracking-wide uppercase text-ink-dim">
              Elasticity checkpoints
            </div>
            {burkeRun.checkpoints.map((checkpoint) => (
              <div key={checkpoint.afterPages} className="groupbox mt-2 p-2">
                <div className="text-[11px] font-bold">
                  After {checkpoint.afterPages} pages ·{" "}
                  {checkpoint.changedSubstantially
                    ? "story changed"
                    : "story stable"}
                </div>
                <p className="mt-1 font-(family-name:--font-prose) text-[13px] leading-relaxed">
                  {checkpoint.story}
                </p>
                <p className="mt-1 text-[11px] text-ink-dim">
                  {checkpoint.rationale}
                </p>
              </div>
            ))}
          </>
        )}

        {burkeRun.finalRedescription && (
          <>
            <div className="mt-3 text-[11px] font-bold tracking-wide uppercase text-ink-dim">
              Recoding — {burkeRun.endReason.replaceAll("_", " ").toLowerCase()}
            </div>
            <p className="mt-1 font-(family-name:--font-prose) text-[14px] leading-relaxed">
              {burkeRun.finalRedescription}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
