<template>
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
    <div v-for="card in cards" :key="card.label" class="card p-3 sm:p-4">
      <p class="text-xs font-medium uppercase tracking-wider text-ink-faint">
        {{ card.label }}
      </p>
      <p class="mt-1 font-mono text-2xl font-medium tabular-nums text-ink">
        {{ card.value }}
      </p>
      <p class="mt-1 text-sm text-ink-muted">{{ card.detail }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ReviewSummary } from "@isaac/shared";

const props = defineProps<{ summary: ReviewSummary | null }>();

const cards = computed(() => {
  const s = props.summary;
  if (!s) return [];
  const pct = (n: number, total: number) =>
    total > 0 ? `${Math.round((n / total) * 100)}%` : "—";
  const { quality, engagement, mrs } = s;

  return [
    {
      label: "No approval",
      value: pct(quality.noApproval, mrs),
      detail: `${quality.noApproval} MRs merged unapproved`,
    },
    {
      label: "Single approver",
      value: pct(quality.singleApprover, mrs),
      detail: `${quality.singleApprover} MRs`,
    },
    {
      label: "Approved, no comments",
      value: pct(quality.rubberStamped, mrs),
      detail: `${quality.rubberStamped} MRs`,
    },
    {
      label: "Approval reset",
      value: pct(quality.withResetApproval, mrs),
      detail: `${quality.withResetApproval} MRs re-approved after a push`,
    },
    {
      label: "Threads resolved",
      value: pct(engagement.threadsResolved, engagement.threadsOpened),
      detail: `${engagement.threadsResolved} of ${engagement.threadsOpened} threads`,
    },
    {
      label: "Failed pipeline",
      value: pct(quality.withFailedPipeline, mrs),
      detail: `${quality.withFailedPipeline} MRs with a failure`,
    },
  ];
});
</script>
