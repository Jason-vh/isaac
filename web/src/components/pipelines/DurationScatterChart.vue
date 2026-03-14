<template>
  <div class="card overflow-hidden">
    <h3
      class="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-faint"
    >
      Duration Trend
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
      <v-chart :option="chartOption" autoresize style="height: 300px" @click="onChartClick" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { ScatterChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import VChart from "vue-echarts";
import type { PipelineDurationPoint } from "@isaac/shared";

use([
  CanvasRenderer,
  ScatterChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
]);

const props = defineProps<{ points: PipelineDurationPoint[]; loading: boolean }>();
const emit = defineEmits<{ (e: "select", id: number): void }>();

function onChartClick(params: any) {
  if (params.seriesType === "scatter" && params.value?.[2]) {
    emit("select", params.value[2]);
  }
}

const MERGE_COLOR = "#3B82F6";
const TRAIN_COLOR = "#7C3AED";
const QUEUE_COLOR = "#F59E0B";
const ROLLING_WINDOW_MS = 0.5 * 24 * 60 * 60 * 1000; // ±0.5 days

function toMinutes(seconds: number): number {
  return Math.round((seconds / 60) * 10) / 10;
}

function computeRollingAverage(
  pts: { time: number; value: number }[]
): [number, number][] {
  if (pts.length === 0) return [];

  const sorted = [...pts].sort((a, b) => a.time - b.time);
  const result: [number, number][] = [];

  // Sample one point per day across the range
  const start = sorted[0].time;
  const end = sorted[sorted.length - 1].time;
  const dayMs = 24 * 60 * 60 * 1000;

  for (let t = start; t <= end; t += dayMs) {
    let sum = 0;
    let count = 0;
    for (const p of sorted) {
      if (Math.abs(p.time - t) <= ROLLING_WINDOW_MS) {
        sum += p.value;
        count++;
      }
    }
    if (count > 0) {
      result.push([t, Math.round((sum / count) * 10) / 10]);
    }
  }

  return result;
}

const chartOption = computed(() => {
  const mergeScatter: [number, number, number][] = [];
  const trainScatter: [number, number, number][] = [];
  const queueMergeScatter: [number, number, number][] = [];
  const queueTrainScatter: [number, number, number][] = [];
  const mergePts: { time: number; value: number }[] = [];
  const trainPts: { time: number; value: number }[] = [];
  const queueMergePts: { time: number; value: number }[] = [];
  const queueTrainPts: { time: number; value: number }[] = [];
  const pointMap = new Map<number, PipelineDurationPoint>();

  for (const p of props.points) {
    pointMap.set(p.id, p);
    const t = new Date(p.createdAt).getTime();
    const v = toMinutes(p.durationSeconds);
    if (p.type === "merge") {
      mergeScatter.push([t, v, p.id]);
      mergePts.push({ time: t, value: v });
    } else {
      trainScatter.push([t, v, p.id]);
      trainPts.push({ time: t, value: v });
    }
    if (p.queuedDurationSeconds != null) {
      const qv = toMinutes(p.queuedDurationSeconds);
      if (p.type === "merge") {
        queueMergeScatter.push([t, qv, p.id]);
        queueMergePts.push({ time: t, value: qv });
      } else {
        queueTrainScatter.push([t, qv, p.id]);
        queueTrainPts.push({ time: t, value: qv });
      }
    }
  }

  const mergeAvg = computeRollingAverage(mergePts);
  const trainAvg = computeRollingAverage(trainPts);
  const queueMergeAvg = computeRollingAverage(queueMergePts);
  const queueTrainAvg = computeRollingAverage(queueTrainPts);

  // Compute data range to adapt axis
  const allTimes = [...mergeScatter, ...trainScatter].map((p) => p[0]);
  const rangeMs = allTimes.length > 1
    ? Math.max(...allTimes) - Math.min(...allTimes)
    : 0;
  const rangeDays = rangeMs / (24 * 60 * 60 * 1000);
  const dayMs = 24 * 60 * 60 * 1000;
  const weekMs = 7 * dayMs;
  const showDaily = rangeDays <= 21;

  return {
    animation: true,
    animationDuration: 400,
    animationEasing: "cubicOut" as const,
    grid: {
      left: 48,
      right: 16,
      top: 32,
      bottom: 48,
    },
    tooltip: {
      trigger: "item" as const,
      backgroundColor: "#FFFFFF",
      borderColor: "#E5E5E0",
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: "#1A1A1A", fontSize: 12 },
      formatter(params: any) {
        const id = params.value[2];
        const p = pointMap.get(id);
        if (!p) return `${params.value[1]}m`;
        const d = new Date(p.createdAt);
        const date = d.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        const type = p.type === "train" ? "Merge Train" : "Merged Results";
        const dur = params.value[1];
        let html = `<div style="font-weight:500">#${id}</div>`;
        html += `<div style="color:#6B6B6B;margin-top:2px">${date}</div>`;
        html += `<div style="margin-top:6px;display:flex;gap:12px">`;
        html += `<span style="font-family:monospace">${dur}m</span>`;
        html += `<span style="color:#6B6B6B">${p.jobCount} jobs</span>`;
        if (p.retriedJobCount > 0) {
          html += `<span style="color:#D97706">${p.retriedJobCount} retried</span>`;
        }
        if (p.queuedDurationSeconds != null) {
          html += `<span style="color:#F59E0B;font-family:monospace">Queue: ${toMinutes(p.queuedDurationSeconds)}m</span>`;
        }
        html += `</div>`;
        html += `<div style="margin-top:2px;color:${p.type === "train" ? "#7C3AED" : "#3B82F6"};font-size:10px;font-weight:600;text-transform:uppercase">${type}</div>`;
        return html;
      },
    },
    legend: {
      data: ["Merge", "Train", "Queue (Merge)", "Queue (Train)"],
      bottom: 0,
      textStyle: { color: "#6B6B6B", fontSize: 11 },
      itemWidth: 12,
      itemHeight: 8,
    },
    xAxis: {
      type: "time" as const,
      axisLine: { lineStyle: { color: "#E5E5E0" } },
      axisLabel: {
        color: "#A3A3A0",
        fontSize: 10,
        formatter: (val: number) => {
          const d = new Date(val);
          if (showDaily) {
            const day = d.toLocaleDateString("en-US", { weekday: "short" });
            const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            return `${day} ${date}`;
          }
          return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        },
      },
      splitLine: {
        show: showDaily,
        lineStyle: { color: "#E5E5E0", type: "solid" },
      },
      minInterval: showDaily ? dayMs : weekMs,
      maxInterval: showDaily ? dayMs : weekMs,
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
        symbolSize: 5,
        itemStyle: { color: MERGE_COLOR, opacity: 0.3 },
        cursor: "pointer",
      },
      {
        name: "Train",
        type: "scatter" as const,
        data: trainScatter,
        symbolSize: 5,
        itemStyle: { color: TRAIN_COLOR, opacity: 0.3 },
        cursor: "pointer",
      },
      {
        name: "Merge",
        type: "line" as const,
        data: mergeAvg,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: MERGE_COLOR, width: 2 },
        itemStyle: { color: MERGE_COLOR },
        tooltip: { show: false },
      },
      {
        name: "Train",
        type: "line" as const,
        data: trainAvg,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: TRAIN_COLOR, width: 2 },
        itemStyle: { color: TRAIN_COLOR },
        tooltip: { show: false },
      },
      {
        name: "Queue (Merge)",
        type: "scatter" as const,
        data: queueMergeScatter,
        symbolSize: 5,
        itemStyle: { color: QUEUE_COLOR, opacity: 0.3 },
        cursor: "pointer",
      },
      {
        name: "Queue (Train)",
        type: "scatter" as const,
        data: queueTrainScatter,
        symbolSize: 5,
        itemStyle: { color: QUEUE_COLOR, opacity: 0.3 },
        cursor: "pointer",
      },
      {
        name: "Queue (Merge)",
        type: "line" as const,
        data: queueMergeAvg,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: QUEUE_COLOR, width: 2 },
        itemStyle: { color: QUEUE_COLOR },
        tooltip: { show: false },
      },
      {
        name: "Queue (Train)",
        type: "line" as const,
        data: queueTrainAvg,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: QUEUE_COLOR, width: 2, type: "dashed" as const },
        itemStyle: { color: QUEUE_COLOR },
        tooltip: { show: false },
      },
    ],
  };
});
</script>
