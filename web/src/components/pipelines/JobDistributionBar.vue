<template>
  <svg
    v-if="p10 != null && p50 != null && p90 != null"
    width="100%"
    height="20"
    class="block"
    preserveAspectRatio="none"
  >
    <title>p10: {{ fmtDuration(p10) }} / p50: {{ fmtDuration(p50) }} / p90: {{ fmtDuration(p90) }}</title>

    <!-- Full-width background track -->
    <rect x="0" :y="8" width="100%" height="4" rx="2" fill="#e5e7eb" />

    <!-- Range bar (p10 to p90) — skip if single value -->
    <rect
      v-if="p10 !== p90"
      :x="rangeX"
      :y="7"
      :width="rangeW"
      height="6"
      rx="1"
      fill="#93c5fd"
    />

    <!-- p50 tick mark -->
    <rect
      :x="tickX"
      :y="4"
      width="2"
      height="12"
      rx="0.5"
      fill="#1e293b"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  p10: number | null;
  p50: number | null;
  p90: number | null;
  domainMax: number;
}>();

function pct(val: number): string {
  if (props.domainMax <= 0) return "0%";
  return `${(val / props.domainMax) * 100}%`;
}

const rangeX = computed(() => pct(props.p10 ?? 0));
const rangeW = computed(() => {
  const start = (props.p10 ?? 0) / (props.domainMax || 1) * 100;
  const end = (props.p90 ?? 0) / (props.domainMax || 1) * 100;
  return `${end - start}%`;
});
const tickX = computed(() => pct(props.p50 ?? 0));

function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "--";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}
</script>
