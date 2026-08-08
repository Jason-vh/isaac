<template>
  <div class="flex items-center gap-2">
    <h1 class="text-xl font-bold tracking-tight text-ink sm:text-2xl">
      <!-- The full date doesn't fit a phone, so drop to an abbreviated one -->
      <span class="sm:hidden">{{ formattedShort }}</span>
      <span class="hidden sm:inline">{{ formatted }}</span>
    </h1>
    <div class="ml-1 flex items-center gap-0.5 sm:ml-2">
      <button
        @click="$emit('prev')"
        aria-label="Previous day"
        class="rounded-lg bg-surface-0 p-2 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink-muted sm:p-1.5"
      >
        <ChevronLeftIcon class="h-5 w-5" />
      </button>
      <button
        @click="$emit('next')"
        :disabled="disableNext"
        aria-label="Next day"
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

const props = defineProps<{ date: string; disableNext?: boolean }>();
defineEmits<{ prev: []; next: [] }>();

const asDate = computed(() => new Date(props.date + "T00:00:00"));

// Matches the WBSO form's own heading, e.g. "Wednesday, 29 July 2026"
const formatted = computed(() => {
  const weekday = asDate.value.toLocaleDateString("en-GB", { weekday: "long" });
  const rest = asDate.value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${weekday}, ${rest}`;
});

// e.g. "Wed, 29 Jul"
const formattedShort = computed(() => {
  const weekday = asDate.value.toLocaleDateString("en-GB", { weekday: "short" });
  const rest = asDate.value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
  return `${weekday}, ${rest}`;
});
</script>
