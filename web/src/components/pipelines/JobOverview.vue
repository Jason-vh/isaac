<template>
  <div class="card overflow-hidden">
    <div class="flex items-center gap-2 border-b border-border px-4 py-3">
      <h3 class="text-xs font-semibold uppercase tracking-wider text-ink-faint">
        Time per Job
      </h3>
      <div class="ml-auto flex items-center gap-2">
        <button
          v-if="inconsistentCount > 0"
          class="rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors"
          :class="filterInconsistent
            ? 'bg-amber-500 text-white'
            : 'bg-amber-100 text-amber-700 hover:bg-amber-200'"
          @click="filterInconsistent = !filterInconsistent"
        >
          {{ inconsistentCount }} inconsistent
        </button>
        <input
          v-model="search"
          type="text"
          placeholder="Filter jobs..."
          class="w-48 rounded border border-border bg-surface px-2 py-1 text-xs text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
        />
      </div>
    </div>

    <!-- Column headers -->
    <div
      v-if="!loading && rows.length > 0"
      class="grid items-center gap-x-2 border-b border-border px-4 py-1.5"
      :class="gridClass"
    >
      <template v-for="(col, i) in columns" :key="col.key">
        <div v-if="i === 3" class="h-full w-px bg-border" />
        <button
          class="text-[10px] font-medium uppercase tracking-wider transition-colors cursor-pointer select-none"
          :class="[
            col.align === 'right' ? 'text-right' : 'text-left',
            sortKey === col.key ? 'text-ink' : 'text-ink-faint hover:text-ink',
          ]"
          @click="toggleSort(col.key)"
        >
          {{ col.label }}{{ sortKey === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '' }}
        </button>
      </template>
    </div>

    <div v-if="loading" class="divide-y divide-border">
      <div
        v-for="i in 6"
        :key="i"
        class="grid items-center gap-x-2 px-4 py-3"
        :class="gridClass"
      >
        <div>
          <div class="h-4 w-40 animate-pulse rounded bg-surface-2" />
          <div class="mt-1 h-3 w-16 animate-pulse rounded bg-surface-2" />
        </div>
        <div class="flex flex-col items-end gap-1">
          <div class="h-5 w-full animate-pulse rounded bg-surface-2" />
          <div class="h-3 w-12 animate-pulse rounded bg-surface-2" />
        </div>
        <div class="h-3 w-12 ml-auto animate-pulse rounded bg-surface-2" />
        <div class="h-full w-px bg-border" />
        <div class="h-3 w-10 ml-auto animate-pulse rounded bg-surface-2" />
        <div class="h-3 w-10 ml-auto animate-pulse rounded bg-surface-2" />
        <div class="h-4 w-14 ml-auto animate-pulse rounded bg-surface-2" />
      </div>
    </div>
    <div v-else-if="rows.length === 0" class="p-4 text-sm text-ink-faint">
      No job data in this period.
    </div>
    <div v-else class="divide-y divide-border">
      <div
        v-for="row in rows"
        :key="row.name"
        class="grid items-center gap-x-2 px-4 py-2.5"
        :class="gridClass"
      >
        <!-- Job name + runs + variance warning -->
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <p class="truncate text-sm text-ink">{{ row.name }}</p>
            <div v-if="row.unstable" class="group/badge relative shrink-0 flex items-center">
              <svg class="h-3.5 w-3.5 text-amber-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" /></svg>
              <div class="invisible group-hover/badge:visible absolute left-0 top-full z-50 mt-1 whitespace-nowrap rounded border border-border bg-surface-0 px-2.5 py-1.5 text-xs shadow-lg">
                <p class="font-medium text-ink">High duration variance</p>
                <p class="mt-0.5 text-ink-muted">σ = {{ fmtDuration(row.stddev) }} across {{ row.runCount }} runs</p>
              </div>
            </div>
          </div>
          <p class="text-[10px] text-ink-faint">{{ row.runCount }} runs</p>
        </div>

        <!-- Distribution bar + p50 number -->
        <div class="group/dist relative flex flex-col items-end gap-0.5">
          <JobDistributionBar
            :p10="row.p10Duration"
            :p50="row.medianDuration"
            :p90="row.p90Duration"
            :domain-max="domainMax"
          />
          <p class="text-right font-mono text-xs tabular-nums text-ink">
            {{ fmtDuration(row.medianDuration) }}
          </p>
          <div
            v-if="row.p10Duration != null && row.p90Duration != null"
            class="invisible group-hover/dist:visible absolute right-0 top-full z-50 mt-1 whitespace-nowrap rounded border border-border bg-surface-0 px-2.5 py-1.5 text-xs shadow-lg"
          >
            <div class="flex gap-3 font-mono tabular-nums text-ink-muted">
              <span>p10 {{ fmtDuration(row.p10Duration) }}</span>
              <span class="text-ink font-medium">p50 {{ fmtDuration(row.medianDuration) }}</span>
              <span>p90 {{ fmtDuration(row.p90Duration) }}</span>
            </div>
          </div>
        </div>

        <!-- Duration delta -->
        <div class="text-right">
          <template v-if="row.delta !== null">
            <p class="text-xs" :class="row.deltaClass">{{ row.deltaLabel }}</p>
            <p class="text-[10px] text-ink-faint">
              from {{ fmtDuration(row.prevMedianDuration) }}
            </p>
          </template>
          <p v-else class="text-[10px] text-ink-faint">new</p>
        </div>

        <!-- Divider -->
        <div class="h-full w-px bg-border" />

        <!-- Retry rate -->
        <p class="text-right text-xs tabular-nums" :class="row.retryRate > 0 ? 'text-ink' : 'text-ink-faint'">
          {{ row.retryRateLabel }}
        </p>

        <!-- Retry delta -->
        <div class="text-right">
          <template v-if="row.retryRateDelta !== null && Math.abs(row.retryRateDelta) >= 1">
            <p class="text-xs" :class="row.retryRateDelta > 0 ? 'text-red-500' : 'text-emerald-600'">
              {{ row.retryRateDeltaLabel }}
            </p>
            <p class="text-[10px] text-ink-faint">
              from {{ row.prevRetryRateLabel }}
            </p>
          </template>
          <p v-else-if="row.retryRateDelta !== null" class="text-[10px] text-ink-faint">--</p>
          <p v-else class="text-[10px] text-ink-faint">new</p>
        </div>

        <!-- Trend sparkline -->
        <div class="flex justify-end">
          <JobSparkline v-if="row.trendWeeks" :weeks="row.trendWeeks" :severity="row.severity!" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { JobStats, JobRetryTrend } from "@isaac/shared";
