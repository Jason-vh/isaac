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
      detail: `${s?.latency.readyToFirstApproval.n ?? 0} with an approval time`,
    },
    {
      label: "Ready → approval",
      value: formatHours(latency?.readyToFirstApproval.p50),
      detail: `p90 ${formatHours(latency?.readyToFirstApproval.p90)}`,
    },
    {
      label: "Ready → merge",
      value: formatHours(latency?.readyToMerge.p50),
      detail: `p90 ${formatHours(latency?.readyToMerge.p90)}`,
    },
    {
      label: "Approval → merge",
      value: formatHours(latency?.lastApprovalToMerge.p50),
      detail: `p90 ${formatHours(latency?.lastApprovalToMerge.p90)}`,
    },
  ];
});
</script>
