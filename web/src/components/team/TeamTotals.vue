<template>
  <div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
    <div v-for="card in cards" :key="card.label" class="card p-3 sm:p-4">
      <p class="text-xs font-medium uppercase tracking-wider text-ink-faint">
        {{ card.label }}
      </p>
      <p class="mt-1 font-mono text-2xl font-medium tabular-nums text-ink sm:text-3xl">
        {{ card.value }}
      </p>
      <p v-if="card.detail" class="mt-1 text-sm text-ink-muted">
        {{ card.detail }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { TeamMemberProductivity } from "@isaac/shared";

const props = defineProps<{ members: TeamMemberProductivity[] }>();

const sum = (fn: (m: TeamMemberProductivity) => number) =>
  props.members.reduce((total, m) => total + fn(m), 0);

const cards = computed(() => {
  const merged = sum((m) => m.merged.additions);
  const frontend = sum((m) => m.merged.byCategory.frontend.additions);
  const backend = sum((m) => m.merged.byCategory.backend.additions);
  const share = (n: number) =>
    merged > 0 ? `${Math.round((n / merged) * 100)}%` : "—";

  return [
    {
      label: "Lines merged",
      value: merged.toLocaleString(),
      detail: `${sum((m) => m.merged.mrs)} MRs across ${props.members.length} engineers`,
    },
    {
      label: "Lines reviewed",
      value: sum((m) => m.reviewed.additions).toLocaleString(),
      detail: `${sum((m) => m.reviewed.mrs)} reviews, ${sum((m) => m.reviewed.comments)} comments`,
    },
    {
      label: "Frontend / Backend",
      value: `${share(frontend)} / ${share(backend)}`,
      detail: `${frontend.toLocaleString()} / ${backend.toLocaleString()} lines`,
    },
    {
      label: "Tickets closed",
      value: sum((m) => m.tickets.closed).toLocaleString(),
      detail: `${Math.round(sum((m) => m.tickets.storyPoints) * 10) / 10} story points`,
    },
  ];
});
</script>