import JobDistributionBar from "./JobDistributionBar.vue";
import JobSparkline from "./JobSparkline.vue";

const props = withDefaults(defineProps<{
  jobs: JobStats[];
  prevJobs: JobStats[];
  jobTrends?: JobRetryTrend[];
  loading: boolean;
}>(), {
  jobTrends: () => [],
});

function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "--";
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = Math.round(abs % 60);
  const sign = seconds < 0 ? "-" : "";
  if (m === 0) return `${sign}${s}s`;
  return `${sign}${m}m ${s}s`;
}

const search = ref("");
const filterInconsistent = ref(false);

type SortKey = "name" | "medianDuration" | "delta" | "retryRate" | "retryDelta" | "trend";
const sortKey = ref<SortKey>("delta");
const sortDir = ref<"asc" | "desc">("desc");

const columns = computed(() => {
  const cols: { key: SortKey; label: string; align: "left" | "right" }[] = [
    { key: "name", label: "Job", align: "left" },
    { key: "medianDuration", label: "P50 Duration", align: "right" },
    { key: "delta", label: "\u0394 Duration", align: "right" },
    // divider column (1px) is not a button — handled in template
    { key: "retryRate", label: "Retry Rate", align: "right" },
    { key: "retryDelta", label: "\u0394 Retries", align: "right" },
    { key: "trend", label: "Trend", align: "right" },
  ];
  return cols;
});

const gridClass = "grid-cols-[1fr_9rem_6rem_1px_5rem_5rem_3.5rem]";

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = key;
    sortDir.value = key === "name" ? "asc" : "desc";
  }
}

const trendMap = computed(() =>
  new Map(props.jobTrends.map((t) => [t.name, t]))
);

