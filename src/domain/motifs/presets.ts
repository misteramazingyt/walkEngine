import type { BurkeQuestion } from "@/domain/enums";

// Motif modules: reusable ways of BECOMING CURIOUS, not topics. Selecting
// one augments the walker's salience and biases its question grammar.

export interface MotifModule {
  name: string;
  sensitivity: string[];
  preferredQuestions: BurkeQuestion[];
  preferredSources: string[];
  stoppingCondition: string;
}

export const MOTIF_PRESETS: MotifModule[] = [
  {
    name: "Authenticity under Mechanization",
    sensitivity: [
      "craft",
      "reproduction",
      "labor",
      "taste",
      "elite distinction",
      "automation",
    ],
    preferredQuestions: ["PRECONDITION", "TRANSFORMATION", "ANALOGY"],
    preferredSources: [
      "history of art",
      "technology",
      "economics",
      "religion",
    ],
    stoppingCondition:
      "original object redescribed as one episode within a recurring historical structure",
  },
  {
    name: "Authority",
    sensitivity: [
      "ritual",
      "trust",
      "credential",
      "performance",
      "interface",
      "attention",
    ],
    preferredQuestions: ["PROBLEM", "SELECTION", "TRANSFORMATION"],
    preferredSources: [
      "political history",
      "religion",
      "media history",
      "sociology",
    ],
    stoppingCondition:
      "authority explained as a historically changing social technology rather than a personal attribute",
  },
];

export function findMotif(name: string): MotifModule | undefined {
  return MOTIF_PRESETS.find((m) => m.name === name);
}
