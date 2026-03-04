<template>
  <div class="flex items-center gap-2">
    <h1 class="text-2xl font-bold tracking-tight text-ink">
      {{ formattedDate }}
    </h1>
    <div class="ml-2 flex items-center gap-0.5">
      <button
        @click="$emit('prev')"
        class="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink-muted"
      >
        <ChevronLeftIcon class="h-5 w-5" />
      </button>
      <button
        @click="$emit('next')"
        class="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink-muted"
      >
        <ChevronRightIcon class="h-5 w-5" />
      </button>
    </div>
    <button
      v-if="!isCurrentWeek"
      @click="$emit('today')"
      class="ml-1 rounded-lg border border-border px-3 py-1 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
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
