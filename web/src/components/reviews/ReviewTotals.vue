<template>
  <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
    <div v-for="card in cards" :key="card.label" class="card p-4">
      <p class="text-xs font-medium uppercase tracking-wider text-ink-faint">
        {{ card.label }}
      </p>
      <p class="mt-1 font-mono text-3xl font-medium tabular-nums text-ink">
        {{ card.value }}
      </p>
      <p class="mt-1 text-sm text-ink-muted">{{ card.detail }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ReviewSummary } from "@isaac/shared";
import { formatHours } from "../../lib/duration";

const props = defineProps<{ summary: ReviewSummary | null }>();

const cards = computed(() => {
  const s = props.summary;
  const latency = s?.latency;
  return [
    {
      label: "MRs merged",
      value: s ? s.mrs.toLocaleString() : "—",
      detail: `${s?.latency.toFirstApproval.n ?? 0} with an approval time`,
    },
    {
      label: "To first approval",
      value: formatHours(latency?.toFirstApproval.p50),
      detail: `p90 ${formatHours(latency?.toFirstApproval.p90)}`,
    },
    {
      label: "To approval that held",
      value: formatHours(latency?.toHeldApproval.p50),
      detail: `p90 ${formatHours(latency?.toHeldApproval.p90)}`,
    },
    {
      label: "To merge",
      value: formatHours(latency?.toMerge.p50),
      detail: `p90 ${formatHours(latency?.toMerge.p90)}`,
    },
  ];
});
</script>
