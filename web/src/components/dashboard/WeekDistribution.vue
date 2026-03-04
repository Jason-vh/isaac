<template>
  <div class="card overflow-hidden">
    <h3 class="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
      Work Distribution
    </h3>
    <div class="p-4">
      <!-- Activity type breakdown -->
      <div class="space-y-3">
        <div v-for="cat in categories" :key="cat.label">
          <div class="mb-1 flex items-center justify-between">
            <span class="text-xs font-medium text-ink-muted">{{ cat.label }}</span>
            <span class="font-mono text-xs tabular-nums text-ink-faint">{{ cat.value }}</span>
          </div>
          <div class="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="cat.color"
              :style="{ width: `${cat.pct}%` }"
            />
          </div>
        </div>
      </div>

      <!-- Daily volume sparkline -->
      <div class="mt-5 border-t border-border pt-4">
        <p class="mb-2 text-xs font-medium text-ink-muted">Daily Volume</p>
        <div class="flex items-end gap-1" style="height: 40px;">
          <div
            v-for="(day, i) in days"
            :key="day.date"
            class="flex-1 rounded-sm transition-all duration-300"
            :class="isWeekend(day.date) ? 'bg-surface-3' : 'bg-accent/70'"
            :style="{ height: `${barHeight(day)}%` }"
            :title="`${dayLabel(day.date)}: ${totalEvents(day)} events`"
          />
        </div>
        <div class="mt-1 flex gap-1">
          <span
            v-for="day in days"
            :key="day.date + '-label'"
            class="flex-1 text-center font-mono text-[9px] text-ink-faint"
          >
            {{ dayLabel(day.date).charAt(0) }}
          </span>
        </div>
      </div>

      <!-- Legend -->
      <div class="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3">
        <div v-for="item in legend" :key="item.label" class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full" :class="item.color" />
          <span class="text-[10px] text-ink-faint">{{ item.label }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { DayActivity } from "@isaac/shared";

const props = defineProps<{ days: DayActivity[] }>();

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  return DAY_NAMES[dow === 0 ? 6 : dow - 1];
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

function totalEvents(day: DayActivity): number {
  return (
    day.ticketsClosed +
    day.ticketEvents +
    day.mrsMerged +
    day.mrsOpened +
    day.mrComments +
    day.confluencePublished +
    day.meetingCount +
    day.winsLogged
  );
}

const maxEvents = computed(() =>
  Math.max(1, ...props.days.map(totalEvents))
);

function barHeight(day: DayActivity): number {
  return Math.max(4, (totalEvents(day) / maxEvents.value) * 100);
}

const categories = computed(() => {
  const totals = {
    tickets: 0,
    mrs: 0,
    meetings: 0,
    docs: 0,
  };

  for (const day of props.days) {
    totals.tickets += day.ticketsClosed + day.ticketEvents;
    totals.mrs += day.mrsMerged + day.mrsOpened + day.mrComments;
    totals.meetings += day.meetingCount;
    totals.docs += day.confluencePublished;
  }

  const max = Math.max(1, totals.tickets, totals.mrs, totals.meetings, totals.docs);

  return [
    { label: "Tickets", value: totals.tickets, pct: (totals.tickets / max) * 100, color: "bg-activity-ticket" },
    { label: "Merge Requests", value: totals.mrs, pct: (totals.mrs / max) * 100, color: "bg-activity-mr" },
    { label: "Meetings", value: totals.meetings, pct: (totals.meetings / max) * 100, color: "bg-activity-meeting" },
    { label: "Documents", value: totals.docs, pct: (totals.docs / max) * 100, color: "bg-activity-doc" },
  ];
});

const legend = [
  { label: "Tickets", color: "bg-activity-ticket" },
  { label: "MRs", color: "bg-activity-mr" },
  { label: "Meetings", color: "bg-activity-meeting" },
  { label: "Docs", color: "bg-activity-doc" },
  { label: "Wins", color: "bg-activity-win" },
];
</script>
