<template>
  <div class="card p-5">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-ink">Weekly trend</h2>
      <div class="flex items-center gap-1 rounded-lg border border-border bg-surface-0 p-0.5">
        <button
          v-for="opt in metricOptions"
          :key="opt.value"
          class="rounded-md px-2.5 py-1 text-xs transition-colors"
          :class="metric === opt.value
            ? 'bg-white text-ink font-medium shadow-sm'
            : 'text-ink-muted hover:text-ink'"
          @click="metric = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="flex h-64 items-center justify-center text-sm text-ink-faint">
      Loading…
    </div>
    <div
      v-else-if="!trend || trend.points.length === 0"
      class="flex h-64 items-center justify-center text-sm text-ink-faint"
    >
      No data in this period.
    </div>
    <v-chart v-else :option="chartOption" autoresize style="height: 256px" class="mt-4" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import VChart from "vue-echarts";
import type { TeamMetric, TeamTrend } from "@isaac/shared";

use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
]);

const props = defineProps<{ trend: TeamTrend | null; loading: boolean }>();

const metricOptions: { value: TeamMetric; label: string }[] = [
  { value: "mergedAdditions", label: "Lines merged" },
  { value: "reviewedAdditions", label: "Lines reviewed" },
  { value: "mergedMrs", label: "MRs" },
  { value: "ticketsClosed", label: "Tickets" },
  { value: "storyPoints", label: "Points" },
];

const metric = ref<TeamMetric>("mergedAdditions");

const PALETTE = [
  "#E07A2F",
  "#7C3AED",
  "#059669",
  "#0284C7",
  "#D97706",
  "#DC2626",
  "#0891B2",
  "#9333EA",
  "#65A30D",
  "#DB2777",
];

const chartOption = computed(() => {
  const trend = props.trend!;
  const weeks = trend.points.map((p) => p.weekStart);

  const series = trend.people.map((person, i) => ({
    name: person.displayName + (person.isMe ? " (you)" : ""),
    type: "line" as const,
    smooth: true,
    symbolSize: 6,
    lineStyle: { width: person.isMe ? 3 : 2 },
    itemStyle: { color: PALETTE[i % PALETTE.length] },
    data: trend.points.map((p) => p.byPerson[person.id]?.[metric.value] ?? 0),
  }));

  return {
    tooltip: { trigger: "axis" },
    legend: {
      type: "scroll",
      bottom: 0,
      textStyle: { color: "#6B6B6B", fontSize: 11 },
      icon: "roundRect",
    },
    grid: { left: 50, right: 16, top: 16, bottom: 48 },
    xAxis: {
      type: "category",
      data: weeks,
      axisLine: { lineStyle: { color: "#E5E5E0" } },
      axisLabel: { color: "#A3A3A0", fontSize: 11 },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "#F5F5F0" } },
      axisLabel: { color: "#A3A3A0", fontSize: 11 },
    },
    series,
  };
});
</script>
