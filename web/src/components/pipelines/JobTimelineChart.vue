<template>
  <div v-if="loading" class="flex items-center justify-center h-32">
    <span class="text-xs text-ink-faint animate-pulse">Loading timeline...</span>
  </div>
  <div v-else-if="data.length === 0" class="flex items-center justify-center h-32">
    <span class="text-xs text-ink-faint">No data for this job in the selected period.</span>
  </div>
  <div v-else>
    <div class="flex items-center gap-1 rounded-lg border border-border bg-surface-0 p-0.5 w-fit mb-2">
      <button
        v-for="opt in modeOptions"
        :key="opt.value"
        class="rounded-md px-2.5 py-1 text-xs transition-colors"
        :class="mode === opt.value
          ? 'bg-white text-ink font-medium shadow-sm'
          : 'text-ink-muted hover:text-ink'"
        @click="mode = opt.value"
      >
        {{ opt.label }}
      </button>
    </div>
    <v-chart :option="chartOption" autoresize style="height: 128px" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
} from "echarts/components";
import VChart from "vue-echarts";
import type { PipelineScope } from "@isaac/shared";
import { api } from "../../api/client";

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent]);

interface TimelinePoint {
  date: string;
  p50Duration: number | null;
  retryRate: number;
  criticalPercent: number | null;
}

type Mode = "duration" | "retryRate" | "criticalPercent";

const modeOptions: { value: Mode; label: string }[] = [
  { value: "duration", label: "Duration" },
  { value: "retryRate", label: "Retry rate" },
  { value: "criticalPercent", label: "Critical %" },
];

const MODE_CONFIG: Record<Mode, { color: string; label: string; isPercent: boolean }> = {
  duration: { color: "#3B82F6", label: "Duration", isPercent: false },
  retryRate: { color: "#F59E0B", label: "Retry %", isPercent: true },
  criticalPercent: { color: "#EF4444", label: "Critical %", isPercent: true },
};

const props = defineProps<{
  jobName: string;
  since: string;
  until: string;
  scope: PipelineScope | "all";
}>();

const data = ref<TimelinePoint[]>([]);
const loading = ref(true);
const mode = ref<Mode>("duration");

async function fetchTimeline() {
  loading.value = true;
  try {
    const params = new URLSearchParams({
      since: new Date(props.since).toISOString(),
      until: new Date(props.until + "T23:59:59").toISOString(),
      job: props.jobName,
    });
    if (props.scope !== "all") params.set("scope", props.scope);
    data.value = await api.get<TimelinePoint[]>(`/pipelines/job-timeline?${params}`);
  } catch {
    data.value = [];
  } finally {
    loading.value = false;
  }
}

watch([() => props.jobName, () => props.since, () => props.until, () => props.scope], () => fetchTimeline(), { immediate: true });

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

const chartOption = computed(() => {
  const cfg = MODE_CONFIG[mode.value];
  const dates = data.value.map((d) => d.date);
  const values = data.value.map((d) => {
    switch (mode.value) {
      case "duration": return d.p50Duration;
      case "retryRate": return d.retryRate;
      case "criticalPercent": return d.criticalPercent;
    }
  });

  return {
    animation: true,
    animationDuration: 300,
    grid: { left: 48, right: 12, top: 8, bottom: 24 },
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: "#FFFFFF",
      borderColor: "#E5E5E0",
      borderWidth: 1,
      padding: [6, 10],
      textStyle: { color: "#1A1A1A", fontSize: 11 },
      formatter(params: any[]) {
        const p = params[0];
        if (!p || p.value == null) return "";
        const date = new Date(p.axisValue).toLocaleDateString("en-US", {
          weekday: "short", month: "short", day: "numeric",
        });
        const val = cfg.isPercent ? `${p.value}%` : fmtDuration(p.value);
        return `<div style="font-size:10px;color:#A3A3A0">${date}</div>`
          + `<div style="font-weight:600;font-size:13px;margin-top:2px">${val}</div>`;
      },
    },
    xAxis: {
      type: "category" as const,
      data: dates,
      axisLine: { lineStyle: { color: "#E5E5E0" } },
      axisLabel: {
        color: "#A3A3A0",
        fontSize: 9,
        formatter: (val: string) => {
          const d = new Date(val);
          return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        },
      },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value" as const,
      axisLine: { show: false },
      axisLabel: {
        color: "#A3A3A0",
        fontSize: 9,
        formatter: cfg.isPercent
          ? (val: number) => `${val}%`
          : (val: number) => val >= 60 ? `${Math.round(val / 60)}m` : `${val}s`,
      },
      splitLine: { lineStyle: { color: "#F5F5F0" } },
      min: cfg.isPercent ? 0 : undefined,
      max: cfg.isPercent ? 100 : undefined,
    },
    series: [{
      type: "line",
      data: values,
      smooth: true,
      connectNulls: true,
      showSymbol: false,
      lineStyle: { color: cfg.color, width: 2 },
      itemStyle: { color: cfg.color },
      areaStyle: { color: cfg.color, opacity: 0.06 },
    }],
  };
});
</script>
