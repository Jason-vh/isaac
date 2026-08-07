<template>
  <button
    v-if="value"
    type="button"
    :class="[
      'w-full truncate rounded-md border border-border bg-surface-0 px-2 py-1 text-left transition-colors hover:border-accent hover:bg-surface-2',
      mono ? 'font-mono text-xs text-ink-muted' : 'text-ink',
    ]"
    :title="copyValue ?? value"
    @click="$emit('copy', copyValue ?? value)"
  >
    {{ value }}
  </button>
  <span v-else class="px-2 text-ink-faint">—</span>
</template>

<script setup lang="ts">
/** copyValue lets a cell show a short label but copy the form's full one. */
defineProps<{ value: string; copyValue?: string; mono?: boolean }>();
defineEmits<{ copy: [value: string] }>();
</script>
