<template>
  <div class="card overflow-hidden">
    <h3 class="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
      Sprint Velocity
    </h3>
    <div v-if="weeks.length === 0" class="p-4 text-sm text-ink-faint">
      No data yet.
    </div>
    <div v-else class="p-4">
      <!-- Active week headline -->
      <div class="mb-4 flex items-baseline gap-2">
        <span class="font-mono text-3xl font-medium tabular-nums text-ink">
          {{ activeValue }}
        </span>
        <span class="text-sm text-ink-muted">
          {{ hasSP ? "SP" : "tickets" }} this week
        </span>
        <span
          v-if="delta !== null && delta !== 0"
          class="ml-auto rounded-md px-1.5 py-0.5 font-mono text-xs font-medium tabular-nums"
          :class="delta >= 0 ? 'bg-emerald-50 text-activity-ticket' : 'bg-red-50 text-red-500'"
        >
          {{ delta >= 0 ? "+" : "" }}{{ delta }}
        </span>
      </div>

      <!-- Bar chart -->
      <div class="flex items-end gap-[3px]" style="height: 64px;">
        <div
          v-for="(week, i) in weeks"
          :key="week.weekStart"
          class="group relative flex-1"
          style="height: 100%;"
        >
          <div class="absolute bottom-0 left-0 right-0 flex flex-col items-center">
            <div
              class="w-full rounded-sm transition-all duration-300"
              :class="barColor(week)"
              :style="{ height: `${barHeight(week)}px` }"
            />
          </div>
          <!-- Tooltip -->
          <div class="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 font-mono text-[10px] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
            {{ week.ticketsClosed }} tickets{{ week.storyPointsClosed ? ` · ${week.storyPointsClosed} SP` : "" }}
          </div>
        </div>
      </div>

      <!-- X-axis labels -->
      <div class="mt-1.5 flex gap-[3px]">
        <div
          v-for="(week, i) in weeks"
          :key="week.weekStart + '-label'"
          class="flex-1 text-center"
        >
          <span
            v-if="i === 0 || i === weeks.length - 1 || week.weekStart === activeWeek"
            class="font-mono text-[9px]"
            :class="week.weekStart === activeWeek ? 'font-medium text-accent' : 'text-ink-faint'"
          >
            {{ formatWeekLabel(week.weekStart) }}
          </span>
        </div>
      </div>

      <!-- Average -->
      <div class="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <div class="h-px flex-1 border-t border-dashed border-ink-faint/40" />
        <span class="font-mono text-[11px] text-ink-faint">
          avg {{ avgValue }} {{ hasSP ? "SP" : "tickets" }}/week
        </span>
        <div class="h-px flex-1 border-t border-dashed border-ink-faint/40" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { VelocityWeek } from "@isaac/shared";

const props = defineProps<{
  weeks: VelocityWeek[];
  activeWeek: string;
}>();

// Use SP if any week has story points, otherwise fall back to ticket count
const hasSP = computed(() =>
  props.weeks.some((w) => w.storyPointsClosed > 0)
);

function metric(week: VelocityWeek): number {
  return hasSP.value ? week.storyPointsClosed : week.ticketsClosed;
}

const maxValue = computed(() =>
  Math.max(1, ...props.weeks.map(metric))
);

const activeIndex = computed(() =>
  props.weeks.findIndex((w) => w.weekStart === props.activeWeek)
);

const activeValue = computed(() => {
  if (activeIndex.value === -1) return 0;
  return metric(props.weeks[activeIndex.value]);
});

const avgValue = computed(() => {
  if (props.weeks.length === 0) return 0;
  const sum = props.weeks.reduce((acc, w) => acc + metric(w), 0);
  return Math.round((sum / props.weeks.length) * 10) / 10;
});

const delta = computed(() => {
  const idx = activeIndex.value;
  if (idx < 1) return null;
  const curr = metric(props.weeks[idx]);
  const prev = metric(props.weeks[idx - 1]);
  return Math.round((curr - prev) * 10) / 10;
});

function barHeight(week: VelocityWeek): number {
  return Math.max(2, (metric(week) / maxValue.value) * 56);
}

function barColor(week: VelocityWeek): string {
  const isActive = week.weekStart === props.activeWeek;
  if (isActive) return "bg-accent";
  if (metric(week) === 0) return "bg-surface-3";
  return "bg-accent/30";
}

function formatWeekLabel(weekStart: string): string {
  const d = new Date(weekStart + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
</script>
