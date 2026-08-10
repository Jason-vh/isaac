<template>
  <div class="flex flex-wrap items-center gap-2">
    <!-- Presets -->
    <div class="flex w-full items-center gap-0.5 rounded-lg border border-border bg-surface-0 p-0.5 sm:w-auto">
      <button
        v-for="preset in presets"
        :key="preset.id"
        class="flex-1 rounded-md px-2 py-1 text-xs transition-colors sm:flex-none"
        :class="activePreset === preset.id
          ? 'bg-accent-light font-medium text-accent'
          : 'text-ink-muted hover:text-ink'"
        :title="preset.title"
        @click="apply(preset.id)"
      >
        {{ preset.label }}
      </button>
    </div>

    <!-- Shift the window by its own length; presets cover this on small screens -->
    <div class="hidden items-center gap-0.5 sm:flex">
      <button
        class="rounded-lg bg-surface-0 p-1 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink-muted"
        :title="`Previous ${durationLabel}`"
        @click="shift(-1)"
      >
        <ChevronLeftIcon class="h-4 w-4" />
      </button>
      <button
        class="rounded-lg p-1 transition-colors"
        :class="canShiftForward
          ? 'bg-surface-0 text-ink-faint hover:bg-surface-2 hover:text-ink-muted'
          : 'cursor-not-allowed bg-surface-0/50 text-ink-faint/30'"
        :disabled="!canShiftForward"
        :title="`Next ${durationLabel}`"
        @click="shift(1)"
      >
        <ChevronRightIcon class="h-4 w-4" />
      </button>
    </div>

    <!-- Explicit dates -->
    <div class="flex flex-1 items-center gap-1.5 sm:flex-none">
      <input
        :value="since"
        type="date"
        :max="until"
        class="min-w-0 flex-1 rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm text-ink sm:flex-none"
        @change="onSinceInput"
      />
      <span class="text-sm text-ink-faint">to</span>
      <input
        :value="until"
        type="date"
        :min="since"
        :max="maxDate"
        class="min-w-0 flex-1 rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm text-ink sm:flex-none"
        @change="onUntilInput"
      />
    </div>

    <!-- Selected duration -->
    <span
      class="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-muted tabular-nums"
      :title="formatRange({ since, until })"
    >
      {{ durationLabel }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/vue/20/solid";
import {
  DATE_PRESETS,
  addDays,
  dayCount,
  formatDayCount,
  formatRange,
  matchPreset,
  presetRange,
  today,
} from "../../lib/dateRange";

const props = defineProps<{ since: string; until: string }>();
const emit = defineEmits<{
  "update:since": [string];
  "update:until": [string];
}>();

const presets = DATE_PRESETS;
const maxDate = today();

const range = computed(() => ({ since: props.since, until: props.until }));
const activePreset = computed(() => matchPreset(range.value));
const durationLabel = computed(() => formatDayCount(dayCount(range.value)));
const canShiftForward = computed(() => props.until < maxDate);

function update(since: string, until: string) {
  if (since !== props.since) emit("update:since", since);
  if (until !== props.until) emit("update:until", until);
}

function apply(id: string) {
  const next = presetRange(id);
  update(next.since, next.until);
}

/** Move the window one full duration earlier or later, never past today. */
function shift(direction: -1 | 1) {
  const length = dayCount(range.value);
  const until = addDays(props.until, length * direction);
  const clamped = until > maxDate ? maxDate : until;
  update(addDays(clamped, -(length - 1)), clamped);
}

function onSinceInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  if (!value) return;
  update(value, value > props.until ? value : props.until);
}

function onUntilInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  if (!value) return;
  update(value < props.since ? value : props.since, value);
}
</script>
