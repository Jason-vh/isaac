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
      class="grid items-center gap-x-2 border-b border-border px-4 py-1.5"
      :class="gridClass"
    >
      <template v-for="(col, i) in columns" :key="col.key">
        <div v-if="i === 4" class="h-full w-px bg-border" />
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
        <div class="h-3 w-10 ml-auto animate-pulse rounded bg-surface-2" />
        <div class="h-full w-px bg-border" />
        <div class="h-3 w-10 ml-auto animate-pulse rounded bg-surface-2" />
        <div class="h-3 w-10 ml-auto animate-pulse rounded bg-surface-2" />
        <div v-if="criticalPath" class="h-3 w-10 ml-auto animate-pulse rounded bg-surface-2" />
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
        <!-- Job name + runs + CV badge -->
        <div class="min-w-0 flex items-center gap-1.5">
          <div class="min-w-0">
            <p class="truncate text-sm text-ink">{{ row.name }}</p>
            <p class="text-[10px] text-ink-faint">{{ row.runCount }} runs</p>
          </div>
          <span
            v-if="row.cvBadge === 'amber'"
            class="shrink-0 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700"
            title="Moderate variance (CV 10-25%)"
          >CV {{ row.cv }}%</span>
          <span
            v-else-if="row.cvBadge === 'red'"
            class="shrink-0 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-medium text-red-700"
            title="High variance (CV > 25%)"
          >unstable</span>
        </div>

        <!-- Distribution bar + p50 number -->
        <div class="flex flex-col items-end gap-0.5">
          <JobDistributionBar
            :p10="row.p10Duration"
            :p50="row.medianDuration"
            :p90="row.p90Duration"
            :domain-max="domainMax"
          />
          <p class="text-right font-mono text-xs tabular-nums text-ink">
            {{ fmtDuration(row.medianDuration) }}
          </p>
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

        <!-- P50 Queue -->
        <p class="text-right font-mono text-xs tabular-nums" :class="row.p50Queue != null ? 'text-amber-600' : 'text-ink-faint'">
          {{ row.p50Queue != null ? fmtDuration(row.p50Queue) : '--' }}
        </p>

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

        <!-- CP Contribution -->
        <p v-if="criticalPath" class="text-right text-xs font-mono tabular-nums" :class="row.cpContrib !== null ? (row.cpContrib > 0 ? 'text-red-500' : row.cpContrib < 0 ? 'text-emerald-600' : 'text-ink-faint') : 'text-ink-faint'">
          {{ row.cpContrib !== null ? fmtContribution(row.cpContrib) : '\u2014' }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { JobStats, CriticalPathDecomposition } from "@isaac/shared";
import JobDistributionBar from "./JobDistributionBar.vue";

const props = defineProps<{
  jobs: JobStats[];
  prevJobs: JobStats[];
  loading: boolean;
  criticalPath?: CriticalPathDecomposition | null;
}>();

// Build a map of job name -> ownContribution for quick lookup
const cpContribMap = computed(() => {
  if (!props.criticalPath) return null;
  const map = new Map<string, number>();
  for (const seg of props.criticalPath.segments) {
    map.set(seg.jobName, seg.ownContribution);
  }
  return map;
});

function fmtContribution(seconds: number): string {
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = Math.round(abs % 60);
  const sign = seconds > 0 ? "+" : seconds < 0 ? "-" : "";
  return `${sign}${m}m ${s}s`;
}

function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "--";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

const search = ref("");

type SortKey = "name" | "medianDuration" | "delta" | "p50Queue" | "cv" | "cpContrib" | "retryRate" | "retryDelta";
const sortKey = ref<SortKey>("delta");
const sortDir = ref<"asc" | "desc">("desc");

const columns = computed(() => {
  const cols: { key: SortKey; label: string; align: "left" | "right" }[] = [
    { key: "name", label: "Job", align: "left" },
    { key: "medianDuration", label: "P50 Duration", align: "right" },
    { key: "delta", label: "\u0394 Duration", align: "right" },
    { key: "p50Queue", label: "P50 Queue", align: "right" },
    // divider column (1px) is not a button — handled in template
    { key: "retryRate", label: "Retry Rate", align: "right" },
    { key: "retryDelta", label: "\u0394 Retries", align: "right" },
  ];
  if (props.criticalPath) {
    cols.push({ key: "cpContrib", label: "CP", align: "right" });
  }
  return cols;
});

const gridClass = computed(() =>
  props.criticalPath
    ? "grid-cols-[1fr_9rem_6rem_5rem_1px_5rem_5rem_5rem]"
    : "grid-cols-[1fr_9rem_6rem_5rem_1px_5rem_5rem]"
);

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = key;
    sortDir.value = key === "name" ? "asc" : "desc";
  }
}

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

    // CP contribution
    const cpContrib = cpContribMap.value?.get(j.name) ?? null;

    // CV (coefficient of variation)
    const cv = j.stddevDuration != null && j.avgDuration > 0
      ? Math.round((j.stddevDuration / j.avgDuration) * 100)
      : null;

    // CV badge: only show for jobs with >= 5 runs
    let cvBadge: "amber" | "red" | null = null;
    if (cv != null && j.runCount >= 5) {
      if (cv > 25) cvBadge = "red";
      else if (cv >= 10) cvBadge = "amber";
    }

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
      p50Queue: j.p50QueuedDuration,
      retryRate,
      retryRateLabel,
      retryRateDelta,
      retryRateDeltaLabel,
      prevRetryRateLabel,
      cpContrib,
      cv,
      cvBadge,
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
      case "p50Queue": {
        if (a.p50Queue == null && b.p50Queue == null) return 0;
        if (a.p50Queue == null) return 1;
        if (b.p50Queue == null) return -1;
        return dir * (a.p50Queue - b.p50Queue);
      }
      case "cv": {
        if (a.cv === null && b.cv === null) return 0;
        if (a.cv === null) return 1;
        if (b.cv === null) return -1;
        return dir * (a.cv - b.cv);
      }
      case "retryRate":
        return dir * (a.retryRate - b.retryRate);
      case "retryDelta": {
        if (a.retryRateDelta === null && b.retryRateDelta === null) return 0;
        if (a.retryRateDelta === null) return 1;
        if (b.retryRateDelta === null) return -1;
        return dir * (a.retryRateDelta - b.retryRateDelta);
      }
      case "cpContrib": {
        if (a.cpContrib === null && b.cpContrib === null) return 0;
        if (a.cpContrib === null) return 1;
        if (b.cpContrib === null) return -1;
        return dir * (a.cpContrib - b.cpContrib);
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
