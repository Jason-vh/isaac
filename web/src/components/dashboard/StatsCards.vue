<template>
  <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
    <div
      v-for="stat in cards"
      :key="stat.label"
      class="rounded-lg border border-gray-200 bg-white p-4"
    >
      <p class="text-sm text-gray-500">{{ stat.label }}</p>
      <p class="mt-1 text-2xl font-semibold text-gray-900">{{ stat.value }}</p>
      <p v-if="stat.detail" class="mt-0.5 text-xs text-gray-400">
        {{ stat.detail }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { WeekStats } from "@isaac/shared";

const props = defineProps<{ stats: WeekStats }>();

const cards = computed(() => [
  {
    label: "Tickets Closed",
    value: props.stats.ticketsClosed,
    detail: props.stats.storyPointsClosed
      ? `${props.stats.storyPointsClosed} story points`
      : null,
  },
  {
    label: "MRs Merged",
    value: props.stats.mrsMerged,
    detail: props.stats.linesChanged
      ? `${props.stats.linesChanged.toLocaleString()} lines changed`
      : null,
  },
  {
    label: "Meetings",
    value: props.stats.meetingCount,
    detail: `${props.stats.meetingHours}h total`,
  },
  {
    label: "Docs Published",
    value: props.stats.confluenceDocuments,
    detail: props.stats.winsLogged
      ? `${props.stats.winsLogged} wins logged`
      : null,
  },
]);
</script>
