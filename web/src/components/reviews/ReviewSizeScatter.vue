<template>
  <div class="card p-5">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-ink">Size vs. review time</h2>
        <p class="mt-0.5 text-sm text-ink-muted">
          Each dot is a merged MR. Both axes are logarithmic; click to open it in
          GitLab.
        </p>
      </div>
      <p v-if="correlation !== null" class="text-sm text-ink-muted">
        correlation
        <span class="font-mono text-ink">{{ correlation.toFixed(2) }}</span>
      </p>
    </div>

    <div
      v-if="!series.length"
      class="flex h-72 items-center justify-center text-sm text-ink-faint"
    >
      No merged MRs with a review window in this period.
    </div>
    <v-chart
      v-else
      :option="chartOption"
      autoresize
      style="height: 288px"
      class="mt-4"
      @click="onClick"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { ScatterChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import VChart from "vue-echarts";
import type { ReviewMr } from "@isaac/shared";
import { formatHours } from "../../lib/duration";

use([CanvasRenderer, ScatterChart, GridComponent, TooltipComponent]);

const props = defineProps<{ mrs: ReviewMr[] }>();

const series = computed(() =>
  props.mrs
    .filter((m) => m.hoursToMerge !== null && m.additions + m.deletions > 0)
    .map((m) => ({
      value: [m.additions + m.deletions, Math.max(m.hoursToMerge!, 0.1)],
      mr: m,
    }))
);

/** Pearson correlation on log-scaled values, which is how the axes are drawn. */
const correlation = computed(() => {
  const points = series.value.map((p) => [
    Math.log(p.value[0]),
    Math.log(p.value[1]),
  ]);
  if (points.length < 5) return null;
  const mean = (values: number[]) =>
    values.reduce((a, b) => a + b, 0) / values.length;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const mx = mean(xs);
  const my = mean(ys);
  const cov = points.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0);
  const sx = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0));
  const sy = Math.sqrt(ys.reduce((s, y) => s + (y - my) ** 2, 0));
  return sx && sy ? cov / (sx * sy) : null;
});

const chartOption = computed(() => ({
  tooltip: {
    trigger: "item",
    formatter: (params: any) => {
      const mr: ReviewMr = params.data.mr;
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
    name: "lines changed",
    nameLocation: "middle",
    nameGap: 26,
    nameTextStyle: { color: "#A3A3A0", fontSize: 11 },
    axisLine: { lineStyle: { color: "#E5E5E0" } },
    axisLabel: { color: "#A3A3A0", fontSize: 11 },
    splitLine: { lineStyle: { color: "#F5F5F0" } },
  },
  yAxis: {
    type: "log",
    axisLabel: {
      color: "#A3A3A0",
      fontSize: 11,
      formatter: (v: number) => formatHours(v),
    },
    splitLine: { lineStyle: { color: "#F5F5F0" } },
  },
  series: [
    {
      type: "scatter" as const,
      symbolSize: 7,
      itemStyle: { color: "#E07A2F", opacity: 0.6 },
      data: series.value,
    },
  ],
}));

function onClick(params: any) {
  const mr: ReviewMr | undefined = params?.data?.mr;
  if (mr) window.open(mr.webUrl, "_blank");
}
</script>
