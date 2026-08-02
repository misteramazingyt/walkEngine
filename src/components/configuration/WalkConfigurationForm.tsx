"use client";

import {
  CONSCIOUSNESS_CONTROLS,
  CONSCIOUSNESS_LABELS,
  CRITERIA,
  CRITERION_LABELS,
} from "@/domain/enums";
import { LLM_ONLY_CRITERIA } from "@/domain/walk/features";
import { MOTIF_PRESETS } from "@/domain/motifs/presets";
import type { WalkConfiguration } from "@/schemas/walk-configuration";
import {
  FieldRow,
  GroupBox,
  RetroButton,
  RetroCheckbox,
  RetroInput,
  RetroSelect,
  RetroTextarea,
} from "@/components/ui/retro";

// Controlled form over the full WalkConfiguration. Every field persists via
// PATCH /api/projects/:id (the Save button); actions that belong to later
// phases are rendered disabled with the phase that activates them — no
// placebo buttons.

export interface WalkActions {
  onGenerate: () => void;
  onRegenerateSameSeed: () => void;
  /** A walk job is queued or running. */
  busy: boolean;
  hasWalk: boolean;
  jobLabel: string | null;
  error: string | null;
}

interface Props {
  value: WalkConfiguration;
  onChange: (next: WalkConfiguration) => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
  saveError: string | null;
  walk: WalkActions;
}

