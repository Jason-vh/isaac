<template>
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
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
        {{ stat.value }}h
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { WbsoCategoryTotals } from "@isaac/shared";
import {
  CodeBracketIcon,
  ChatBubbleLeftEllipsisIcon,
  ChatBubbleLeftRightIcon,
  WrenchScrewdriverIcon,
  ClockIcon,
  BellSlashIcon,
} from "@heroicons/vue/20/solid";

const props = defineProps<{ totals: WbsoCategoryTotals }>();

const cards = computed(() => [
  {
    label: "Coding",
    value: props.totals.coding,
    icon: CodeBracketIcon,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
  },
  {
    label: "Code Review",
    value: props.totals.codeReview,
    icon: ChatBubbleLeftEllipsisIcon,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
  },
  {
    label: "Dev Meetings",
    value: props.totals.devMeeting,
    icon: ChatBubbleLeftRightIcon,
    iconBg: "bg-fuchsia-50",
    iconColor: "text-fuchsia-600",
  },
  {
    label: "Dev Misc",
    value: props.totals.devMisc,
    icon: WrenchScrewdriverIcon,
    iconBg: "bg-fuchsia-50",
    iconColor: "text-fuchsia-600",
  },
  {
    label: "Non-Dev",
    value: props.totals.nonDev,
    icon: ClockIcon,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
  },
  {
    label: "Leave",
    value: props.totals.leave,
    icon: BellSlashIcon,
    iconBg: "bg-gray-100",
    iconColor: "text-gray-500",
  },
]);
</script>
