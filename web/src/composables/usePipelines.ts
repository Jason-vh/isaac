import { computed } from "vue";
import type { PipelineDurationPoint } from "@isaac/shared";
import { api } from "../api/client";
import { useDateRange } from "./useDateRange";
import { useResource } from "./useResource";

export interface TypeStats {
  p50: number | null;
  p99: number | null;
  count: number;
  efficiencyP50: number | null;
}

export interface PeriodComparison {
  current: { merge: TypeStats; train: TypeStats };
  previous: { merge: TypeStats; train: TypeStats };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function computeTypeStats(points: PipelineDurationPoint[]): TypeStats {
  const durations = points.map((p) => p.durationSeconds);
  if (durations.length === 0) return { p50: null, p99: null, count: 0, efficiencyP50: null };
  const sorted = [...durations].sort((a, b) => a - b);

  const ratios = points
    .filter((p) => p.jobDurationSum != null && p.durationSeconds > 0)
    .map((p) => p.jobDurationSum! / p.durationSeconds);
  const sortedRatios = [...ratios].sort((a, b) => a - b);

  return {
    p50: percentile(sorted, 50),
    p99: percentile(sorted, 99),
    count: durations.length,
    efficiencyP50: sortedRatios.length > 0 ? percentile(sortedRatios, 50) : null,
  };
}

function computeStats(points: PipelineDurationPoint[]) {
  const mergePoints = points.filter((p) => p.type === "merge");
  const trainPoints = points.filter((p) => p.type === "train");
  return {
    merge: computeTypeStats(mergePoints),
    train: computeTypeStats(trainPoints),
  };
}

export function usePipelines() {
  const { since, until, sinceDate, untilDate, queryParams } = useDateRange("7d");

  // Previous period: same duration, ending where current starts
  const prevSinceDate = computed(() => {
    const rangeMs = untilDate.value.getTime() - sinceDate.value.getTime();
    return new Date(sinceDate.value.getTime() - rangeMs);
  });

  const prevQueryParams = computed(() => {
    const params = new URLSearchParams();
    params.set("since", prevSinceDate.value.toISOString());
    params.set("until", sinceDate.value.toISOString());
    return params.toString();
  });

  const { data, loading, initialLoading, error } = useResource(
    async () => {
      const [current, previous] = await Promise.all([
        api.get<PipelineDurationPoint[]>(`/pipelines/duration-scatter?${queryParams.value}`),
        api.get<PipelineDurationPoint[]>(`/pipelines/duration-scatter?${prevQueryParams.value}`),
      ]);
      return { current, previous };
    },
    queryParams,
  );

  const points = computed(() => data.value?.current ?? []);

  const comparison = computed<PeriodComparison>(() => ({
    current: computeStats(data.value?.current ?? []),
    previous: computeStats(data.value?.previous ?? []),
  }));

  return { since, until, points, comparison, loading, initialLoading, error };
}
