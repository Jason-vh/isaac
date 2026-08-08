<template>
  <div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
    <div
      v-for="stat in cards"
      :key="stat.label"
      class="card group relative overflow-hidden p-3 sm:p-4"
    >
      <div
        class="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg sm:right-3 sm:top-3 sm:h-8 sm:w-8"
        :class="stat.iconBg"
      >
        <component :is="stat.icon" class="h-4 w-4" :class="stat.iconColor" />
      </div>
      <p class="pr-8 text-xs font-medium uppercase tracking-wider text-ink-faint">
        {{ stat.label }}
      </p>
      <p class="mt-1 font-mono text-2xl font-medium tabular-nums text-ink sm:text-3xl">
        {{ stat.value }}
      </p>
      <p v-if="stat.detail" class="mt-1 text-sm text-ink-muted">
        {{ stat.detail }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { WeekStats } from "@isaac/shared";
import {
  TicketIcon,
  CodeBracketIcon,
  CalendarIcon,
  DocumentTextIcon,
  EyeIcon,
} from "@heroicons/vue/20/solid";

const props = defineProps<{ stats: WeekStats }>();

const cards = computed(() => [
  {
    label: "Tickets Closed",
    value: props.stats.ticketsClosed,
    detail: props.stats.storyPointsClosed
      ? `${props.stats.storyPointsClosed} story points`
      : null,
    icon: TicketIcon,
    iconBg: "bg-emerald-50",
    iconColor: "text-activity-ticket",
  },
  {
    label: "MRs Merged",
    value: props.stats.mrsMerged,
    detail: props.stats.filesChanged
      ? `${props.stats.filesChanged.toLocaleString()} files`
      : null,
    icon: CodeBracketIcon,
    iconBg: "bg-violet-50",
    iconColor: "text-activity-mr",
  },
  {
    label: "MRs Reviewed",
    value: props.stats.teamMrsMerged
      ? `${props.stats.mrsReviewed} / ${props.stats.teamMrsMerged}`
      : "0",
    detail: props.stats.teamMrsMerged
      ? `${Math.round((props.stats.mrsReviewed / props.stats.teamMrsMerged) * 100)}% of team`
      : null,
    icon: EyeIcon,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
  },
  {
    label: "Meetings",
    value: props.stats.meetingCount,
    detail: `${props.stats.meetingHours}h total`,
    icon: CalendarIcon,
    iconBg: "bg-sky-50",
    iconColor: "text-activity-meeting",
  },
  {
    label: "Docs Published",
    value: props.stats.confluenceDocuments,
    detail: props.stats.winsLogged
      ? `${props.stats.winsLogged} wins logged`
      : null,
    icon: DocumentTextIcon,
    iconBg: "bg-orange-50",
    iconColor: "text-activity-doc",
  },
]);
</script>
