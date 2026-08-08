<template>
  <div class="flex items-center gap-2">
    <h1 class="text-xl font-bold tracking-tight text-ink sm:text-2xl">
      {{ formattedDate }}
    </h1>
    <div class="ml-1 flex items-center gap-0.5 sm:ml-2">
      <button
        @click="$emit('prev')"
        aria-label="Previous week"
        class="rounded-lg bg-surface-0 p-2 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink-muted sm:p-1.5"
      >
        <ChevronLeftIcon class="h-5 w-5" />
      </button>
      <button
        @click="$emit('next')"
        :disabled="disableNext"
        aria-label="Next week"
        class="rounded-lg p-2 transition-colors sm:p-1.5"
        :class="disableNext ? 'cursor-not-allowed bg-surface-0/50 text-ink-faint/30' : 'bg-surface-0 text-ink-faint hover:bg-surface-2 hover:text-ink-muted'"
      >
        <ChevronRightIcon class="h-5 w-5" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/vue/20/solid";

const props = defineProps<{ weekStart: string; disableNext?: boolean }>();
defineEmits<{
  prev: [];
  next: [];
}>();

const formattedDate = computed(() => {
  const d = new Date(props.weekStart + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
});
</script>
