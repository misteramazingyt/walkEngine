"use client";

import type { AnamnesisRunDto } from "@/server/walks";

// The anamnetic panel: the terminal sentence, what it owes, what has been
// paid, and — at the end — the composition that arrives at it.

const DEBT_STATUS_STYLE: Record<string, string> = {
  unpaid: "text-warn",
  partially_paid: "text-ink",
  paid: "text-ok",
  reframed: "text-accent",
  abandoned: "text-ink-dim",
};

function Meter({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-28 shrink-0 text-right text-[10px] text-ink-dim">
        {label}
      </span>
      <div className="bevel-in h-2.5 w-20 shrink-0">
        <div
          className="h-full"
          style={{ width: `${pct}%`, background: "var(--color-accent)", opacity: 0.75 }}
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

export function AnamnesisPanel({ run }: { run: AnamnesisRunDto }) {
  const { state, mediations, recollectionTests, composition } = run;
  const outstanding = state.debts.filter(
    (d) => d.status === "unpaid" || d.status === "partially_paid",
  );
  const settled = state.debts.filter(
    (d) => d.status === "paid" || d.status === "reframed",
  );
  const lastTest = recollectionTests[recollectionTests.length - 1];

  return (
    <div className="flex h-full flex-col p-3">
      <div className="bevel-in min-h-0 flex-1 overflow-auto p-4">
        <div className="groupbox p-2">
          <div className="text-[11px] font-bold tracking-wide uppercase text-ink-dim">
            Terminal sentence · {state.terminal.register}
          </div>
          <p className="mt-1 font-(family-name:--font-prose) text-[15px] leading-relaxed">
            “{state.terminal.text}”
          </p>
          <div className="mt-2 text-[11px]">
            <span className="font-bold">Currently reads as: </span>
            {state.currentGloss}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-6">
            <div>
              {lastTest && (
                <Meter label="inhabitability" value={lastTest.inhabitabilityScore} />
              )}
              <Meter
                label="debts settled"
                value={
                  state.debts.length > 0
                    ? settled.length / state.debts.length
                    : 0
                }
              />
            </div>
            <div className="text-[10px] text-ink-dim">
              <div>mediations: {mediations.length}</div>
              <div>anchors: {state.anchors.length}</div>
              <div>abandoned: {run.abandonedRoutes.length}</div>
              <div>ended: {run.endReason.replaceAll("_", " ").toLowerCase()}</div>
            </div>
          </div>
        </div>

        <SectionLabel>Charges</SectionLabel>
        <ul className="mt-1 text-[12px]">
          {state.charges.map((c) => (
            <li key={c.id} className="py-0.5">
              <span className="bevel-out px-1 text-[10px]">{c.kind}</span>{" "}
              <span className="font-bold">“{c.fragment}”</span> — {c.whatItAsserts}{" "}
              <span className="text-ink-dim">({c.weight.toFixed(2)})</span>
            </li>
          ))}
        </ul>

        <SectionLabel>Debt ledger</SectionLabel>
        <ul className="mt-1 text-[12px]">
          {[...outstanding, ...settled].map((d) => (
            <li key={d.id} className="py-0.5">
              <span
                className={`font-bold ${DEBT_STATUS_STYLE[d.status] ?? ""}`}
              >
                [{d.status.replaceAll("_", " ")}]
              </span>{" "}
              <span className="text-ink-dim">({d.debtType.replaceAll("_", " ")})</span>{" "}
              {d.statement}
              {d.paidBy.length > 0 && (
                <span className="text-ink-dim"> — paid by {d.paidBy.join(", ")}</span>
              )}
              {d.residue && (
                <div className="pl-4 text-[11px] text-warn">
                  residue: {d.residue}
                </div>
              )}
            </li>
          ))}
        </ul>

        <SectionLabel>Mediations</SectionLabel>
        {mediations.map((m) => (
          <div key={m.step} className="groupbox mt-2 p-2">
            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
              <span className="font-bold">
                #{m.step} {m.articleTitle}
              </span>
              <span className="flex gap-1">
                <span className="bg-titlebar px-1 font-bold text-titlebar-text">
                  pays {m.debtId}
                </span>
                <span className="bevel-out px-1">{m.evidenceStatus}</span>
              </span>
            </div>
            {m.bridge && (
              <p className="mt-1 border-l-2 border-(--color-accent) pl-2 text-[11px] italic">
                {m.bridge.unresolvedByPrevious} {m.bridge.whyNext}
              </p>
            )}
            <dl className="mt-1 text-[12px] leading-snug">
              <dt className="font-bold text-ink-dim">Asked</dt>
              <dd>{m.searchQuestion}</dd>
              <dt className="mt-1 font-bold text-ink-dim">Supplies</dt>
              <dd>{m.whatItSupplies}</dd>
              <dt className="mt-1 font-bold text-ink-dim">Anchor</dt>
              <dd>
                <span className="bevel-out px-1 text-[10px]">{m.anchor.kind}</span>{" "}
                {m.anchor.description}
              </dd>
              <dt className="mt-1 font-bold text-ink-dim">
                The sentence now reads
              </dt>
              <dd>{m.transformedUnderstanding}</dd>
              {m.residue && (
                <>
                  <dt className="mt-1 font-bold text-warn">Still owed</dt>
                  <dd className="text-warn">{m.residue}</dd>
                </>
              )}
            </dl>
          </div>
        ))}

        {recollectionTests.length > 0 && (
          <>
            <SectionLabel>Re-readings</SectionLabel>
            {recollectionTests.map((t) => (
              <div key={t.afterMediations} className="groupbox mt-2 p-2">
                <div className="text-[11px] font-bold">
                  After {t.afterMediations} mediations ·{" "}
                  <span className={t.inhabitable ? "text-ok" : "text-warn"}>
                    {t.inhabitable ? "inhabitable" : "not yet inhabitable"} (
                    {t.inhabitabilityScore.toFixed(2)})
                  </span>
                </div>
                <p className="mt-1 font-(family-name:--font-prose) text-[13px] leading-relaxed">
                  {t.rereading}
                </p>
                {t.whatStillFallsFlat.length > 0 && (
                  <p className="mt-1 text-[11px] text-warn">
                    Still flat: {t.whatStillFallsFlat.join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </>
        )}

        {composition && (
          <>
            <SectionLabel>The arrival</SectionLabel>
            <div className="mt-1 font-(family-name:--font-prose) text-[14px] leading-relaxed">
              <p>{composition.opening}</p>
              {composition.movements.map((mv) => (
                <p key={mv.title} className="mt-2">
                  {mv.prose}
                </p>
              ))}
              <p className="mt-2">{composition.approach}</p>
              <p className="mt-3 border-l-2 border-(--color-accent) pl-3 text-[15px] font-bold">
                {composition.terminalSentence}
              </p>
            </div>
            <p className="mt-2 text-[11px] text-ink-dim">
              Ordering: {composition.orderingRationale}
            </p>
            <p className="mt-1 text-[11px] text-ink-dim">
              Unearned: {composition.whatRemainsUnearned}
            </p>
            {composition.ledger.length > 0 && (
              <>
                <SectionLabel>Evidence ledger</SectionLabel>
                <ul className="mt-1 text-[11px]">
                  {composition.ledger.map((e, i) => (
                    <li key={i} className="py-0.5">
                      <span className="bevel-out px-1 text-[10px]">{e.status}</span>{" "}
                      {e.claim}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {run.abandonedRoutes.length > 0 && (
          <>
            <SectionLabel>Abandoned</SectionLabel>
            <ul className="mt-1 text-[11px] text-ink-dim">
              {run.abandonedRoutes.slice(0, 20).map((r, i) => (
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
