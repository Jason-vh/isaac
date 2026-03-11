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
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/vue/20/solid";

const props = defineProps<{ weekStart: string }>();
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
