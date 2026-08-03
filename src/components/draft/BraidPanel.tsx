"use client";

import type { BraidDto } from "@/server/braid";

// The braid, read as prose, with the apparatus beside it. What the reader
// should be able to check is the claim the plan makes structurally: every
// subject that carries a beat was mentioned in an earlier one. The
// diagnostics say whether that held, and the notes say where the writing
// broke a promise the plan made.

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-[11px]">
      <span className="text-ink-dim">{label}</span>
      <span className={warn ? "font-bold text-warn" : "font-bold"}>{value}</span>
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

export function BraidPanel({
  braid,
  onCompose,
  busy,
  error,
}: {
  braid: BraidDto | null;
  onCompose: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-2 flex items-center gap-2">
        <button className="retro-button" onClick={onCompose} disabled={busy}>
          {busy ? "Braiding…" : braid ? "Re-braid" : "Braid this walk"}
        </button>
        <span className="text-[11px] text-ink-dim">
          Rewrites the walk so subjects overlap; no new archive requests.
        </span>
      </div>
      {error && <p className="mb-2 text-[11px] text-warn">{error}</p>}

      <div className="bevel-in min-h-0 flex-1 overflow-auto p-4">
        {!braid ? (
          <p className="font-(family-name:--font-prose) text-[14px] leading-relaxed text-ink-dim">
            A BurkeCluster walk narrates one subject, pivots, and leaves it
            behind. Measured over Connections series 1, that is not what the
            form does: a subject holds the topic for about two paragraphs
            while eleven to sixteen others stay live around it, and seven
            mentions in ten are a subject helping explain something else.
            Braiding recomposes this walk on that shape, using the subjects it
            accepted together with the candidates it interpreted and
            discarded.
          </p>
        ) : (
          <>
            <div className="groupbox p-2">
              <div className="text-[11px] font-bold tracking-wide uppercase text-ink-dim">
                The braid
              </div>
              <Stat label="beats" value={braid.diagnostics.beatCount} />
              <Stat label="narrated subjects" value={braid.diagnostics.narratedSubjects} />
              <Stat
                label="supporting only (from discards)"
                value={braid.diagnostics.supportingOnlySubjects}
              />
              <Stat label="median live at once" value={braid.diagnostics.medianLiveAtOnce} />
              <Stat label="max live at once" value={braid.diagnostics.maxLiveAtOnce} />
              <Stat label="median topic run" value={braid.diagnostics.medianTopicRun} />
              <Stat
                label="planted before topical"
                value={braid.diagnostics.plantsBeforeTopic}
              />
              <Stat
                label="topical without a plant"
                value={braid.diagnostics.topicsWithoutPlant}
                warn={braid.diagnostics.topicsWithoutPlant > 1}
              />
              <p className="mt-1 text-[10px] text-ink-dim">
                Only the opening beat may be topical without a plant; anything
                more means a subject arrived unprepared.
              </p>
            </div>

            {braid.composition.notes.length > 0 && (
              <>
                <SectionLabel>Where the writing left the plan</SectionLabel>
                <ul className="mt-1 text-[11px] text-warn">
                  {braid.composition.notes.map((note, i) => (
                    <li key={i} className="py-0.5">
                      {note}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <SectionLabel>Composition</SectionLabel>
            <div className="mt-1 font-(family-name:--font-prose) text-[14px] leading-relaxed">
              {braid.composition.beats.map((beat) => (
                <div key={beat.index} className="mt-3">
                  <div className="text-[10px] tracking-wide uppercase text-ink-dim">
                    {beat.index}. {beat.topicLabel}
                    {beat.plantSentence ? " · plants" : ""}
                  </div>
                  <p className="mt-1">{beat.prose}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
