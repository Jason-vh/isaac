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
  addDays,
  buildPresets,
  dayCount,
  formatDayCount,
  formatRange,
  matchPreset,
  sprintRange,
  today,
} from "../../lib/dateRange";
import { useSprints } from "../../composables/useSprints";

const props = defineProps<{ since: string; until: string }>();
const emit = defineEmits<{
  "update:since": [string];
  "update:until": [string];
}>();

const { sprints } = useSprints();
const maxDate = today();

const presets = computed(() => buildPresets(sprints.value));
const range = computed(() => ({ since: props.since, until: props.until }));
const activePreset = computed(() => matchPreset(range.value, presets.value));
const durationLabel = computed(() => formatDayCount(dayCount(range.value)));
const canShiftForward = computed(() => props.until < maxDate);

/** Sprints oldest first, so the arrows can step between neighbours. */
const byStart = computed(() =>
  sprints.value
    .filter((s) => s.startDate)
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!))
);

/** Index of the sprint the current range covers exactly, if any. */
const selectedSprint = computed(() =>
  byStart.value.findIndex((s) => {
    const r = sprintRange(s);
    return r.since === props.since && r.until === props.until;
  })
);

function update(since: string, until: string) {
  if (since !== props.since) emit("update:since", since);
  if (until !== props.until) emit("update:until", until);
}

function apply(id: string) {
  const next = presets.value.find((p) => p.id === id)?.range();
  if (next) update(next.since, next.until);
}

/**
 * Steps to the neighbouring sprint when a sprint is selected — sprint lengths
 * vary, so a fixed offset would drift — and by the range's own length otherwise.
 */
function shift(direction: -1 | 1) {
  const index = selectedSprint.value;
  if (index !== -1) {
    const neighbour = byStart.value[index + direction];
    if (neighbour && neighbour.startDate!.slice(0, 10) <= maxDate) {
      const next = sprintRange(neighbour);
      update(next.since, next.until);
      return;
    }
    if (direction === -1) return;
  }

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
