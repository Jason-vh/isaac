<template>
  <div class="card overflow-hidden">
    <div class="grid grid-cols-7 divide-x divide-border">
      <div
        v-for="day in days"
        :key="day.date"
        class="flex flex-col"
        :class="{
          'bg-accent-light/40': isToday(day.date),
          'opacity-40': isWeekend(day.date) && !hasActivity(day),
        }"
      >
        <!-- Day header -->
        <div class="border-b border-border px-2 py-2.5 text-center">
          <p class="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            {{ dayLabel(day.date) }}
          </p>
          <p
            class="mt-0.5 text-lg font-semibold tabular-nums"
            :class="isToday(day.date) ? 'text-accent' : 'text-ink'"
          >
            {{ dayNum(day.date) }}
          </p>
          <!-- Mini activity bar -->
          <div
            v-if="hasActivity(day)"
            class="mx-auto mt-1.5 flex h-1 max-w-[48px] gap-px overflow-hidden rounded-full"
          >
            <div
              v-if="day.ticketsClosed + day.ticketEvents > 0"
              class="bg-activity-ticket"
              :style="{ flex: day.ticketsClosed + day.ticketEvents }"
            />
            <div
              v-if="day.mrsMerged + day.mrsOpened + day.mrComments > 0"
              class="bg-activity-mr"
              :style="{ flex: day.mrsMerged + day.mrsOpened + day.mrComments }"
            />
            <div
              v-if="day.meetingCount > 0"
              class="bg-activity-meeting"
              :style="{ flex: day.meetingCount }"
            />
            <div
              v-if="day.confluencePublished > 0"
              class="bg-activity-doc"
              :style="{ flex: day.confluencePublished }"
            />
          </div>
        </div>

        <!-- Compact activity summary -->
        <div class="flex-1 p-2">
          <DayTimeline
            :items="feedByDay[day.date] || []"
            :date="day.date"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { DayActivity, FeedItem } from "@isaac/shared";
import DayTimeline from "./DayTimeline.vue";

const props = defineProps<{
  days: DayActivity[];
  feed: FeedItem[];
}>();

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  return DAY_NAMES[dow === 0 ? 6 : dow - 1];
}

function dayNum(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").getDate().toString();
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split("T")[0];
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

function hasActivity(day: DayActivity): boolean {
  return (
    day.ticketsClosed +
      day.ticketEvents +
      day.mrsMerged +
      day.mrsOpened +
      day.mrComments +
      day.confluencePublished +
      day.meetingCount +
      day.winsLogged >
    0
  );
}

const feedByDay = computed(() => {
  const map: Record<string, FeedItem[]> = {};
  for (const item of props.feed) {
    const d = new Date(item.occurredAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!map[key]) map[key] = [];
    map[key].push(item);
  }
  return map;
});
</script>
