<template>
  <div class="flex items-center gap-2">
    <router-link
      v-for="obj in OBJECTIVES"
      :key="obj.slug"
      :to="`/objectives/${obj.slug}`"
      class="rounded-lg border px-2.5 py-1 text-sm transition-colors"
      :class="obj.slug === activeSlug
        ? 'border-accent bg-accent-light text-accent'
        : 'border-border bg-surface-0 text-ink-muted hover:text-ink hover:bg-surface-2'"
    >
      {{ obj.title }}
    </router-link>
  </div>
</template>

<script setup lang="ts">
import { OBJECTIVES } from "@isaac/shared/objectives";

defineProps<{
  activeSlug: string;
}>();
</script>
