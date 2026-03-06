<template>
  <div
    class="group rounded-lg border-l-[3px] bg-surface-0 px-2.5 py-1.5 text-sm transition-colors hover:bg-surface-2"
    :class="borderClass"
  >
    <div class="flex items-center justify-between gap-1">
      <div class="min-w-0 flex-1">
        <span class="font-mono text-xs font-semibold tabular-nums text-ink">
          {{ entry.hours }}h
        </span>
        <span class="ml-1.5 text-xs text-ink-muted">
          {{ label }}
        </span>
      </div>
      <button
        v-if="entry.meetingId"
        @click.stop="toggleCategory"
        class="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider opacity-0 transition-opacity group-hover:opacity-100"
        :class="toggleClass"
      >
        {{ entry.category === 'non_dev' ? 'dev' : 'non-dev' }}
      </button>
    </div>
    <div
      v-if="expanded"
      class="mt-1.5 space-y-0.5 border-t border-border pt-1.5 text-xs text-ink-faint"
    >
      <p v-if="entry.reasoning.meetingTitle">
        {{ entry.reasoning.meetingTitle }}
        <span v-if="entry.reasoning.meetingDuration"> ({{ entry.reasoning.meetingDuration }}min)</span>
      </p>
      <p v-if="entry.reasoning.commitCount">
        {{ entry.reasoning.commitCount }} commits, +{{ entry.reasoning.totalAdditions }}/-{{ entry.reasoning.totalDeletions }} lines
      </p>
      <p v-if="entry.reasoning.mrTitles?.length" class="truncate">
        {{ entry.reasoning.mrTitles.join(', ') }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { WbsoEntry } from "@isaac/shared";

const props = defineProps<{
  entry: WbsoEntry;
}>();

const emit = defineEmits<{
  toggleCategory: [meetingId: number];
}>();

const expanded = ref(false);

const label = computed(() => {
  if (props.entry.ticketKey) return props.entry.ticketKey;
  if (props.entry.reasoning.meetingTitle) {
    const title = props.entry.reasoning.meetingTitle;
    return title.length > 30 ? title.slice(0, 30) + "..." : title;
  }
  if (props.entry.reasoning.mrTitles?.length) return "Code review";
  return props.entry.category;
});

const borderClass = computed(() => {
  switch (props.entry.category) {
    case "coding":
      return "border-l-emerald-500";
    case "dev_meeting":
      return "border-l-sky-500";
    case "dev_misc":
      return "border-l-violet-500";
    case "non_dev":
      return "border-l-amber-500";
  }
});

const toggleClass = computed(() => {
  if (props.entry.category === "non_dev") {
    return "bg-sky-50 text-sky-600 hover:bg-sky-100";
  }
  return "bg-amber-50 text-amber-600 hover:bg-amber-100";
});

function toggleCategory() {
  if (props.entry.meetingId) {
    emit("toggleCategory", props.entry.meetingId);
  }
}
</script>
