<template>
  <div class="card overflow-hidden">
    <h3 class="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
      Slowest Jobs
    </h3>
    <div v-if="jobs.length === 0" class="p-4 text-sm text-ink-faint">
      No data yet.
    </div>
    <ul v-else class="p-2">
      <li
        v-for="job in jobs.slice(0, 10)"
        :key="job.name"
        class="relative rounded-lg px-3 py-2"
      >
        <div class="flex items-center gap-3">
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-ink">{{ job.name }}</p>
            <p class="text-xs text-ink-faint">{{ job.stage }}</p>
          </div>
          <div class="flex-shrink-0 text-right">
            <p class="font-mono text-sm tabular-nums text-ink">{{ fmt(job.avgDuration) }}</p>
            <p class="font-mono text-[10px] text-ink-faint">p90 {{ fmt(job.p90Duration) }}</p>
          </div>
        </div>
        <!-- Proportional bar -->
        <div class="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            class="h-full rounded-full bg-amber-400/40"
            :style="{ width: `${barWidth(job.avgDuration)}%` }"
          />
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { SlowestJob } from "@isaac/shared";

const props = defineProps<{ jobs: SlowestJob[] }>();

const maxDuration = computed(() => {
  if (props.jobs.length === 0) return 1;
  return Math.max(...props.jobs.map((j) => j.avgDuration));
});

function barWidth(val: number): number {
  return Math.max(2, (val / maxDuration.value) * 100);
}

function fmt(seconds: number | null): string {
  if (seconds == null) return "--";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}
</script>
