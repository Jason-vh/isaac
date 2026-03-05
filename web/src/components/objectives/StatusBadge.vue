<template>
  <span
    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
    :class="colorClass"
  >
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  status: string;
}>();

const colorMap: Record<string, string> = {
  on_track: "bg-emerald-50 text-emerald-700",
  at_risk: "bg-amber-50 text-amber-700",
  behind: "bg-red-50 text-red-700",
  completed: "bg-blue-50 text-blue-700",
  active: "bg-emerald-50 text-emerald-700",
  abandoned: "bg-gray-100 text-gray-500",
};

const labelMap: Record<string, string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  behind: "Behind",
  completed: "Completed",
  active: "Active",
  abandoned: "Abandoned",
};

const colorClass = computed(() => colorMap[props.status] ?? "bg-gray-100 text-gray-600");
const label = computed(() => labelMap[props.status] ?? props.status);
</script>
