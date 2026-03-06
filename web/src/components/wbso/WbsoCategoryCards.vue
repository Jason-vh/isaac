<template>
  <div class="grid grid-cols-2 gap-4 lg:grid-cols-5">
    <div
      v-for="stat in cards"
      :key="stat.label"
      class="card group relative overflow-hidden p-4"
    >
      <div
        class="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg"
        :class="stat.iconBg"
      >
        <component :is="stat.icon" class="h-4 w-4" :class="stat.iconColor" />
      </div>
      <p class="text-xs font-medium uppercase tracking-wider text-ink-faint">
        {{ stat.label }}
      </p>
      <p class="mt-1 font-mono text-3xl font-medium tabular-nums text-ink">
        {{ stat.value }}h
      </p>
      <p v-if="stat.detail" class="mt-1 text-sm text-ink-muted">
        {{ stat.detail }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { WbsoCategoryTotals } from "@isaac/shared";
import {
  CodeBracketIcon,
  ChatBubbleLeftRightIcon,
  WrenchScrewdriverIcon,
  ClockIcon,
  CalculatorIcon,
} from "@heroicons/vue/20/solid";

const props = defineProps<{ totals: WbsoCategoryTotals }>();

const cards = computed(() => [
  {
    label: "Coding",
    value: props.totals.coding,
    detail: null,
    icon: CodeBracketIcon,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
  },
  {
    label: "Dev Meetings",
    value: props.totals.devMeeting,
    detail: null,
    icon: ChatBubbleLeftRightIcon,
    iconBg: "bg-sky-50",
    iconColor: "text-sky-600",
  },
  {
    label: "Dev Misc",
    value: props.totals.devMisc,
    detail: null,
    icon: WrenchScrewdriverIcon,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
  },
  {
    label: "Non-Dev",
    value: props.totals.nonDev,
    detail: null,
    icon: ClockIcon,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
  },
  {
    label: "Total",
    value: props.totals.total,
    detail: `of 40h week`,
    icon: CalculatorIcon,
    iconBg: "bg-gray-100",
    iconColor: "text-gray-600",
  },
]);
</script>
