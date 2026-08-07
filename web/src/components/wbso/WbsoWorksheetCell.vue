<template>
  <button
    v-if="value"
    type="button"
    :class="[
      'w-full rounded px-1 py-0.5 text-left transition-colors hover:bg-surface-2',
      mono ? 'font-mono text-xs text-ink-muted' : 'text-ink',
    ]"
    :title="value"
    @click="$emit('copy', value)"
  >
    {{ value }}
  </button>
  <span v-else class="px-1 text-ink-faint">—</span>
</template>

<script setup lang="ts">
defineProps<{ value: string; mono?: boolean }>();
defineEmits<{ copy: [value: string] }>();
</script>
