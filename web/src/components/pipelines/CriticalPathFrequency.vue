<template>
  <div class="card overflow-hidden">
    <div class="flex items-center justify-between border-b border-border px-4 py-3">
      <h3 class="text-xs font-semibold uppercase tracking-wider text-ink-faint">
        Critical Path Frequency
      </h3>
      <button
        v-if="items.length > 0"
        class="text-xs text-ink-muted hover:text-ink transition-colors"
        @click="toggleSort"
      >
        Sort by {{ sortBy === 'frequency' ? 'duration' : 'frequency' }}
      </button>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="px-4 py-6 space-y-3">
      <div v-for="i in 4" :key="i" class="flex items-center gap-3">
        <div class="h-4 w-28 animate-pulse rounded bg-surface-2" />
        <div class="h-4 flex-1 animate-pulse rounded bg-surface-2" />
        <div class="h-4 w-12 animate-pulse rounded bg-surface-2" />
      </div>
    </div>

    <!-- No data -->
    <div v-else-if="items.length === 0" class="px-4 py-6 text-sm text-ink-faint">
      No critical path data available.
    </div>

    <!-- Frequency table -->
    <div v-else class="px-4 py-4">
      <p class="text-xs text-ink-faint mb-3">
        across {{ items[0].pipelinesAnalyzed }} pipelines
      </p>
      <div class="space-y-0.5">
        <div v-for="item in sortedItems" :key="item.jobName">
          <!-- Row -->
          <button
            class="grid w-full items-center gap-x-3 rounded px-1 py-1 -mx-1 hover:bg-surface-1 transition-colors"
            style="grid-template-columns: minmax(0, 1fr) 10rem 4.5rem"
            @click="toggle(item.jobName)"
          >
            <!-- Job name -->
            <span class="truncate text-sm text-ink text-left">{{ item.jobName }}</span>

            <!-- Frequency bar -->
            <div class="relative h-5 rounded bg-surface-2">
              <div
                class="absolute left-0 top-0 h-full rounded transition-all"
                :class="barColor(item.frequency)"
                :style="{ width: (item.frequency * 100) + '%' }"
              />
              <span class="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-medium tabular-nums text-ink-muted">
                {{ Math.round(item.frequency * 100) }}%
              </span>
            </div>

            <!-- Avg contribution -->
            <span class="text-right text-xs font-mono tabular-nums text-ink-muted">
              {{ fmtDuration(item.avgContributionSeconds) }}
            </span>
          </button>

          <!-- Expanded examples -->
          <div v-if="expanded === item.jobName" class="ml-1 pl-3 border-l-2 border-border py-2 mb-1 space-y-2">
            <div v-if="item.exampleCritical.length > 0">
              <span class="text-[10px] uppercase tracking-wider text-ink-faint">Critical in</span>
              <div class="flex flex-wrap gap-1.5 mt-1">
                <router-link
                  v-for="pid in item.exampleCritical"
                  :key="pid"
                  :to="{ name: 'pipeline-detail', params: { id: pid } }"
                  class="inline-flex items-center rounded bg-red-500/10 px-1.5 py-0.5 text-xs font-mono text-red-600 hover:bg-red-500/20 transition-colors"
                >
                  #{{ pid }}
                </router-link>
              </div>
            </div>
            <div v-if="item.exampleNonCritical.length > 0">
              <span class="text-[10px] uppercase tracking-wider text-ink-faint">Not critical in</span>
              <div class="flex flex-wrap gap-1.5 mt-1">
                <router-link
                  v-for="pid in item.exampleNonCritical"
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
import { ref, computed } from "vue";
import type { CriticalPathFrequencyItem } from "@isaac/shared";

const props = defineProps<{
  items: CriticalPathFrequencyItem[];
  loading: boolean;
}>();

const sortBy = ref<"frequency" | "contribution">("frequency");
const expanded = ref<string | null>(null);

function toggleSort() {
  sortBy.value = sortBy.value === "frequency" ? "contribution" : "frequency";
}

function toggle(jobName: string) {
  expanded.value = expanded.value === jobName ? null : jobName;
}

const sortedItems = computed(() => {
  const sorted = [...props.items];
  if (sortBy.value === "contribution") {
    sorted.sort((a, b) => b.avgContributionSeconds - a.avgContributionSeconds);
  } else {
    sorted.sort((a, b) => b.frequency - a.frequency);
  }
  return sorted;
});

function barColor(frequency: number): string {
  if (frequency > 0.7) return "bg-red-500/80";
  if (frequency > 0.3) return "bg-amber-500/70";
  return "bg-accent/50";
}

function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "--";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}
</script>
