<template>
  <div class="grid grid-cols-3 gap-4">
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
import type { WeeklyPipelineStats } from "@isaac/shared";
import {
  ClockIcon,
  CheckCircleIcon,
} from "@heroicons/vue/20/solid";

const props = defineProps<{ metrics: WeeklyPipelineStats[] }>();

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "--";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

const latest = computed(() => {
  if (props.metrics.length === 0) return null;
  return props.metrics[props.metrics.length - 1];
});

const cards = computed(() => {
  const l = latest.value;
  if (!l) {
    return [
      { label: "Max Duration", value: "--", detail: null, icon: ClockIcon, iconBg: "bg-surface-2", iconColor: "text-ink-faint" },
      { label: "P90 Duration", value: "--", detail: null, icon: ClockIcon, iconBg: "bg-surface-2", iconColor: "text-ink-faint" },
      { label: "Success Rate", value: "--", detail: null, icon: CheckCircleIcon, iconBg: "bg-surface-2", iconColor: "text-ink-faint" },
    ];
  }

  const maxOver = l.maxDuration != null && l.maxDuration > 900;
  const successRate = l.total > 0 ? Math.round((l.successCount / l.total) * 100) : 0;
  const failedCount = l.failedCount;

  return [
    {
      label: "Max Duration",
      value: formatDuration(l.maxDuration),
      detail: "target: <15m",
      icon: ClockIcon,
      iconBg: maxOver ? "bg-red-50" : "bg-emerald-50",
      iconColor: maxOver ? "text-red-500" : "text-emerald-500",
    },
    {
      label: "P90 Duration",
      value: formatDuration(l.p90Duration),
      detail: `${l.total} pipelines`,
      icon: ClockIcon,
      iconBg: "bg-amber-50",
      iconColor: "text-amber-500",
    },
    {
      label: "Success Rate",
      value: `${successRate}%`,
      detail: failedCount > 0 ? `${failedCount} failed` : null,
      icon: CheckCircleIcon,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-500",
    },
  ];
});
</script>
