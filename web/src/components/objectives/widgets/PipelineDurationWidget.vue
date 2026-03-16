<template>
  <div class="card overflow-hidden">
    <h3
      class="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-faint"
    >
      Pipeline Duration Trend
    </h3>
    <div v-if="loading" class="p-4">
      <div class="flex items-center justify-center" style="height: 300px">
        <span class="text-sm text-ink-faint animate-pulse">Loading chart...</span>
      </div>
    </div>
    <div v-else-if="points.length === 0" class="p-4 text-sm text-ink-faint">
      No data yet.
    </div>
    <div v-else class="p-4">
      <v-chart :option="chartOption" autoresize style="height: 300px" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { ScatterChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
} from "echarts/components";
import VChart from "vue-echarts";
import type { PipelineDurationPoint } from "@isaac/shared";
import { api } from "../../../api/client";

use([
  CanvasRenderer,
  ScatterChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
]);

const points = ref<PipelineDurationPoint[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const since = "2026-01-01T00:00:00.000Z";
    points.value = await api.get<PipelineDurationPoint[]>(
      `/pipelines/duration-scatter?since=${since}`
    );
  } finally {
    loading.value = false;
  }
});

const MERGE_COLOR = "#3B82F6";
const TRAIN_COLOR = "#7C3AED";
const GOAL_MINUTES = 15;

function toMinutes(seconds: number): number {
  return Math.round((seconds / 60) * 10) / 10;
}

const chartOption = computed(() => {
  const mergeScatter: [number, number][] = [];
  const trainScatter: [number, number][] = [];

  for (const p of points.value) {
    const t = new Date(p.createdAt).getTime();
    const v = toMinutes(p.durationSeconds);
    if (p.type === "merge") {
      mergeScatter.push([t, v]);
    } else {
      trainScatter.push([t, v]);
    }
  }

  return {
    animation: true,
    animationDuration: 400,
    animationEasing: "cubicOut" as const,
    grid: { left: 48, right: 16, top: 16, bottom: 40 },
    tooltip: {
      trigger: "item" as const,
      backgroundColor: "#FFFFFF",
      borderColor: "#E5E5E0",
      borderWidth: 1,
      padding: [6, 10],
      textStyle: { color: "#1A1A1A", fontSize: 11 },
    },
    legend: {
      data: ["Merge", "Train"],
      bottom: 0,
      textStyle: { color: "#6B6B6B", fontSize: 11 },
      itemWidth: 12,
      itemHeight: 8,
    },
    xAxis: {
      type: "time" as const,
      axisLine: { lineStyle: { color: "#E5E5E0" } },
      axisLabel: { color: "#A3A3A0", fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value" as const,
      name: "min",
      nameTextStyle: { color: "#A3A3A0", fontSize: 10 },
      axisLine: { show: false },
      axisLabel: { color: "#A3A3A0", fontSize: 10 },
      splitLine: { lineStyle: { color: "#F5F5F0" } },
    },
    series: [
      {
        name: "Merge",
        type: "scatter" as const,
        data: mergeScatter,
        symbolSize: 4,
        itemStyle: { color: MERGE_COLOR, opacity: 0.35 },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: "#EF4444", type: "dashed" as const, width: 1.5 },
          data: [{ yAxis: GOAL_MINUTES, label: { formatter: `${GOAL_MINUTES}m goal`, fontSize: 10, color: "#EF4444" } }],
        },
      },
      {
        name: "Train",
        type: "scatter" as const,
        data: trainScatter,
        symbolSize: 4,
        itemStyle: { color: TRAIN_COLOR, opacity: 0.35 },
      },
    ],
  };
});
</script>
