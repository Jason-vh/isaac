<template>
  <div class="card overflow-hidden">
    <h3 class="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
      Duration Trend
    </h3>
    <div v-if="metrics.length === 0" class="p-4 text-sm text-ink-faint">
      No data yet.
    </div>
    <div v-else class="p-4">
      <!-- Chart -->
      <div class="relative flex items-end gap-[3px]" style="height: 120px;">
        <!-- 15-min target line -->
        <div
          v-if="targetLineBottom != null"
          class="pointer-events-none absolute left-0 right-0 z-10 border-t border-dashed border-red-400"
          :style="{ bottom: `${targetLineBottom}px` }"
        >
          <span class="absolute -top-4 right-0 font-mono text-[9px] text-red-400">15m target</span>
        </div>

        <div
          v-for="(week, i) in metrics"
          :key="week.weekStart"
          class="group relative flex flex-1 items-end justify-center gap-[1px]"
          style="height: 100%;"
        >
          <div
            class="w-1/3 rounded-sm bg-red-400"
            :style="{ height: `${barH(week.maxDuration)}px` }"
          />
          <div
            class="w-1/3 rounded-sm bg-amber-400"
            :style="{ height: `${barH(week.p90Duration)}px` }"
          />
          <div
            class="w-1/3 rounded-sm bg-emerald-400"
            :style="{ height: `${barH(week.p50Duration)}px` }"
          />
          <!-- Tooltip -->
          <div class="pointer-events-none absolute -top-10 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 font-mono text-[10px] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
            max {{ fmt(week.maxDuration) }} · p90 {{ fmt(week.p90Duration) }} · p50 {{ fmt(week.p50Duration) }}
          </div>
        </div>
      </div>

      <!-- X-axis labels -->
      <div class="mt-1.5 flex gap-[3px]">
        <div
          v-for="(week, i) in metrics"
          :key="week.weekStart + '-label'"
          class="flex-1 text-center"
        >
          <span
            v-if="i === 0 || i === metrics.length - 1"
            class="font-mono text-[9px] text-ink-faint"
          >
            {{ formatWeekLabel(week.weekStart) }}
          </span>
        </div>
      </div>

      <!-- Legend -->
      <div class="mt-3 flex items-center justify-center gap-4 text-xs text-ink-muted">
        <span class="flex items-center gap-1.5">
          <span class="inline-block h-2 w-2 rounded-sm bg-red-400" /> Max
        </span>
        <span class="flex items-center gap-1.5">
          <span class="inline-block h-2 w-2 rounded-sm bg-amber-400" /> P90
        </span>
        <span class="flex items-center gap-1.5">
          <span class="inline-block h-2 w-2 rounded-sm bg-emerald-400" /> P50
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { WeeklyPipelineStats } from "@isaac/shared";

const props = defineProps<{ metrics: WeeklyPipelineStats[] }>();

const CHART_HEIGHT = 112; // inner chart area in px
const TARGET_SECONDS = 900; // 15 minutes

const globalMax = computed(() => {
  let max = 0;
  for (const w of props.metrics) {
    if (w.maxDuration != null && w.maxDuration > max) max = w.maxDuration;
  }
  return Math.max(max, 1);
});

const targetLineBottom = computed(() => {
  if (globalMax.value <= 0) return null;
  const pos = (TARGET_SECONDS / globalMax.value) * CHART_HEIGHT;
  return Math.min(pos, CHART_HEIGHT);
});

function barH(val: number | null): number {
  if (val == null) return 0;
  return Math.max(2, (val / globalMax.value) * CHART_HEIGHT);
}

function fmt(seconds: number | null): string {
  if (seconds == null) return "--";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function formatWeekLabel(weekStart: string): string {
  const d = new Date(weekStart);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
</script>
