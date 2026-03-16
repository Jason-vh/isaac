<template>
  <div class="card overflow-hidden">
    <div class="flex items-center justify-between border-b border-border px-4 py-3">
      <h3 class="text-xs font-semibold uppercase tracking-wider text-ink-faint">
        Duration Trend
      </h3>
      <div class="flex items-center gap-1 rounded-lg border border-border bg-surface-0 p-0.5">
        <button
          v-for="opt in splitOptions"
          :key="opt.value"
          class="rounded-md px-2 py-0.5 text-xs transition-colors"
          :class="splitBy === opt.value
            ? 'bg-surface-2 text-ink font-medium'
            : 'text-ink-muted hover:text-ink'"
          @click="$emit('update:splitBy', opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>
    <div v-if="loading" class="p-4">
      <div class="flex items-center justify-center" style="height: 420px">
        <span class="text-sm text-ink-faint animate-pulse">Loading chart...</span>
      </div>
    </div>
    <div v-else-if="points.length === 0" class="p-4 text-sm text-ink-faint">
      No data yet.
    </div>
    <div v-else class="p-4">
      <v-chart :option="chartOption" autoresize style="height: 420px" @click="onChartClick" />
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

export type SplitBy = "type" | "scope";

const splitOptions = [
  { value: "type" as const, label: "Pipeline type" },
  { value: "scope" as const, label: "Change scope" },
];

interface SeriesConfig {
  key: string;
  label: string;
  color: string;
  filter: (p: PipelineDurationPoint) => boolean;
}

const SPLIT_CONFIGS: Record<SplitBy, SeriesConfig[]> = {
  type: [
    { key: "merge", label: "Merge", color: "#3B82F6", filter: (p) => p.type === "merge" },
    { key: "train", label: "Train", color: "#7C3AED", filter: (p) => p.type === "train" },
  ],
  scope: [
    { key: "fullstack", label: "Fullstack", color: "#8B5CF6", filter: (p) => p.scope === "fullstack" },
    { key: "backend", label: "Backend", color: "#10B981", filter: (p) => p.scope === "backend" },
    { key: "frontend", label: "Frontend", color: "#3B82F6", filter: (p) => p.scope === "frontend" },
    { key: "neither", label: "Neither", color: "#9CA3AF", filter: (p) => p.scope === "neither" },
  ],
};

const props = defineProps<{ points: PipelineDurationPoint[]; loading: boolean; splitBy: SplitBy }>();
const emit = defineEmits<{ (e: "select", id: number): void; (e: "update:splitBy", value: SplitBy): void }>();

function onChartClick(params: any) {
  if (params.seriesType === "scatter" && params.value?.[2]) {
    emit("select", params.value[2]);
  }
}

const ROLLING_WINDOW_MS = 0.5 * 24 * 60 * 60 * 1000;

function toMinutes(seconds: number): number {
  return Math.round((seconds / 60) * 10) / 10;
}

function computeRollingAverage(
  pts: { time: number; value: number }[]
): [number, number][] {
  if (pts.length === 0) return [];

  const sorted = [...pts].sort((a, b) => a.time - b.time);
  const result: [number, number][] = [];

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
  const configs = SPLIT_CONFIGS[props.splitBy];
  const pointMap = new Map<number, PipelineDurationPoint>();

  // Bucket points by series
  const buckets = configs.map(() => ({
    scatter: [] as [number, number, number][],
    pts: [] as { time: number; value: number }[],
  }));

  for (const p of props.points) {
    pointMap.set(p.id, p);
    const t = new Date(p.createdAt).getTime();
    const v = toMinutes(p.durationSeconds);
    for (let i = 0; i < configs.length; i++) {
      if (configs[i].filter(p)) {
        buckets[i].scatter.push([t, v, p.id]);
        buckets[i].pts.push({ time: t, value: v });
        break;
      }
    }
  }

  // Compute time range
  const allTimes = props.points.map((p) => new Date(p.createdAt).getTime());
  const rangeMs = allTimes.length > 1
    ? Math.max(...allTimes) - Math.min(...allTimes)
    : 0;
  const rangeDays = rangeMs / (24 * 60 * 60 * 1000);
  const dayMs = 24 * 60 * 60 * 1000;
  const weekMs = 7 * dayMs;
  const showDaily = rangeDays <= 21;

  // Build series dynamically
  const series: any[] = [];
  for (let i = 0; i < configs.length; i++) {
    const cfg = configs[i];
    const bucket = buckets[i];
    series.push({
      name: cfg.label,
      type: "scatter",
      data: bucket.scatter,
      symbolSize: 5,
      itemStyle: { color: cfg.color, opacity: 0.3 },
      cursor: "pointer",
    });
    series.push({
      name: cfg.label,
      type: "line",
      data: computeRollingAverage(bucket.pts),
      smooth: true,
      showSymbol: false,
      lineStyle: { color: cfg.color, width: 2 },
      itemStyle: { color: cfg.color },
      tooltip: { show: false },
    });
  }

  // Color map for tooltip
  const colorMap = Object.fromEntries(configs.map((c) => [c.key, c.color]));
  const labelMap = Object.fromEntries(configs.map((c) => [c.key, c.label]));

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
        const splitKey = props.splitBy === "type" ? p.type : p.scope;
        const badgeColor = colorMap[splitKey] ?? "#A3A3A0";
        const badgeLabel = labelMap[splitKey] ?? splitKey;
        const dur = params.value[1];
        let html = `<div style="display:flex;align-items:baseline;gap:8px">`;
        html += `<span style="font-family:monospace;font-weight:600;font-size:14px">${dur}m</span>`;
        html += `<span style="color:${badgeColor};font-size:10px;font-weight:600;text-transform:uppercase">${badgeLabel}</span>`;
        html += `</div>`;
        html += `<div style="color:#A3A3A0;font-size:11px;margin-top:2px">${date}</div>`;
        html += `<div style="display:flex;gap:8px;margin-top:4px;font-size:11px;color:#A3A3A0">`;
        html += `<span>${p.jobCount} jobs</span>`;
        if (p.retriedJobCount > 0) {
          html += `<span style="color:#D97706">${p.retriedJobCount} retried</span>`;
        }
        if (p.queuedDurationSeconds != null) {
          html += `<span>queued for ${Math.round(p.queuedDurationSeconds)}s</span>`;
        }
        html += `</div>`;
        return html;
      },
    },
    legend: {
      data: configs.map((c) => c.label),
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
    series,
  };
});
</script>
