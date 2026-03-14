<template>
  <div class="card overflow-hidden">
    <div class="flex items-center gap-2 border-b border-border px-4 py-3">
      <h3 class="text-xs font-semibold uppercase tracking-wider text-ink-faint">
        Time per Job
      </h3>
      <div class="ml-auto w-48">
        <input
          v-model="search"
          type="text"
          placeholder="Filter jobs..."
          class="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
        />
      </div>
    </div>

    <!-- Column headers -->
    <div
      v-if="!loading && rows.length > 0"
      class="grid grid-cols-[1fr_5rem_7rem_1px_5rem_5rem_3.5rem] items-center gap-x-2 border-b border-border px-4 py-1.5"
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
        class="grid grid-cols-[1fr_5rem_7rem_1px_5rem_5rem_3.5rem] items-center gap-x-2 px-4 py-3"
      >
        <div>
          <div class="h-4 w-40 animate-pulse rounded bg-surface-2" />
          <div class="mt-1 h-3 w-16 animate-pulse rounded bg-surface-2" />
        </div>
        <div class="h-4 w-14 ml-auto animate-pulse rounded bg-surface-2" />
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
        class="grid grid-cols-[1fr_5rem_7rem_1px_5rem_5rem_3.5rem] items-center gap-x-2 px-4 py-2.5"
      >
        <!-- Job name + runs -->
        <div class="min-w-0">
          <p class="truncate text-sm text-ink">{{ row.name }}</p>
          <p class="text-[10px] text-ink-faint">{{ row.runCount }} runs</p>
        </div>

        <!-- Median duration -->
        <p class="text-right font-mono text-sm tabular-nums text-ink">
          {{ fmtDuration(row.medianDuration) }}
        </p>

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
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

const search = ref("");

type SortKey = "name" | "medianDuration" | "delta" | "retryRate" | "retryDelta" | "trend";
const sortKey = ref<SortKey>("delta");
const sortDir = ref<"asc" | "desc">("desc");

const columns: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "name", label: "Job", align: "left" },
  { key: "medianDuration", label: "P50 Duration", align: "right" },
  { key: "delta", label: "Δ Duration", align: "right" },
  // divider column (1px) is not a button — handled in template
  { key: "retryRate", label: "Retry Rate", align: "right" },
  { key: "retryDelta", label: "Δ Retries", align: "right" },
  { key: "trend", label: "Trend", align: "right" },
];

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
      if (prevMedian > 0) {
        prevMedianDuration = prevMedian;
        const pct = Math.round(((medianDuration - prevMedian) / prevMedian) * 100);
        delta = pct;
        const sign = pct > 0 ? "+" : "";
        deltaLabel = `${sign}${pct}%`;
        deltaClass = pct < 0 ? "text-emerald-600" : pct > 0 ? "text-red-500" : "text-ink-muted";
      }
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

    const trend = trendMap.value.get(j.name);

    return {
      name: j.name,
      runCount: j.runCount,
      medianDuration,
      prevMedianDuration,
      delta,
      deltaLabel,
      deltaClass,
      retryRate,
      retryRateLabel,
      retryRateDelta,
      retryRateDeltaLabel,
      prevRetryRateLabel,
      trendWeeks: trend?.weeks ?? null,
      severity: trend?.severity ?? null,
      slope: trend?.slope ?? null,
    };
  });
});

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

const rows = computed(() => {
  if (searchTerms.value.length === 0) return sortedRows.value;
  return sortedRows.value.filter((r) => {
    const name = r.name.toLowerCase();
    return searchTerms.value.some((term) => name.includes(term));
  });
});
</script>
