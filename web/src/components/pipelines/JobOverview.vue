<template>
  <div class="card overflow-hidden">
    <div class="flex items-center gap-2 border-b border-border px-4 py-3">
      <h3 class="text-xs font-semibold uppercase tracking-wider text-ink-faint">
        Time per Job
      </h3>
      <div class="ml-auto flex items-center gap-2">
        <div class="flex items-center gap-1 rounded-lg border border-border bg-surface-0 p-0.5">
          <button
            v-for="opt in scopeOptions"
            :key="opt.value"
            class="rounded-md px-2 py-0.5 text-xs transition-colors"
            :class="scope === opt.value
              ? 'bg-surface-2 text-ink font-medium'
              : 'text-ink-muted hover:text-ink'"
            @click="scope = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
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
        <div v-if="i === 4" class="w-2" />
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
        <div class="h-3 w-8 ml-auto animate-pulse rounded bg-surface-2" />
        <div class="w-2" />
        <div class="h-3 w-10 ml-auto animate-pulse rounded bg-surface-2" />
        <div class="h-3 w-10 ml-auto animate-pulse rounded bg-surface-2" />
      </div>
    </div>
    <div v-else-if="rows.length === 0" class="p-4 text-sm text-ink-faint">
      No job data in this period.
    </div>
    <div v-else class="divide-y divide-border">
      <div v-for="row in rows" :key="row.name">
        <div
          class="grid items-center gap-x-2 px-4 py-2.5 cursor-pointer hover:bg-surface-1 transition-colors"
          :class="gridClass"
          @click="toggleExpand(row.name)"
        >
          <!-- Job name + runs -->
          <div class="min-w-0">
            <p class="truncate text-sm text-ink">{{ row.name }}</p>
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
            <p class="text-right font-mono text-xs tabular-nums">
              <span class="text-ink">{{ fmtDuration(row.medianDuration) }}</span>
              <span v-if="row.stddev != null" :class="row.unstable ? 'text-amber-500' : 'text-ink-faint'"> ± {{ fmtDuration(row.stddev) }}</span>
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

          <!-- Critical path % -->
          <p
            class="text-right text-xs font-mono tabular-nums"
            :class="row.criticalPercent != null && row.criticalPercent > 50
              ? 'text-red-500 font-medium'
              : row.criticalPercent != null && row.criticalPercent > 0
                ? 'text-ink'
                : 'text-ink-faint'"
          >
            {{ row.criticalPercent != null ? `${row.criticalPercent}%` : '--' }}
          </p>

          <!-- Divider -->
          <div class="w-2" />

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

        </div>

        <!-- Expanded detail -->
        <div v-if="expanded === row.name" class="border-t border-border bg-surface-1 px-4 py-3">
          <JobTimelineChart :job-name="row.name" :since="since" :until="until" :scope="scope" />
          <div v-if="row.exampleCritical.length > 0 || row.exampleNonCritical.length > 0" class="mt-3 flex gap-6">
            <div v-if="row.exampleCritical.length > 0">
              <span class="text-[10px] uppercase tracking-wider text-ink-faint">Critical in</span>
              <div class="flex flex-wrap gap-1.5 mt-1">
                <router-link
                  v-for="pid in row.exampleCritical"
                  :key="pid"
                  :to="{ name: 'pipeline-detail', params: { id: pid }, query: { criticalPath: '1' } }"
                  class="inline-flex items-center rounded bg-red-500/10 px-1.5 py-0.5 text-xs font-mono text-red-600 hover:bg-red-500/20 transition-colors"
                >
                  #{{ pid }}
                </router-link>
              </div>
            </div>
            <div v-if="row.exampleNonCritical.length > 0">
              <span class="text-[10px] uppercase tracking-wider text-ink-faint">Not critical in</span>
              <div class="flex flex-wrap gap-1.5 mt-1">
                <router-link
                  v-for="pid in row.exampleNonCritical"
                  :key="pid"
                  :to="{ name: 'pipeline-detail', params: { id: pid } }"
                  class="inline-flex items-center rounded bg-surface-2 px-1.5 py-0.5 text-xs font-mono text-ink-muted hover:bg-surface-3 transition-colors"
                >
                  #{{ pid }}
                </router-link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { JobStats, CriticalPathFrequencyItem, PipelineScope } from "@isaac/shared";
import { api } from "../../api/client";
import JobDistributionBar from "./JobDistributionBar.vue";
import JobTimelineChart from "./JobTimelineChart.vue";

const props = defineProps<{
  since: string;
  until: string;
}>();

function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "--";
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = Math.round(abs % 60);
  const sign = seconds < 0 ? "-" : "";
  if (m === 0) return `${sign}${s}s`;
  return `${sign}${m}m ${s}s`;
}

// Scope filter
const scopeOptions: { value: PipelineScope | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "fullstack", label: "Fullstack" },
  { value: "backend", label: "Backend" },
  { value: "frontend", label: "Frontend" },
  { value: "neither", label: "Neither" },
];
const scope = ref<PipelineScope | "all">("all");

// Data
const jobs = ref<JobStats[]>([]);
const prevJobs = ref<JobStats[]>([]);
const criticalPathItems = ref<CriticalPathFrequencyItem[]>([]);
const loading = ref(true);

