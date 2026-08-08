<template>
  <div class="card p-4 sm:p-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-lg font-semibold text-ink">Weekly trend (p50)</h2>
      <div class="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface-0 p-0.5">
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

    <div
      v-if="!points.length"
      class="flex h-64 items-center justify-center text-sm text-ink-faint"
    >
      No merged MRs in this period.
    </div>
    <v-chart v-else :option="chartOption" autoresize style="height: 256px" class="mt-4" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import VChart from "vue-echarts";
import type { ReviewTrendPoint } from "@isaac/shared";
import { formatHours } from "../../lib/duration";

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent]);

const props = defineProps<{ points: ReviewTrendPoint[] }>();

type Metric =
  | "toFirstReviewP50"
  | "toFirstApprovalP50"
  | "toMergeP50"
  | "commentsPerMrP50"
  | "mrs";

const metricOptions: { value: Metric; label: string }[] = [
  { value: "toFirstReviewP50", label: "First comment" },
  { value: "toFirstApprovalP50", label: "First approval" },
  { value: "toMergeP50", label: "Merge" },
  { value: "commentsPerMrP50", label: "Comments" },
  { value: "mrs", label: "MRs merged" },
];

const metric = ref<Metric>("toFirstReviewP50");
const isDuration = computed(() => metric.value.startsWith("to"));
const points = computed(() => props.points);

const chartOption = computed(() => ({
  tooltip: {
    trigger: "axis",
    valueFormatter: (v: number) =>
      isDuration.value ? formatHours(v) : String(v ?? "—"),
  },
  grid: { left: 50, right: 16, top: 16, bottom: 32 },
  xAxis: {
    type: "category",
    data: points.value.map((p) => p.weekStart),
    axisLine: { lineStyle: { color: "#E5E5E0" } },
    axisLabel: { color: "#A3A3A0", fontSize: 11 },
  },
  yAxis: {
    type: "value",
    splitLine: { lineStyle: { color: "#F5F5F0" } },
    axisLabel: {
      color: "#A3A3A0",
      fontSize: 11,
      formatter: (v: number) => (isDuration.value ? formatHours(v) : v),
    },
  },
  series: [
    {
      name: metricOptions.find((o) => o.value === metric.value)!.label,
      type: "line" as const,
      smooth: true,
      symbolSize: 6,
      lineStyle: { width: 3 },
      itemStyle: { color: "#E07A2F" },
      data: points.value.map((p) => p[metric.value]),
    },
  ],
}));
</script>
