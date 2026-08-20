<template>
  <div class="card p-4 sm:p-5">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 class="text-lg font-semibold text-ink">Size vs. review</h2>
        <p class="mt-0.5 text-sm text-ink-muted">
          Each dot is a merged MR. {{ config.axes }}; click a dot to open it in
          GitLab.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <p v-if="correlation !== null" class="shrink-0 text-sm text-ink-muted">
          correlation
          <span class="font-mono text-ink">{{ correlation.toFixed(2) }}</span>
        </p>
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
    </div>

    <div
      v-if="!series.length"
      class="flex h-96 items-center justify-center text-sm text-ink-faint"
    >
      {{ config.empty }}
    </div>
    <v-chart
      v-else
      :option="chartOption"
      autoresize
      style="height: 384px"
      class="mt-4"
      @click="onClick"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart, ScatterChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import VChart from "vue-echarts";
import type { ReviewMr } from "@isaac/shared";
import { formatHours } from "../../lib/duration";

use([CanvasRenderer, ScatterChart, LineChart, GridComponent, TooltipComponent]);

type Metric = "hoursToMerge" | "comments";

const props = defineProps<{ mrs: ReviewMr[] }>();

const metricOptions: { value: Metric; label: string }[] = [
  { value: "hoursToMerge", label: "Time to merge" },
  { value: "comments", label: "Comments" },
];

const metric = ref<Metric>("hoursToMerge");

/**
 * Both charts plot lines changed against a review signal. Time to merge spans
 * orders of magnitude and never hits zero, so it gets a log axis; comment
 * counts are small and often zero, so they stay linear. The trend line and the
 * correlation work on the same scale the axes are drawn at, so a straight line
 * on screen is a straight fit.
 */
const METRICS: Record<
  Metric,
  {
    axes: string;
    empty: string;
    value: (mr: ReviewMr) => number | null;
    axisType: "log" | "value";
    axisMin?: number;
    toAxis: (value: number) => number;
    fromAxis: (value: number) => number;
    format: (value: number) => string;
    color: string;
  }
> = {
  hoursToMerge: {
    axes: "Both axes are logarithmic",
    empty: "No merged MRs with a review window in this period.",
    value: (mr) => (mr.hoursToMerge === null ? null : Math.max(mr.hoursToMerge, 0.1)),
    axisType: "log",
    toAxis: Math.log,
    fromAxis: Math.exp,
    format: formatHours,
    color: "#E07A2F",
  },
  comments: {
    axes: "The size axis is logarithmic",
    empty: "No merged MRs with changed lines in this period.",
    value: (mr) => mr.comments,
    axisType: "value",
    axisMin: 0,
    toAxis: (value) => value,
    fromAxis: (value) => value,
    format: (value) => `${value}`,
    color: "#3F7F8C",
  },
};

const config = computed(() => METRICS[metric.value]);

const series = computed(() =>
  props.mrs.flatMap((mr) => {
    const lines = mr.additions + mr.deletions;
    const value = config.value.value(mr);
    if (lines <= 0 || value === null) return [];
    return [{ value: [lines, value], mr }];
  })
);

/** The points as plotted, with each value on the scale its axis is drawn at. */
const fitPoints = computed(() =>
  series.value.map((p) => [Math.log(p.value[0]), config.value.toAxis(p.value[1])])
);

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Pearson correlation, least-squares slope and intercept in one pass. */
const fit = computed(() => {
  const points = fitPoints.value;
  if (points.length < 5) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const mx = mean(xs);
  const my = mean(ys);
  const cov = xs.reduce((sum, x, i) => sum + (x - mx) * (ys[i] - my), 0);
  const vx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const vy = ys.reduce((s, y) => s + (y - my) ** 2, 0);
  if (!vx || !vy) return null;
  const slope = cov / vx;
  return {
    correlation: cov / Math.sqrt(vx * vy),
    at: (lines: number) =>
      config.value.fromAxis(my + slope * (Math.log(lines) - mx)),
  };
});

const correlation = computed(() => fit.value?.correlation ?? null);

/**
 * The plotted size range, padded by 15%. A log axis otherwise rounds out to
 * whole powers of ten, leaving most of a decade empty past the largest MR.
 */
const sizeRange = computed(() => {
  const xs = series.value.map((p) => p.value[0]);
  return xs.length ? { min: Math.min(...xs), max: Math.max(...xs) } : null;
});

/** Two endpoints are enough: the fit is a straight line in screen space. */
const trendLine = computed(() => {
  const range = sizeRange.value;
  if (!fit.value || !range) return [];
  return [range.min, range.max].map((x) => [x, fit.value!.at(x)]);
});

const chartOption = computed(() => ({
  tooltip: {
    trigger: "item",
    formatter: (params: any) => {
      const mr: ReviewMr | undefined = params.data?.mr;
      if (!mr) return "";
      return `!${mr.iid} ${mr.title}<br/>${(
        mr.additions + mr.deletions
      ).toLocaleString()} lines · ${formatHours(
        mr.hoursToMerge
      )} · ${mr.comments} comments`;
    },
  },
  grid: { left: 56, right: 16, top: 16, bottom: 40 },
  xAxis: {
    type: "log",
    min: (sizeRange.value?.min ?? 1) / 1.15,
    max: (sizeRange.value?.max ?? 1) * 1.15,
    name: "lines changed",
    nameLocation: "middle",
    nameGap: 26,
    nameTextStyle: { color: "#A3A3A0", fontSize: 11 },
    axisLine: { lineStyle: { color: "#E5E5E0" } },
    axisLabel: { color: "#A3A3A0", fontSize: 11 },
    splitLine: { lineStyle: { color: "#F5F5F0" } },
  },
  yAxis: {
    type: config.value.axisType,
    min: config.value.axisMin,
    axisLabel: {
      color: "#A3A3A0",
      fontSize: 11,
      formatter: (v: number) => config.value.format(v),
    },
    splitLine: { lineStyle: { color: "#F5F5F0" } },
  },
  series: [
    {
      type: "scatter" as const,
      symbolSize: 7,
      itemStyle: { color: config.value.color, opacity: 0.6 },
      data: series.value,
    },
    {
      type: "line" as const,
      silent: true,
      showSymbol: false,
      lineStyle: { color: config.value.color, width: 2, type: "dashed" },
      data: trendLine.value,
    },
  ],
}));

function onClick(params: any) {
  const mr: ReviewMr | undefined = params?.data?.mr;
  if (mr) window.open(mr.webUrl, "_blank");
}
</script>