const sinceDate = computed(() => new Date(props.since));
const untilDate = computed(() => new Date(props.until + "T23:59:59"));
const prevSinceDate = computed(() => {
  const rangeMs = untilDate.value.getTime() - sinceDate.value.getTime();
  return new Date(sinceDate.value.getTime() - rangeMs);
});

async function fetchData() {
  loading.value = true;
  try {
    const scopeParam = scope.value !== "all" ? `&scope=${scope.value}` : "";
    const sinceIso = sinceDate.value.toISOString();
    const untilIso = untilDate.value.toISOString();
    const prevSinceIso = prevSinceDate.value.toISOString();

    const [curJobs, prvJobs, cpFreq] = await Promise.all([
      api.get<JobStats[]>(`/pipelines/job-stats?since=${sinceIso}&until=${untilIso}${scopeParam}`),
      api.get<JobStats[]>(`/pipelines/job-stats?since=${prevSinceIso}&until=${sinceIso}${scopeParam}`),
      api.get<CriticalPathFrequencyItem[]>(`/pipelines/critical-path-frequency?since=${sinceIso}&until=${untilIso}${scopeParam}`),
    ]);
    jobs.value = curJobs;
    prevJobs.value = prvJobs;
    criticalPathItems.value = cpFreq;
  } catch {
    jobs.value = [];
    prevJobs.value = [];
    criticalPathItems.value = [];
  } finally {
    loading.value = false;
  }
}

watch([() => props.since, () => props.until, scope], () => fetchData(), { immediate: true });

// UI state
const search = ref("");
const filterInconsistent = ref(false);
const expanded = ref<string | null>(null);

function toggleExpand(name: string) {
  expanded.value = expanded.value === name ? null : name;
}

type SortKey = "name" | "medianDuration" | "delta" | "criticalPercent" | "retryRate" | "retryDelta";
const sortKey = ref<SortKey>("delta");
const sortDir = ref<"asc" | "desc">("desc");

const columns: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "name", label: "Job", align: "left" },
  { key: "medianDuration", label: "Duration", align: "right" },
  { key: "delta", label: "\u0394 Duration", align: "right" },
  { key: "criticalPercent", label: "Critical %", align: "right" },
  // divider column (1px) handled in template
  { key: "retryRate", label: "Retry Rate", align: "right" },
  { key: "retryDelta", label: "\u0394 Retries", align: "right" },
];

const gridClass = "grid-cols-[1fr_9rem_6rem_4rem_0.5rem_5rem_5rem]";

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = key;
    sortDir.value = key === "name" ? "asc" : "desc";
  }
}

const criticalPathMap = computed(() =>
  new Map(criticalPathItems.value.map((c) => [c.jobName, c]))
);

const allRows = computed(() => {
  const prevMap = new Map<string, JobStats>();
  for (const j of prevJobs.value) {
    prevMap.set(j.name, j);
  }

  return jobs.value.map((j) => {
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

    // Critical path
    const cp = criticalPathMap.value.get(j.name);
    const criticalPercent = cp ? Math.round(cp.frequency * 100) : null;
    const exampleCritical = cp?.exampleCritical ?? [];
    const exampleNonCritical = cp?.exampleNonCritical ?? [];

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

    // Variance flag
    const unstable = j.stddevDuration != null && j.runCount >= 5 && j.stddevDuration >= 90;

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
      criticalPercent,
      exampleCritical,
      exampleNonCritical,
      retryRate,
      retryRateLabel,
      retryRateDelta,
      retryRateDeltaLabel,
      prevRetryRateLabel,
      unstable,
      stddev: j.stddevDuration != null ? Math.round(j.stddevDuration) : null,
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
      case "criticalPercent": {
        if (a.criticalPercent == null && b.criticalPercent == null) return 0;
        if (a.criticalPercent == null) return 1;
        if (b.criticalPercent == null) return -1;
        return dir * (a.criticalPercent - b.criticalPercent);
      }
      case "retryRate":
        return dir * (a.retryRate - b.retryRate);
      case "retryDelta": {
        if (a.retryRateDelta === null && b.retryRateDelta === null) return 0;
        if (a.retryRateDelta === null) return 1;
        if (b.retryRateDelta === null) return -1;
        return dir * (a.retryRateDelta - b.retryRateDelta);
      }
      default:
        return 0;
    }
  });

  return sorted;
});

const parsedSearch = computed(() => {
  const tokens = search.value.toLowerCase().split(/\s+/).filter(Boolean);
  const include = tokens.filter((t) => !t.startsWith("-"));
  const exclude = tokens.filter((t) => t.startsWith("-")).map((t) => t.slice(1)).filter(Boolean);
  return { include, exclude };
});

const inconsistentCount = computed(() =>
  allRows.value.filter((r) => r.unstable).length
);

const rows = computed(() => {
  let filtered = sortedRows.value;
  if (filterInconsistent.value) {
    filtered = filtered.filter((r) => r.unstable);
  }
  const { include, exclude } = parsedSearch.value;
  if (include.length > 0 || exclude.length > 0) {
    filtered = filtered.filter((r) => {
      const name = r.name.toLowerCase();
      if (exclude.some((term) => name.includes(term))) return false;
      if (include.length === 0) return true;
      return include.some((term) => name.includes(term));
    });
  }
  return filtered;
});
</script>
