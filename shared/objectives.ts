export interface KeyResultDefinition {
  slug: string;
  title: string;
}

export interface ObjectiveDefinition {
  slug: string;
  title: string;
  description: string;
  keyResults: KeyResultDefinition[];
}

export const OBJECTIVES: ObjectiveDefinition[] = [
  {
    slug: "feature-adoption",
    title: "Define and track feature adoption",
    description:
      "Establish practices and tooling to measure how well shipped features are adopted by users.",
    keyResults: [
      { slug: "launch-checklist", title: "Feature launch checklist with adoption metrics" },
      { slug: "adoption-report", title: "Automated adoption report for 1 shipped feature" },
      {
        slug: "mixpanel-backend",
        title: "Integrate Mixpanel into backend, track 1+ previously untrackable event",
      },
    ],
  },
  {
    slug: "scale-frontend",
    title: "Scale the desk frontend codebase",
    description:
      "Establish conventions, structure, and testing patterns that help the frontend codebase scale.",
    keyResults: [
      { slug: "api-component-conventions", title: "Document conventions for APIs, components, testing" },
      { slug: "feature-folder-structure", title: "Define feature-based folder structure convention" },
      { slug: "fixture-approach", title: "Establish standardised fixture writing approach" },
    ],
  },
  {
    slug: "code-to-production",
    title: "Shorten the path from code to production",
    description: "Reduce friction in the development and deployment pipeline.",
    keyResults: [
      { slug: "pipeline-duration", title: "Max pipeline duration below 15 minutes" },
      { slug: "e2e-retry-cost", title: "Reduce E2E retry cost to single-test re-run" },
      { slug: "deployment-automation", title: "Deployment automation proposal with team buy-in" },
    ],
  },
  {
    slug: "invest-teammates",
    title: "Invest in my teammates",
    description:
      "Grow as a mentor and contributor to the team through reviews, feedback, and documentation.",
    keyResults: [
      { slug: "review-reasoning", title: "Reasoning in >80% of review comments" },
      { slug: "peer-feedback", title: "Peer feedback from 2+ teammates" },
      { slug: "internal-docs", title: "Author 2+ internal docs on frequent MR comment topics" },
    ],
  },
];

export function getObjective(slug: string): ObjectiveDefinition | undefined {
  return OBJECTIVES.find((o) => o.slug === slug);
}

export function getKeyResult(slug: string): (KeyResultDefinition & { objectiveSlug: string }) | undefined {
  for (const obj of OBJECTIVES) {
    const kr = obj.keyResults.find((kr) => kr.slug === slug);
    if (kr) return { ...kr, objectiveSlug: obj.slug };
  }
  return undefined;
}

export function getKeyResultsForObjective(slug: string): KeyResultDefinition[] {
  return getObjective(slug)?.keyResults ?? [];
}
