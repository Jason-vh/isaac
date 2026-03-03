<template>
  <div class="flex items-center gap-3">
    <button
      @click="$emit('prev')"
      class="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
    >
      <ChevronLeftIcon class="h-5 w-5" />
    </button>
    <h2 class="text-lg font-semibold text-gray-900">
      Week of {{ formattedDate }}
    </h2>
    <button
      @click="$emit('next')"
      class="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
    >
      <ChevronRightIcon class="h-5 w-5" />
    </button>
    <button
      v-if="!isCurrentWeek"
      @click="$emit('today')"
      class="ml-2 rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
    >
      Today
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/vue/20/solid";

const props = defineProps<{ weekStart: string }>();
defineEmits<{
  prev: [];
  next: [];
  today: [];
}>();

const formattedDate = computed(() => {
  const d = new Date(props.weekStart + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
});

const isCurrentWeek = computed(() => {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().split("T")[0] === props.weekStart;
});
</script>