const allRows = computed(() => {
  const prevMap = new Map<string, JobStats>();
  for (const j of props.prevJobs) {
    prevMap.set(j.name, j);
  }

  return props.jobs.map((j) => {
    const prev = prevMap.get(j.name);
    const medianDuration = j.p50Duration ?? j.avgDuration;

    // Duration delta (based on median)
    let delta: number | null = null;
    let deltaLabel = "";
    let deltaClass = "";
    let prevMedianDuration: number | null = null;

    if (prev) {
      const prevMedian = prev.p50Duration ?? prev.avgDuration;
      prevMedianDuration = prevMedian;
      const diff = medianDuration - prevMedian;
      delta = diff;
      const sign = diff > 0 ? "+" : "";
      deltaLabel = `${sign}${fmtDuration(diff)}`;
      deltaClass = diff < -1 ? "text-emerald-600" : diff > 1 ? "text-red-500" : "text-ink-muted";
    }

    // Retry rate
    const totalRuns = j.runCount + j.retryCount;
    const retryRate = totalRuns > 0 ? (j.retryCount / totalRuns) * 100 : 0;
    const retryRateLabel = retryRate > 0 ? `${retryRate.toFixed(1)}%` : "0%";

    // Retry rate comparison
    let retryRateDelta: number | null = null;
    let retryRateDeltaLabel = "";
    let prevRetryRateLabel = "";
    if (prev) {
      const prevTotal = prev.runCount + prev.retryCount;
      const prevRetryRate = prevTotal > 0 ? (prev.retryCount / prevTotal) * 100 : 0;
      prevRetryRateLabel = prevRetryRate > 0 ? `${prevRetryRate.toFixed(1)}%` : "0%";
      retryRateDelta = retryRate - prevRetryRate;
      if (Math.abs(retryRateDelta) >= 1) {
        const sign = retryRateDelta > 0 ? "+" : "";
        retryRateDeltaLabel = `${sign}${retryRateDelta.toFixed(1)}pp`;
      }
    }

    // Variance flag: only flag when stddev >= 90s (meaningful absolute swing)
    const unstable = j.stddevDuration != null && j.runCount >= 5 && j.stddevDuration >= 90;

    const trend = trendMap.value.get(j.name);

    return {
      name: j.name,
      runCount: j.runCount,
      p10Duration: j.p10Duration,
      medianDuration,
      p90Duration: j.p90Duration,
      prevMedianDuration,
      delta,
      deltaLabel,
      deltaClass,
      retryRate,
      retryRateLabel,
      retryRateDelta,
      retryRateDeltaLabel,
      prevRetryRateLabel,
      unstable,
      stddev: j.stddevDuration != null ? Math.round(j.stddevDuration) : null,
      trendWeeks: trend?.weeks ?? null,
      severity: trend?.severity ?? null,
      slope: trend?.slope ?? null,
    };
  });
});

// domainMax from allRows (pre-filter) so bars don't rescale when searching
const domainMax = computed(() =>
  Math.max(...allRows.value.map((r) => r.p90Duration ?? r.medianDuration ?? 0), 1)
);

const sortedRows = computed(() => {
  const sorted = [...allRows.value];
  const dir = sortDir.value === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    switch (sortKey.value) {
      case "name":
        return dir * a.name.localeCompare(b.name);
      case "medianDuration":
        return dir * (a.medianDuration - b.medianDuration);
      case "delta": {
        if (a.delta === null && b.delta === null) return 0;
        if (a.delta === null) return 1;
        if (b.delta === null) return -1;
        return dir * (a.delta - b.delta);
      }
      case "retryRate":
        return dir * (a.retryRate - b.retryRate);
      case "retryDelta": {
        if (a.retryRateDelta === null && b.retryRateDelta === null) return 0;
        if (a.retryRateDelta === null) return 1;
        if (b.retryRateDelta === null) return -1;
        return dir * (a.retryRateDelta - b.retryRateDelta);
      }
      case "trend": {
        if (a.slope === null && b.slope === null) return 0;
        if (a.slope === null) return 1;
        if (b.slope === null) return -1;
        return dir * (a.slope - b.slope);
      }
      default:
        return 0;
    }
  });

  return sorted;
});

const searchTerms = computed(() =>
  search.value.toLowerCase().split(/\s+/).filter(Boolean)
);

const inconsistentCount = computed(() =>
  allRows.value.filter((r) => r.unstable).length
);

const rows = computed(() => {
  let filtered = sortedRows.value;
  if (filterInconsistent.value) {
    filtered = filtered.filter((r) => r.unstable);
  }
  if (searchTerms.value.length > 0) {
    filtered = filtered.filter((r) => {
      const name = r.name.toLowerCase();
      return searchTerms.value.some((term) => name.includes(term));
    });
  }
  return filtered;
});
</script>
