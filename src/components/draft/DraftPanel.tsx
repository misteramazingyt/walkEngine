"use client";

import { BURKE_QUESTION_LABELS } from "@/domain/enums";
import type { BurkeRunDto } from "@/server/walks";

// The right panel. In Burke mode it exposes the walker's reasoning: the
// current theory and what it still cannot explain, the open questions, the
// note stream (each note a record of explanatory movement, with the bridge
// that motivated it), theory checkpoints classified by how much actually
// changed, and the final narrative.

function Meter({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-28 shrink-0 text-right text-[10px] text-ink-dim">
        {label}
      </span>
      <div className="bevel-in h-2.5 w-20 shrink-0">
        <div
          className="h-full"
          style={{
            width: `${pct}%`,
            background: invert ? "var(--color-warn)" : "var(--color-accent)",
            opacity: 0.75,
          }}
        />
      </div>
      <span className="text-[10px] text-ink-dim">{value.toFixed(2)}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 text-[11px] font-bold tracking-wide uppercase text-ink-dim">
      {children}
    </div>
  );
}

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
            walker&apos;s reasoning: its evolving theory of your seed, what
            that theory still cannot explain, and the motivated pivots that
            changed it.
          </p>
        </div>
      </div>
    );
  }

  const { storyState: state, notes, checkpoints, narrative } = burkeRun;
  const openQuestions = state.unresolvedQuestions
    .filter((q) => q.status === "open")
    .sort((a, b) => b.priority - a.priority);
  const settled = state.unresolvedQuestions.filter((q) => q.status !== "open");
  const lastCoherence =
    burkeRun.coherenceReports[burkeRun.coherenceReports.length - 1];
  const analogyNotes = notes.filter(
    (n) =>
      n.evidenceStatus === "structural analogy" ||
      n.evidenceStatus === "speculative resonance",
  ).length;

  return (
    <div className="flex h-full flex-col p-3">
      <div className="bevel-in min-h-0 flex-1 overflow-auto p-4">
        <div className="groupbox p-2">
          <div className="text-[11px] font-bold tracking-wide uppercase text-ink-dim">
            Current theory
          </div>
          <p className="mt-1 font-(family-name:--font-prose) text-[13px] leading-relaxed">
            {state.currentTheory}
          </p>
          <div className="mt-2 text-[11px]">
            <span className="font-bold">Tension: </span>
            {state.currentTension}
          </div>
          <div className="mt-1 text-[11px]">
            <span className="font-bold">Still unexplained: </span>
            {state.mystery.currentMystery}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-6">
            <div>
              <Meter label="mystery" value={state.mystery.mysteryScore} />
              <Meter
                label="saturation"
                value={state.saturation.estimatedSaturation}
              />
            </div>
            <div>
              {lastCoherence && (
                <Meter label="coherence" value={lastCoherence.score} />
              )}
              <Meter
                label="analogy share"
                value={notes.length > 0 ? analogyNotes / notes.length : 0}
                invert
              />
            </div>
            <div className="text-[10px] text-ink-dim">
              <div>backtracks: {burkeRun.backtrackCount}</div>
              <div>rejected routes: {burkeRun.rejectedRoutes.length}</div>
              <div>ended: {burkeRun.endReason.replaceAll("_", " ").toLowerCase()}</div>
            </div>
          </div>
        </div>

        {openQuestions.length > 0 && (
          <>
            <SectionLabel>Open questions</SectionLabel>
            <ul className="mt-1 text-[12px]">
              {openQuestions.map((q) => (
                <li key={q.id} className="py-0.5">
                  <span className="bg-titlebar px-1 text-[10px] font-bold text-titlebar-text">
                    {q.questionType}
                  </span>{" "}
                  {q.question}{" "}
                  <span className="text-ink-dim">
                    (priority {q.priority.toFixed(2)})
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {settled.length > 0 && (
          <>
            <SectionLabel>Settled questions</SectionLabel>
            <ul className="mt-1 text-[11px] text-ink-dim">
              {settled.map((q) => (
                <li key={q.id} className="py-0.5">
                  [{q.status}] {q.question}
                  {q.answerSummary ? ` — ${q.answerSummary}` : ""}
                </li>
              ))}
            </ul>
          </>
        )}

        <SectionLabel>Notes — explanatory movement</SectionLabel>
        {notes.map((note) => (
          <div key={note.step} className="groupbox mt-2 p-2">
            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
              <span className="font-bold">
                #{note.step} {note.articleTitle}
              </span>
              <span className="flex gap-1">
                <span
                  className="bg-titlebar px-1 font-bold text-titlebar-text"
                  title={BURKE_QUESTION_LABELS[note.selectedBurkeQuestion]}
                >
                  {note.selectedBurkeQuestion}
                </span>
                <span
                  className="bevel-out px-1"
                  title="How this node relates to the seed"
                >
                  {note.seedRelation}
                </span>
                <span className="bevel-out px-1" title="Evidential character">
                  {note.evidenceStatus}
                  {note.analogyCarrier ? ` · ${note.analogyCarrier}` : ""}
                </span>
              </span>
            </div>
            {note.bridge && (
              <p className="mt-1 border-l-2 border-(--color-accent) pl-2 text-[11px] italic">
                {note.bridge.unexplainedByPrevious} {note.bridge.whyNext}
              </p>
            )}
            <dl className="mt-1 text-[12px] leading-snug">
              <dt className="font-bold text-ink-dim">Asked</dt>
              <dd>{note.navigationQuestion}</dd>
              <dt className="mt-1 font-bold text-ink-dim">Evidence</dt>
              <dd>{note.relevantEvidence}</dd>
              <dt className="mt-1 font-bold text-ink-dim">
                Claim established or challenged
              </dt>
              <dd>{note.claimEstablishedOrChallenged}</dd>
              <dt className="mt-1 font-bold text-ink-dim">Theory changed</dt>
              <dd className="text-[11px] text-ink-dim">
                <span className="line-through">{note.theoryBefore}</span>
              </dd>
              <dd>{note.theoryAfter}</dd>
              <dt className="mt-1 font-bold text-ink-dim">Next question</dt>
              <dd>{note.newUnresolvedQuestion}</dd>
            </dl>
          </div>
        ))}

        {checkpoints.length > 0 && (
          <>
            <SectionLabel>Theory checkpoints</SectionLabel>
            {checkpoints.map((c) => (
              <div key={c.version} className="groupbox mt-2 p-2">
                <div className="text-[11px] font-bold">
                  v{c.version} after {c.afterAcceptedNodes} nodes ·{" "}
                  <span
                    className={
                      c.changeClass === "none" ||
                      c.changeClass === "minor elaboration"
                        ? "text-warn"
                        : "text-ok"
                    }
                  >
                    {c.changeClass}
                  </span>
                </div>
                <p className="mt-1 font-(family-name:--font-prose) text-[13px] leading-relaxed">
                  {c.revisedTheory}
                </p>
                <p className="mt-1 text-[11px] text-ink-dim">
                  Unexplained: {c.whatRemainsUnexplained} · Next:{" "}
                  {c.nextBestQuestion}
                </p>
              </div>
            ))}
          </>
        )}

        {narrative && (
          <>
            <SectionLabel>Narrative</SectionLabel>
            <div className="mt-1 font-(family-name:--font-prose) text-[14px] leading-relaxed">
              <p className="font-bold">{narrative.hook}</p>
              <p className="mt-2">{narrative.initialApparentAnswer}</p>
              <p className="mt-2">{narrative.firstContradiction}</p>
              {narrative.pivots.map((p) => (
                <p key={p.title} className="mt-2">
                  <span className="font-bold">{p.title}. </span>
                  {p.motivation} {p.development}
                </p>
              ))}
              {narrative.reversals.map((r, i) => (
                <p key={i} className="mt-2 italic">
                  {r}
                </p>
              ))}
              <p className="mt-2">{narrative.returnToSeed}</p>
              <p className="mt-2 text-[12px] text-ink-dim">
                Remaining uncertainty: {narrative.remainingUncertainty}
              </p>
            </div>
            {narrative.evidenceLedger.length > 0 && (
              <>
                <SectionLabel>Evidence ledger</SectionLabel>
                <ul className="mt-1 text-[11px]">
                  {narrative.evidenceLedger.map((e, i) => (
                    <li key={i} className="py-0.5">
                      <span className="bevel-out px-1 text-[10px]">
                        {e.status}
                      </span>{" "}
                      {e.claim}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {burkeRun.rejectedRoutes.length > 0 && (
          <>
            <SectionLabel>Rejected routes</SectionLabel>
            <ul className="mt-1 text-[11px] text-ink-dim">
              {burkeRun.rejectedRoutes.slice(0, 20).map((r, i) => (
                <li key={i} className="py-0.5">
                  {r.title} — {r.reason}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
