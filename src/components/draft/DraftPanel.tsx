"use client";

// Phase 1: the Draft 0 region with an honest empty state. The segment-aware
// editor (TipTap), node/edge badges, and regeneration controls arrive with
// Phase 5, once there are verified transitions to write from.

export function DraftPanel() {
  return (
    <div className="flex h-full flex-col p-3">
      <div className="bevel-in min-h-0 flex-1 overflow-auto p-4">
        <p className="font-(family-name:--font-prose) text-[14px] leading-relaxed text-ink-dim">
          Draft 0 will appear here after composition (Phase 5): an
          endpoint-first, backward-planned, forward-written narrative whose
          every transition names its carrier, inherited pressure, and warrant
          class. Prose stays synchronized with the flowchart — hovering a node
          will highlight its segment, and edits here never get silently
          overwritten by regeneration.
        </p>
      </div>
    </div>
  );
}
