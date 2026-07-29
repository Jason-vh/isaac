<template>
  <div class="flex items-center gap-2">
    <div class="flex h-2 w-full min-w-[80px] overflow-hidden rounded-full bg-surface-3">
      <div
        v-for="seg in segments"
        :key="seg.category"
        class="h-full"
        :class="seg.color"
        :style="{ width: `${seg.percent}%` }"
        :title="`${seg.label}: ${seg.value.toLocaleString()} lines (${Math.round(seg.percent)}%)`"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { LinesByCategory } from "@isaac/shared";

const props = defineProps<{ byCategory: LinesByCategory }>();

const CATEGORY_STYLES = [
  { category: "frontend", label: "Frontend", color: "bg-activity-mr" },
  { category: "backend", label: "Backend", color: "bg-activity-ticket" },
  { category: "other", label: "Other", color: "bg-ink-faint" },
] as const;

const segments = computed(() => {
  const values = CATEGORY_STYLES.map((s) => ({
    ...s,
    value: props.byCategory[s.category]?.additions ?? 0,
  }));
  const total = values.reduce((sum, v) => sum + v.value, 0);
  return values.map((v) => ({
    ...v,
    percent: total > 0 ? (v.value / total) * 100 : 0,
  }));
});
</script>
