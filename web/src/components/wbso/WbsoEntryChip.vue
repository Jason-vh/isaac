<template>
  <div
    class="group border-l-[3px] bg-surface-0 px-2.5 py-1.5 text-xs transition-colors hover:bg-surface-2"
    :class="borderClass"
  >
    <div class="flex items-center justify-between gap-1">
      <div class="flex min-w-0 items-center gap-1">
        <component
          :is="icon"
          class="h-3.5 w-3.5 flex-shrink-0"
          :class="iconColor"
        />
        <span class="font-mono font-semibold tabular-nums text-ink">
          {{ entry.hours }}h
        </span>
        <span class="text-ink-muted">{{ actionLabel }}</span>
        <a
          v-if="entry.ticketKey"
          :href="`${jiraBrowseUrl}/${entry.ticketKey}`"
          target="_blank"
          class="font-medium text-ink hover:underline"
          @click.stop
        >
          {{ entry.ticketKey }}
        </a>
      </div>
      <button
        v-if="entry.meetingId"
        @click.stop="toggleCategory"
        class="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider opacity-0 transition-opacity group-hover:opacity-100"
        :class="toggleClass"
      >
        {{ entry.category === "non_dev" ? "dev" : "non-dev" }}
      </button>
    </div>
    <!-- Meeting title on second line -->
    <p
      v-if="entry.reasoning.meetingTitle"
      class="mt-0.5 truncate pl-[18px] text-ink-faint"
    >
      {{ entry.reasoning.meetingTitle }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { WbsoEntry } from "@isaac/shared";
import {
  CodeBracketIcon,
  ChatBubbleLeftEllipsisIcon,
  CalendarIcon,
  CalendarDateRangeIcon,
  SunIcon,
} from "@heroicons/vue/24/outline";

const props = defineProps<{
  entry: WbsoEntry;
  jiraBrowseUrl: string;
}>();

const emit = defineEmits<{
  toggleCategory: [meetingId: number];
}>();

type EntryType = "coding" | "review" | "meeting" | "leave";

const entryType = computed((): EntryType => {
  if (props.entry.category === "leave") return "leave";
  if (props.entry.meetingId) return "meeting";
  if (props.entry.reasoning.commitCount) return "coding";
  if (props.entry.reasoning.mrTitles?.length) return "review";
  return "coding";
});

const actionLabel = computed(() => {
  switch (entryType.value) {
    case "coding":
      return props.entry.ticketKey ? "coding on" : "coding";
    case "review":
      return props.entry.ticketKey ? "review on" : "code review";
    case "meeting":
      return props.entry.ticketKey ? "meeting for" : "meeting";
    case "leave":
      return "leave";
  }
});

const icon = computed(() => {
  switch (entryType.value) {
    case "coding":
      return CodeBracketIcon;
    case "review":
      return ChatBubbleLeftEllipsisIcon;
    case "meeting":
      if (props.entry.category === "non_dev") return CalendarIcon;
      return CalendarDateRangeIcon;
    case "leave":
      return SunIcon;
  }
});

const iconColor = computed(() => {
  switch (props.entry.category) {
    case "coding":
      return "text-emerald-500";
    case "dev_meeting":
      return "text-sky-500";
    case "dev_misc":
      return "text-violet-500";
    case "non_dev":
      return "text-amber-500";
    case "leave":
      return "text-rose-500";
  }
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
    case "leave":
      return "border-l-rose-500";
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
