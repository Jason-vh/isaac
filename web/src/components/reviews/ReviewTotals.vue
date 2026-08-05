<template>
  <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
    <div v-for="card in cards" :key="card.label" class="card p-4">
      <p class="text-xs font-medium uppercase tracking-wider text-ink-faint">
        {{ card.label }}
      </p>
      <template v-if="card.duration">
        <div class="mt-1 flex items-baseline gap-2">
          <span class="font-mono text-3xl font-medium tabular-nums text-ink">
            {{ formatHours(card.dist?.p50) }}
          </span>
          <span class="text-xs font-medium uppercase text-ink-faint">p50</span>
        </div>
        <p class="mt-1 text-sm text-ink-muted">
          <span class="font-mono tabular-nums text-ink"
            >{{ formatHours(card.dist?.p90) }}
          </span>
          p90
          <span class="mx-1 text-ink-faint">·</span>
          <span class="font-mono tabular-nums text-ink"
            >{{ formatHours(card.dist?.p99) }}
          </span>
          p99
        </p>
      </template>
      <template v-else>
        <p class="mt-1 font-mono text-3xl font-medium tabular-nums text-ink">
          {{ card.value }}
        </p>
        <p class="mt-1 text-sm text-ink-muted">{{ card.detail }}</p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Distribution, ReviewSummary } from "@isaac/shared";
import { formatHours } from "../../lib/duration";

const props = defineProps<{ summary: ReviewSummary | null }>();

type Card = {
  label: string;
  duration?: boolean;
  dist?: Distribution;
  value?: string;
  detail?: string;
};

const cards = computed<Card[]>(() => {
  const s = props.summary;
  return [
    {
      label: "MRs merged",
      value: s ? s.mrs.toLocaleString() : "—",
      detail: `${s?.latency.toFirstReview.n ?? 0} with a review time`,
    },
    { label: "To first review", duration: true, dist: s?.latency.toFirstReview },
    {
      label: "To first approval",
      duration: true,
      dist: s?.latency.toFirstApproval,
    },
    { label: "To merge", duration: true, dist: s?.latency.toMerge },
  ];
});
</script>
