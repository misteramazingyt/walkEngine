"use client";

import type { BurkeClusterRunDto } from "@/server/walks";

// The BurkeCluster panel. The narrative reads as curiosity; the computation
// stays inspectable beside it in the Cluster Atlas, the Discovery Trace, and
// the transition table that proves each subject was latent in the last.

function Meter({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-32 shrink-0 text-right text-[10px] text-ink-dim">
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

export function BurkeClusterPanel({ run }: { run: BurkeClusterRunDto }) {
  const { state, narrative, transitionTable } = run;
  const subjects = state.acceptedClusters;
  const presentation = [...subjects].reverse();

  return (
    <div className="flex h-full flex-col p-3">
      <div className="bevel-in min-h-0 flex-1 overflow-auto p-4">
        <div className="groupbox p-2">
          <div className="text-[11px] font-bold tracking-wide uppercase text-ink-dim">
            Seed region · provisional ending
          </div>
          <p className="mt-1 font-(family-name:--font-prose) text-[14px] leading-relaxed">
            “{state.seed.rawInput}”
          </p>
          <p className="mt-1 text-[11px] text-ink-dim">
            Resolved to: {state.seed.resolvedPages.map((p) => p.title).join(" · ")}
          </p>
          {state.attention.salienceTerms.length > 0 && (
            <p className="mt-1 text-[11px]">
              <span className="font-bold">Attend: </span>
              {state.attention.salienceTerms
                .map((t) => `${t.term} ${"+".repeat(Math.max(1, Math.round(t.weight)))}`)
                .join(" · ")}
            </p>
          )}
          {state.attention.avoidPatterns.length > 0 && (
            <p className="mt-1 text-[11px] text-warn">
              Avoid: {state.attention.avoidPatterns.join("; ")}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-6">
            <div>
              <Meter
                label="subjects accepted"
                value={Math.min(1, subjects.length / 3)}
              />
              <Meter
                label="mean stability"
                value={
                  subjects.length > 0
                    ? subjects.reduce((s, c) => s + c.stability, 0) / subjects.length
                    : 0
                }
              />
              <Meter
                label="mean complementarity"
                value={
                  subjects.length > 0
                    ? subjects.reduce((s, c) => s + c.packet.complementarity, 0) /
                      subjects.length
                    : 0
                }
              />
            </div>
            <div className="text-[10px] text-ink-dim">
              <div>sampled pages: {state.budget.sampledPages}</div>
              <div>edges: {state.budget.edges}</div>
              <div>walk episodes: {state.budget.walkEpisodes}</div>
              <div>cluster cycles: {state.budget.clusterCycles}</div>
              <div>model calls: {state.budget.modelCalls}</div>
              <div>random seed: {run.randomSeed}</div>
              <div>ended: {run.endReason.replaceAll("_", " ").toLowerCase()}</div>
            </div>
          </div>
        </div>

        <SectionLabel>Subject route (presentation order)</SectionLabel>
        <p className="mt-1 text-[12px]">
          Introduction
          {presentation.map((c) => (
            <span key={c.subject.id}>
              {" → "}
              <span className="font-bold">{c.subject.label}</span>
            </span>
          ))}
          {" → "}
          <span className="italic">seed</span>
        </p>
        <p className="mt-1 text-[11px] text-ink-dim">
          Discovery order: {subjects.map((c) => c.subject.label).join(" → ")}
        </p>

        <SectionLabel>Transition table — why each subject was latent</SectionLabel>
        <div className="mt-1 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-ink-dim">
                <th className="pr-2 font-bold">From</th>
                <th className="pr-2 font-bold">Predicate</th>
                <th className="pr-2 font-bold">Deficiency</th>
                <th className="pr-2 font-bold">To</th>
                <th className="pr-2 font-bold">Why latent</th>
                <th className="font-bold">Conf.</th>
              </tr>
            </thead>
            <tbody>
              {transitionTable.map((row, i) => (
                <tr key={i} className="border-t border-(--color-bevel-dark)/40 align-top">
                  <td className="py-1 pr-2">{row.previousSubject}</td>
                  <td className="py-1 pr-2">{row.predicateIntroduced}</td>
                  <td className="py-1 pr-2">{row.deficiency}</td>
                  <td className="py-1 pr-2 font-bold">{row.newSubject}</td>
                  <td className="py-1 pr-2">{row.whyLatent}</td>
                  <td className="py-1">{row.confidence.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <SectionLabel>Cluster atlas</SectionLabel>
        {subjects.map((c) => (
          <div key={c.subject.id} className="groupbox mt-2 p-2">
            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
              <span className="font-bold">
                {c.subject.label}{" "}
                <span className="bevel-out px-1 text-[10px]">{c.subject.type}</span>
                {c.subject.synthesized && (
                  <span className="ml-1 bg-warn px-1 text-[10px] text-titlebar-text">
                    synthesized
                  </span>
                )}
              </span>
              <span className="text-ink-dim">
                {c.clusterId} · {c.packet.size} pages
              </span>
            </div>
            <p className="mt-1 text-[11px]">
              <span className="font-bold">Central: </span>
              {c.subject.centralPageTitle ?? "— (synthesized)"} ·{" "}
              <span className="font-bold">Anchor: </span>
              {c.subject.audienceAnchor || "none"}
            </p>
            <p className="mt-1 text-[11px] text-ink-dim">
              Constitutive: {c.subject.constitutivePages.join(", ")}
              {c.subject.peripheralPages.length > 0 && (
                <> · Peripheral: {c.subject.peripheralPages.join(", ")}</>
              )}
            </p>
            <p className="mt-1 text-[10px] text-ink-dim">
              density {c.packet.density.toFixed(2)} · conductance{" "}
              {c.packet.conductance.toFixed(2)} · complementarity{" "}
              {c.packet.complementarity.toFixed(2)} · intelligibility{" "}
              {c.packet.audienceIntelligibility.toFixed(2)} · stability{" "}
              {c.stability.toFixed(2)}
              {c.packet.bridges.length > 0 && (
                <> · bridges: {c.packet.bridges.join(", ")}</>
              )}
            </p>
            {c.narration && (
              <p className="mt-1 font-(family-name:--font-prose) text-[12px] leading-relaxed">
                {c.narration.account}
              </p>
            )}
          </div>
        ))}

        <SectionLabel>Discovery trace</SectionLabel>
        {state.cycles.map((cycle) => (
          <div key={cycle.cycle} className="groupbox mt-2 p-2 text-[11px]">
            <div className="font-bold">
              Cycle {cycle.cycle} from {cycle.originTitles.join(", ")}
            </div>
            {cycle.deficiencyStatement && (
              <p className="mt-0.5 text-ink-dim">
                Directed by: {cycle.deficiencyStatement}
              </p>
            )}
            <p className="mt-0.5 text-ink-dim">
              {cycle.nodesSampled} pages · {cycle.edgesBuilt} edges ·{" "}
              {cycle.episodes.length} episodes ·{" "}
              {cycle.clustering.clusters.length} clusters at resolution{" "}
              {cycle.clustering.chosenResolution}
              {cycle.chosenClusterId && <> · chose {cycle.chosenClusterId}</>}
            </p>
            <p className="mt-0.5 text-ink-dim">
              policies:{" "}
              {[...new Set(cycle.episodes.map((e) => e.policy))].join(", ")}
            </p>
          </div>
        ))}

        {(state.rejectedClusters.length > 0 || state.rejectedSubjects.length > 0) && (
          <>
            <SectionLabel>Rejected</SectionLabel>
            <ul className="mt-1 text-[11px] text-ink-dim">
              {state.rejectedSubjects.slice(0, 12).map((r, i) => (
                <li key={`s${i}`} className="py-0.5">
                  subject “{r.label}” — {r.reason}
                </li>
              ))}
              {state.rejectedClusters.slice(0, 12).map((r, i) => (
                <li key={`c${i}`} className="py-0.5">
                  {r.clusterId} — {r.reason}
                </li>
              ))}
            </ul>
          </>
        )}

        {narrative && (
          <>
            <SectionLabel>Narrative</SectionLabel>
            <div className="mt-1 font-(family-name:--font-prose) text-[14px] leading-relaxed">
              <p className="font-bold">{narrative.title}</p>
              <p className="mt-2">{narrative.opening}</p>
              {narrative.movements.map((m) => (
                <div key={m.subjectId}>
                  <p className="mt-2">{m.prose}</p>
                  {m.pivotProse && <p className="mt-2 italic">{m.pivotProse}</p>}
                </div>
              ))}
              <p className="mt-2">{narrative.returnToSeed}</p>
              <p className="mt-2 font-bold">{narrative.culmination}</p>
            </div>
            <p className="mt-2 text-[11px] text-ink-dim">
              Ordering: {narrative.orderingRationale}
            </p>
            {narrative.ledger.length > 0 && (
              <>
                <SectionLabel>Epistemic ledger</SectionLabel>
                <ul className="mt-1 text-[11px]">
                  {narrative.ledger.map((e, i) => (
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
      </div>
    </div>
  );
}
