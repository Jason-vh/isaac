<template>
  <svg :width="width" :height="height" class="block">
    <!-- Filled area -->
    <polygon :points="areaPoints" :fill="color" fill-opacity="0.2" />
    <!-- Line -->
    <polyline :points="linePoints" fill="none" :stroke="color" stroke-width="1.5" stroke-linejoin="round" />
    <!-- Last point dot -->
    <circle :cx="dotX" :cy="dotY" r="2" :fill="color" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { JobRetryTrendPoint, JobRetryTrend } from "@isaac/shared";

const props = defineProps<{
  weeks: JobRetryTrendPoint[];
  severity: JobRetryTrend["severity"];
}>();

const width = 56;
const height = 20;
const padX = 3;
const padY = 3;

const colorMap: Record<JobRetryTrend["severity"], string> = {
  worsening: "#F87171",
  chronic: "#FBBF24",
  improving: "#34D399",
  healthy: "#9CA3AF",
};

const color = computed(() => colorMap[props.severity]);

const coords = computed(() => {
  const rates = props.weeks.map((w) => w.retryRate);
  if (rates.length < 2) return [];
  const maxRate = Math.max(...rates, 10);
  const drawW = width - padX * 2;
  const drawH = height - padY * 2;
  const step = drawW / (rates.length - 1);

  return rates.map((r, i) => ({
    x: padX + i * step,
    y: padY + drawH - (r / maxRate) * drawH,
  }));
});

const linePoints = computed(() =>
  coords.value.map((c) => `${c.x},${c.y}`).join(" ")
);

const areaPoints = computed(() => {
  const pts = coords.value;
  if (pts.length === 0) return "";
  const bottom = height - padY;
  return [
    `${pts[0].x},${bottom}`,
    ...pts.map((c) => `${c.x},${c.y}`),
    `${pts[pts.length - 1].x},${bottom}`,
  ].join(" ");
});

const dotX = computed(() => coords.value.length > 0 ? coords.value[coords.value.length - 1].x : 0);
const dotY = computed(() => coords.value.length > 0 ? coords.value[coords.value.length - 1].y : 0);
</script>
