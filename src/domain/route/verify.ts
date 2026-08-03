import type { StartResolver, WalkGateway } from "@/domain/walk/types";
import { titleExclusionReason } from "@/domain/walk/exclusions";
import type { RoutePlan, RouteOracle } from "./types";

// The cast is verified, not the beats. A subject appears in several beats
// and is one page; checking it once is both correct and cheaper.

export interface VerifiedSubject {
  id: string;
  title: string;
  gloss: string;
  summary: string;
  /** The whole article, so a beat has circumstances and not a definition. */
  extract: string;
  url: string;
  substrate: string;
  institution: string;
  selfUnderstanding: string;
}

export interface VerifyResult {
  subjects: Map<string, VerifiedSubject>;
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

  const infos = await wikipedia.getArticleInfos(plan.cast.map((c) => c.pageTitle));
  const usable = (title: string) => {
    const info = infos.get(title);
    return info && !info.missing && !info.isDisambiguation && info.summary.length > 0
      ? info
      : null;
  };

  const failures: Array<{
    step: { pageTitle: string; bearsOnSeed: string };
    candidates: string[];
  }> = [];
  for (const member of plan.cast) {
    if (!usable(member.pageTitle) && wikipedia.searchTitles) {
      const candidates = (await wikipedia.searchTitles(member.pageTitle, 5)).filter(
        (t) => !titleExclusionReason(t, { excludeMetaPages: true }),
      );
      failures.push({
        step: { pageTitle: member.pageTitle, bearsOnSeed: member.gloss },
        candidates,
      });
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

  const subjects = new Map<string, VerifiedSubject>();
  const seen = new Set<string>();
  for (const member of plan.cast) {
    const replacement = replacements.get(member.pageTitle);
    const title = replacement ?? member.pageTitle;
    const info = usable(title);
    if (!info) {
      dropped.push({ pageTitle: member.pageTitle, reason: "no usable article" });
      continue;
    }
    const exclusion = titleExclusionReason(info.title, { excludeMetaPages: true });
    if (exclusion) {
      dropped.push({ pageTitle: info.title, reason: exclusion });
      continue;
    }
    if (seen.has(info.title.toLowerCase())) {
      dropped.push({ pageTitle: info.title, reason: "already in the cast" });
      continue;
    }
    seen.add(info.title.toLowerCase());
    if (replacement) repaired.push({ from: member.pageTitle, to: info.title });
    subjects.set(member.id, {
      id: member.id,
      title: info.title,
      gloss: member.gloss,
      summary: info.summary,
      extract: "",
      url: info.url,
      substrate: member.substrate,
      institution: member.institution,
      selfUnderstanding: member.selfUnderstanding,
    });
  }

  // Fetch the full article for everyone who survived. One request each,
  // and the difference between a paragraph that defines and one that tells.
  const withExtract = wikipedia as { getArticleExtract?: (t: string) => Promise<string> };
  if (withExtract.getArticleExtract) {
    for (const subject of subjects.values()) {
      try {
        subject.extract = await withExtract.getArticleExtract(subject.title);
      } catch {
        subject.extract = "";
      }
    }
  }

  return { subjects, dropped, repaired };
}
