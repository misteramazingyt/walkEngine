import type { StartResolver, WalkGateway } from "@/domain/walk/types";
import { titleExclusionReason } from "@/domain/walk/exclusions";
import type { RoutePlan, RouteOracle, VerifiedStep } from "./types";

// A planned route is a claim about what exists. Verifying it against the
// archive is what keeps planning-first from becoming invention: a step whose
// page cannot be found is repaired from real search results or dropped, and
// dropped steps are reported rather than quietly closing the gap.

export interface VerifyResult {
  steps: VerifiedStep[];
  dropped: Array<{ pageTitle: string; reason: string }>;
  repaired: Array<{ from: string; to: string }>;
}

export async function verifyRoute(options: {
  plan: RoutePlan;
  wikipedia: WalkGateway & Partial<StartResolver>;
  oracle: RouteOracle;
}): Promise<VerifyResult> {
  const { plan, wikipedia, oracle } = options;
  const dropped: VerifyResult["dropped"] = [];
  const repaired: VerifyResult["repaired"] = [];

  const infos = await wikipedia.getArticleInfos(
    plan.steps.map((s) => s.pageTitle),
  );
  const found = (title: string) => {
    const info = infos.get(title);
    return info && !info.missing && !info.isDisambiguation && info.summary.length > 0
      ? info
      : null;
  };

  // Anything unresolved gets one search-backed repair attempt before it is
  // abandoned; the model chooses only among titles the archive really has.
  const failures: Array<{ step: (typeof plan.steps)[number]; candidates: string[] }> = [];
  for (const step of plan.steps) {
    if (!found(step.pageTitle) && wikipedia.searchTitles) {
      const candidates = (await wikipedia.searchTitles(step.pageTitle, 5)).filter(
        (t) => !titleExclusionReason(t, { excludeMetaPages: true }),
      );
      failures.push({ step, candidates });
    }
  }

  const replacements = new Map<string, string>();
  if (failures.length > 0) {
    for (const r of await oracle.repair({ failures })) {
      replacements.set(r.replacesTitle, r.pageTitle);
    }
    const extra = await wikipedia.getArticleInfos([...replacements.values()]);
    for (const [title, info] of extra) infos.set(title, info);
  }

  const steps: VerifiedStep[] = [];
  const seen = new Set<string>();
  for (const step of plan.steps) {
    const replacement = replacements.get(step.pageTitle);
    const title = replacement ?? step.pageTitle;
    const info = found(title);
    if (!info) {
      dropped.push({
        pageTitle: step.pageTitle,
        reason: replacement
          ? `no article for it, and the replacement ${replacement} did not resolve either`
          : "no article with a usable summary",
      });
      continue;
    }
    const exclusion = titleExclusionReason(info.title, { excludeMetaPages: true });
    if (exclusion) {
      dropped.push({ pageTitle: info.title, reason: exclusion });
      continue;
    }
    if (seen.has(info.title.toLowerCase())) {
      dropped.push({ pageTitle: info.title, reason: "already a step in this route" });
      continue;
    }
    seen.add(info.title.toLowerCase());
    if (replacement) repaired.push({ from: step.pageTitle, to: info.title });
    steps.push({
      step,
      title: info.title,
      summary: info.summary,
      url: info.url,
    });
  }

  return { steps, dropped, repaired };
}
