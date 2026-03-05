<template>
  <div class="card overflow-hidden">
    <h3 class="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
      Flaky Jobs
    </h3>
    <div v-if="jobs.length === 0" class="p-4 text-sm text-ink-faint">
      No flaky jobs detected.
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
            <p class="font-mono text-sm tabular-nums text-ink">{{ job.retryCount }} retries</p>
            <p class="font-mono text-[10px] text-ink-faint">{{ (job.retryRate * 100).toFixed(1) }}% rate</p>
          </div>
        </div>
        <!-- Proportional bar -->
        <div class="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            class="h-full rounded-full bg-red-400/40"
            :style="{ width: `${barWidth(job.retryCount)}%` }"
          />
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { FlakyJob } from "@isaac/shared";

const props = defineProps<{ jobs: FlakyJob[] }>();

const maxRetries = computed(() => {
  if (props.jobs.length === 0) return 1;
  return Math.max(...props.jobs.map((j) => j.retryCount));
});

function barWidth(val: number): number {
  return Math.max(2, (val / maxRetries.value) * 100);
}
</script>