export function WalkConfigurationForm({
  value,
  onChange,
  onSave,
  saving,
  dirty,
  saveError,
  walk,
}: Props) {
  const set = <K extends keyof WalkConfiguration>(
    key: K,
    v: WalkConfiguration[K],
  ) => onChange({ ...value, [key]: v });

  const criteriological = value.walkMode === "CRITERIOLOGICAL";
  const burke = value.walkMode === "BURKE";
  const setBurke = <K extends keyof WalkConfiguration["burke"]>(
    key: K,
    v: WalkConfiguration["burke"][K],
  ) => set("burke", { ...value.burke, [key]: v });

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-start gap-2">
        <GroupBox legend="Walk mode" className="min-w-56">
          <FieldRow label="Mode" htmlFor="walk-mode">
            <RetroSelect
              id="walk-mode"
              value={value.walkMode}
              onChange={(e) =>
                set("walkMode", e.target.value as WalkConfiguration["walkMode"])
              }
            >
              <option value="RANDOM">Random</option>
              <option value="CRITERIOLOGICAL">Criteriological</option>
              <option value="BURKE">Burke walker</option>
            </RetroSelect>
          </FieldRow>
          <FieldRow label="Sampling" htmlFor="sampling-mode">
            <RetroSelect
              id="sampling-mode"
              value={value.samplingMode}
              disabled={!criteriological}
              title={
                criteriological
                  ? undefined
                  : "Sampling applies to criteriological walks"
              }
              onChange={(e) =>
                set(
                  "samplingMode",
                  e.target.value as WalkConfiguration["samplingMode"],
                )
              }
            >
              <option value="GREEDY">Greedy</option>
              <option value="WEIGHTED">Weighted</option>
              <option value="EXPLORATORY">Exploratory (softmax)</option>
              <option value="BEAM" disabled>
                Beam (feature-flagged)
              </option>
            </RetroSelect>
          </FieldRow>
        </GroupBox>

        <GroupBox legend="Starting point" className="min-w-0 sm:min-w-72">
          <FieldRow label="Resolve start as" htmlFor="start-kind">
            <RetroSelect
              id="start-kind"
              value={value.start.kind}
              onChange={(e) =>
                set("start", {
                  ...value.start,
                  kind: e.target.value as WalkConfiguration["start"]["kind"],
                })
              }
            >
              <option value="TITLE">Exact article title</option>
              <option value="URL">Wikipedia URL</option>
              <option value="TOPIC">Free-text topic</option>
              <option value="RANDOM">Random article</option>
            </RetroSelect>
          </FieldRow>
          <FieldRow label="Start value" htmlFor="start-value">
            <RetroInput
              id="start-value"
              className="w-64"
              value={value.start.value}
              disabled={value.start.kind === "RANDOM"}
              placeholder={
                value.start.kind === "RANDOM"
                  ? "Chosen by seeded chance"
                  : "e.g. Touchstone (assaying tool)"
              }
              onChange={(e) =>
                set("start", { ...value.start, value: e.target.value })
              }
            />
          </FieldRow>
          <FieldRow label="Endpoint strategy" htmlFor="endpoint-strategy">
            <RetroSelect
              id="endpoint-strategy"
              value={value.endpointStrategy}
              onChange={(e) =>
                set(
                  "endpointStrategy",
                  e.target.value as WalkConfiguration["endpointStrategy"],
                )
              }
            >
              <option value="WALK_FINAL">Final node reached by walk</option>
              <option value="MANUAL_AFTER_WALK">Choose manually after walk</option>
              <option value="SPECIFIED_IN_ADVANCE">Specify in advance</option>
              <option value="LLM_SELECTED">LLM selects strongest endpoint</option>
            </RetroSelect>
          </FieldRow>
          <FieldRow label="Desired endpoint" htmlFor="specified-endpoint">
            <RetroInput
              id="specified-endpoint"
              className="w-64"
              value={value.specifiedEndpoint}
              disabled={value.endpointStrategy !== "SPECIFIED_IN_ADVANCE"}
              placeholder={
                value.endpointStrategy === "SPECIFIED_IN_ADVANCE"
                  ? "Article title of desired endpoint"
                  : "Only for “specify in advance”"
              }
              onChange={(e) => set("specifiedEndpoint", e.target.value)}
            />
          </FieldRow>
        </GroupBox>

        <GroupBox legend="Walk parameters" className="min-w-0 sm:min-w-72">
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <FieldRow label="Walk length" htmlFor="walk-length">
              <RetroInput
                id="walk-length"
                type="number"
                min={2}
                max={100}
                className="w-20"
                value={value.walkLength}
                onChange={(e) => set("walkLength", Number(e.target.value))}
              />
            </FieldRow>
            <FieldRow label="Branch factor" htmlFor="branch-factor">
              <RetroInput
                id="branch-factor"
                type="number"
                min={1}
                max={200}
                className="w-20"
                value={value.branchFactor}
                onChange={(e) => set("branchFactor", Number(e.target.value))}
              />
            </FieldRow>
            <FieldRow label="Max graph requests" htmlFor="max-requests">
              <RetroInput
                id="max-requests"
                type="number"
                min={1}
                max={2000}
                className="w-20"
                value={value.maxGraphRequests}
                onChange={(e) => set("maxGraphRequests", Number(e.target.value))}
              />
            </FieldRow>
            <FieldRow label="Language" htmlFor="language">
              <RetroInput
                id="language"
                className="w-20"
                value={value.language}
                onChange={(e) => set("language", e.target.value)}
              />
            </FieldRow>
            <FieldRow label="Random seed" htmlFor="seed">
              <RetroInput
                id="seed"
                className="w-40"
                value={value.seed}
                onChange={(e) => set("seed", e.target.value)}
              />
            </FieldRow>
            <FieldRow label="Min article length" htmlFor="min-length">
              <RetroInput
                id="min-length"
                type="number"
                min={0}
                className="w-24"
                value={value.minArticleLength}
                onChange={(e) => set("minArticleLength", Number(e.target.value))}
              />
            </FieldRow>
            <FieldRow label="Max popularity %ile" htmlFor="max-popularity">
              <RetroInput
                id="max-popularity"
                type="number"
                min={0}
                max={100}
                className="w-20"
                disabled={!criteriological}
                title="Criteriological mode only. Approximated from Wikidata sitelink counts, not real pageviews."
                value={value.maxPopularityPercentile}
                onChange={(e) =>
                  set("maxPopularityPercentile", Number(e.target.value))
                }
              />
            </FieldRow>
            <FieldRow label="Geographic bounds" htmlFor="geo-bounds">
              <RetroInput
                id="geo-bounds"
                className="w-40"
                disabled
                title="Applied from Phase 3 (needs Wikidata metadata)"
                value={value.geographicBounds}
                placeholder="e.g. Mediterranean world"
                onChange={(e) => set("geographicBounds", e.target.value)}
              />
            </FieldRow>
            <FieldRow label="Temporal from (year)" htmlFor="temporal-start">
              <RetroInput
                id="temporal-start"
                type="number"
                className="w-24"
                disabled={!criteriological}
                title="Criteriological mode only. Excludes candidates whose Wikidata era is known to fall outside the bounds; unknown eras stay eligible."
                value={value.temporalBounds.start ?? ""}
                placeholder="unbounded"
                onChange={(e) =>
                  set("temporalBounds", {
                    ...value.temporalBounds,
                    start:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </FieldRow>
            <FieldRow label="Temporal to (year)" htmlFor="temporal-end">
              <RetroInput
                id="temporal-end"
                type="number"
                className="w-24"
                disabled={!criteriological}
                title="Criteriological mode only. Excludes candidates whose Wikidata era is known to fall outside the bounds; unknown eras stay eligible."
                value={value.temporalBounds.end ?? ""}
                placeholder="unbounded"
                onChange={(e) =>
                  set("temporalBounds", {
                    ...value.temporalBounds,
                    end: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </FieldRow>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <RetroCheckbox
              label="Allow revisiting nodes"
              checked={value.allowRevisits}
              onChange={(e) => set("allowRevisits", e.target.checked)}
            />
            <RetroCheckbox
              label="Exclude disambiguation/list/category pages"
              checked={value.excludeMetaPages}
              onChange={(e) => set("excludeMetaPages", e.target.checked)}
            />
          </div>
        </GroupBox>

        {burke && (
          <GroupBox legend="Burke walker — curiosity program" className="min-w-0 flex-1 sm:min-w-96">
            <FieldRow label="Seed kind" htmlFor="burke-seed-kind">
              <RetroSelect
                id="burke-seed-kind"
                value={value.burke.seedKind}
                onChange={(e) =>
                  setBurke(
                    "seedKind",
                    e.target.value as WalkConfiguration["burke"]["seedKind"],
                  )
                }
              >
                <option value="OBJECT">Object (a lived proposition)</option>
                <option value="QUESTION">Question</option>
              </RetroSelect>
            </FieldRow>
            <FieldRow label="Seed" htmlFor="burke-seed-text">
              <RetroInput
                id="burke-seed-text"
                className="w-full max-w-md"
                value={value.burke.seedText}
                placeholder={
                  value.burke.seedKind === "OBJECT"
                    ? "e.g. AI slop is soulless."
                    : "e.g. Why does TikTok feel authoritative?"
                }
                onChange={(e) => setBurke("seedText", e.target.value)}
              />
            </FieldRow>
            <div className="mt-1">
              <label htmlFor="burke-priming" className="mb-1 block text-[12px] font-bold">
                Curiosity priming (a field of salience, not a thesis)
              </label>
              <RetroTextarea
                id="burke-priming"
                rows={3}
                className="w-full"
                value={value.burke.priming}
                placeholder="Attend especially to transitions between uniqueness and mass production, authenticity and mechanism, artistic labor, Romantic conceptions of soul, technological reproduction, institutions of taste…"
                onChange={(e) => setBurke("priming", e.target.value)}
              />
            </div>
            <div className="mt-1 grid grid-cols-1 gap-x-4 sm:grid-cols-3">
              <FieldRow label="Motif module" htmlFor="burke-motif">
                <RetroSelect
                  id="burke-motif"
                  value={value.burke.motif}
                  onChange={(e) => setBurke("motif", e.target.value)}
                >
                  <option value="">None</option>
                  {MOTIF_PRESETS.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </RetroSelect>
              </FieldRow>
              <FieldRow label="Elasticity every" htmlFor="burke-elasticity">
                <RetroInput
                  id="burke-elasticity"
                  type="number"
                  min={3}
                  max={20}
                  className="w-16"
                  title="Every N pages: tell the three-sentence story of the seed; a stable story means saturation"
                  value={value.burke.elasticityInterval}
                  onChange={(e) =>
                    setBurke("elasticityInterval", Number(e.target.value))
                  }
                />
              </FieldRow>
              <FieldRow label="Max pages (cap)" htmlFor="burke-max-pages">
                <RetroInput
                  id="burke-max-pages"
                  type="number"
                  min={3}
                  max={40}
                  className="w-16"
                  title="Safety cap only — the real stopping condition is redescription of the seed"
                  value={value.burke.maxPages}
                  onChange={(e) => setBurke("maxPages", Number(e.target.value))}
                />
              </FieldRow>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <RetroCheckbox
                label="Require motivated narrative transitions"
                title="No node may be accepted unless a bridge can be written that stands without mentioning the seed"
                checked={value.burke.requireMotivatedTransitions}
                onChange={(e) =>
                  setBurke("requireMotivatedTransitions", e.target.checked)
                }
              />
              <RetroCheckbox
                label="Allow productive detours"
                title="Permit nodes that address no open question, provided they open one that returns to the thread"
                checked={value.burke.allowProductiveDetours}
                onChange={(e) =>
                  setBurke("allowProductiveDetours", e.target.checked)
                }
              />
              <label
                htmlFor="burke-analogy"
                className="flex items-center gap-2 text-[12px]"
                title="Low: documented dependencies, institutional inheritance, direct problem–solution relations. High: morphological and affective correspondences, clearly labeled."
              >
                Analogy tolerance
                <input
                  id="burke-analogy"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  className="w-28 accent-(--color-accent)"
                  value={value.burke.analogyTolerance}
                  onChange={(e) =>
                    setBurke("analogyTolerance", Number(e.target.value))
                  }
                />
                <span className="w-8 text-[11px] text-ink-dim">
                  {value.burke.analogyTolerance.toFixed(2)}
                </span>
              </label>
            </div>
          </GroupBox>
        )}

        <GroupBox legend="Historical consciousness" className="min-w-56">
          <div className="flex flex-col gap-0.5">
            {CONSCIOUSNESS_CONTROLS.map((control) => (
              <RetroCheckbox
                key={control}
                label={CONSCIOUSNESS_LABELS[control]}
                checked={value.historicalConsciousness[control]}
                onChange={(e) =>
                  set("historicalConsciousness", {
                    ...value.historicalConsciousness,
                    [control]: e.target.checked,
                  })
                }
              />
            ))}
          </div>
        </GroupBox>
      </div>

      <GroupBox
        legend={
          criteriological
            ? "Criteriological weights (0–5)"
            : "Criteriological weights (0–5) — enable Criteriological mode to apply"
        }
      >
        <div
          className={`grid grid-cols-1 gap-x-6 sm:grid-cols-2 xl:grid-cols-4 ${
            criteriological ? "" : "opacity-50"
          }`}
        >
          {CRITERIA.map((criterion) => (
            <FieldRow
              key={criterion}
              label={
                LLM_ONLY_CRITERIA.includes(criterion)
                  ? `${CRITERION_LABELS[criterion]} *`
                  : CRITERION_LABELS[criterion]
              }
              htmlFor={`weight-${criterion}`}
            >
              <RetroInput
                id={`weight-${criterion}`}
                type="number"
                min={0}
                max={5}
                step={0.5}
                className="w-16"
                disabled={!criteriological}
                title={
                  LLM_ONLY_CRITERIA.includes(criterion)
                    ? "* No deterministic feature measures this; it participates only via LLM reranking (Phase 4)."
                    : undefined
                }
                value={value.criteriaWeights[criterion]}
                onChange={(e) =>
                  set("criteriaWeights", {
                    ...value.criteriaWeights,
                    [criterion]: Number(e.target.value),
                  })
                }
              />
            </FieldRow>
          ))}
        </div>
        <div className="mt-2">
          <label
            htmlFor="path-description"
            className="mb-1 block text-[12px] font-bold"
          >
            Describe the path you want
          </label>
          <RetroTextarea
            id="path-description"
            rows={2}
            className="w-full"
            disabled={!criteriological}
            value={value.pathDescription}
            placeholder="Prefer transitions involving media storage, religious authority, public sincerity, and technical standardization. Avoid paths composed mostly of biographies. Favor concrete objects and institutions."
            onChange={(e) => set("pathDescription", e.target.value)}
          />
        </div>
      </GroupBox>

      <div className="flex flex-wrap items-center gap-2">
        <RetroButton
          primary
          onClick={walk.onGenerate}
          disabled={walk.busy || dirty}
          disabledReason={
            dirty
              ? "Save the configuration first — the walk runs from the persisted configuration"
              : "A walk is already running"
          }
        >
          {walk.busy ? "Walking…" : "Generate walk"}
        </RetroButton>
        <RetroButton
          onClick={walk.onRegenerateSameSeed}
          disabled={walk.busy || dirty || !walk.hasWalk}
          disabledReason={
            !walk.hasWalk
              ? "No previous walk to regenerate"
              : dirty
                ? "Save the configuration first"
                : "A walk is already running"
          }
        >
          Regenerate with same seed
        </RetroButton>
        <RetroButton
          disabled
          disabledReason="Arrives in Phase 3 (criteriological scoring)"
        >
          Re-score current walk
        </RetroButton>
        <RetroButton
          disabled
          disabledReason="Arrives in Phases 4–5 (orchestration and Draft 0)"
        >
          Choose endpoint and compose
        </RetroButton>
        <RetroButton disabled disabledReason="Arrives in Phase 7 (export formats)">
          Export project
        </RetroButton>
        <span className="mx-2 h-5 w-px bg-(--color-bevel-dark)" />
        <RetroButton
          primary
          onClick={onSave}
          disabled={!dirty || saving}
          disabledReason={dirty ? "Saving…" : "No unsaved changes"}
        >
          {saving ? "Saving…" : "Save configuration"}
        </RetroButton>
        <span className="text-[11px] text-ink-dim">
          {dirty ? "Unsaved changes" : "Configuration saved"}
        </span>
        {saveError && <span className="text-[11px] text-warn">{saveError}</span>}
      </div>
      {(walk.jobLabel || walk.error) && (
        <div className="bevel-in px-2 py-1 text-[11px]">
          {walk.error ? (
            <span className="text-warn">Walk failed: {walk.error}</span>
          ) : (
            <span className="text-ink-dim">{walk.jobLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
