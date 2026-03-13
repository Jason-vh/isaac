<template>
  <div class="grid grid-cols-2 gap-4">
    <template v-if="loading">
      <div v-for="i in 2" :key="i" class="card p-4">
        <div class="h-3 w-16 animate-pulse rounded bg-surface-2" />
        <div class="mt-3 grid grid-cols-3 gap-4">
          <div v-for="j in 3" :key="j">
            <div class="h-2 w-8 animate-pulse rounded bg-surface-2" />
            <div class="mt-2 h-6 w-20 animate-pulse rounded bg-surface-2" />
          </div>
        </div>
      </div>
    </template>
    <template v-else>
      <div v-for="group in groups" :key="group.label" class="card p-4">
        <p class="text-xs font-semibold uppercase tracking-wider" :class="group.labelClass">
          {{ group.label }}
        </p>
        <div class="mt-3 grid grid-cols-3 gap-4">
          <div v-for="stat in group.stats" :key="stat.label">
            <p class="text-[10px] font-medium uppercase tracking-wider text-ink-faint">
              {{ stat.label }}
            </p>
            <p class="mt-0.5 font-mono text-xl font-medium tabular-nums text-ink">
              {{ stat.value }}
            </p>
            <p v-if="stat.delta !== null" class="mt-0.5 text-xs">
              <span :class="stat.deltaClass">{{ stat.deltaLabel }}</span>
              <span class="text-ink-faint"> from {{ stat.previousValue }}</span>
            </p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { PeriodComparison, TypeStats } from "../../composables/usePipelines";

const props = defineProps<{ comparison: PeriodComparison; loading: boolean }>();

function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "--";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function durationDelta(current: number | null, previous: number | null) {
  if (current == null || previous == null || previous === 0) {
    return { delta: null as number | null, deltaLabel: "", deltaClass: "" };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { delta: 0, deltaLabel: "0%", deltaClass: "text-ink-muted" };
  const sign = pct > 0 ? "+" : "";
  return {
    delta: pct,
    deltaLabel: `${sign}${pct}%`,
    deltaClass: pct < 0 ? "text-emerald-600" : "text-red-500",
  };
}

function countDelta(current: number, previous: number) {
  if (previous === 0) {
    return { delta: null as number | null, deltaLabel: "", deltaClass: "" };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { delta: 0, deltaLabel: "0%", deltaClass: "text-ink-muted" };
  const sign = pct > 0 ? "+" : "";
  return {
    delta: pct,
    deltaLabel: `${sign}${pct}%`,
    deltaClass: pct > 0 ? "text-emerald-600" : "text-red-500",
  };
}

function buildStats(current: TypeStats, previous: TypeStats) {
  const p50Delta = durationDelta(current.p50, previous.p50);
  const p99Delta = durationDelta(current.p99, previous.p99);
  const cntDelta = countDelta(current.count, previous.count);
  return [
    { label: "P50", value: fmtDuration(current.p50), previousValue: fmtDuration(previous.p50), ...p50Delta },
    { label: "P99", value: fmtDuration(current.p99), previousValue: fmtDuration(previous.p99), ...p99Delta },
    { label: "Count", value: current.count.toString(), previousValue: previous.count.toString(), ...cntDelta },
  ];
}

const groups = computed(() => {
  const { current, previous } = props.comparison;
  return [
    {
      label: "Merge",
      labelClass: "text-blue-500",
      stats: buildStats(current.merge, previous.merge),
    },
    {
      label: "Train",
      labelClass: "text-purple-500",
      stats: buildStats(current.train, previous.train),
    },
  ];
});
</script>
