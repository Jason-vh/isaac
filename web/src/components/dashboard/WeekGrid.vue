<template>
  <div class="rounded-lg border border-gray-200 bg-white">
    <div class="grid grid-cols-7 divide-x divide-gray-100">
      <div
        v-for="day in days"
        :key="day.date"
        class="p-3"
        :class="{ 'bg-blue-50/50': isToday(day.date) }"
      >
        <div class="mb-2 text-center">
          <p class="text-xs font-medium text-gray-500">
            {{ dayLabel(day.date) }}
          </p>
          <p
            class="text-sm font-semibold"
            :class="isToday(day.date) ? 'text-blue-600' : 'text-gray-900'"
          >
            {{ dayNum(day.date) }}
          </p>
        </div>
        <div class="space-y-1 text-xs text-gray-600">
          <p v-if="day.ticketsClosed">
            {{ day.ticketsClosed }} ticket{{ day.ticketsClosed > 1 ? "s" : "" }} closed
          </p>
          <p v-if="day.mrsMerged">
            {{ day.mrsMerged }} MR{{ day.mrsMerged > 1 ? "s" : "" }} merged
          </p>
          <p v-if="day.mrsOpened">
            {{ day.mrsOpened }} MR{{ day.mrsOpened > 1 ? "s" : "" }} opened
          </p>
          <p v-if="day.mrComments">
            {{ day.mrComments }} MR comment{{ day.mrComments > 1 ? "s" : "" }}
          </p>
          <p v-if="day.confluencePublished">
            {{ day.confluencePublished }} doc{{ day.confluencePublished > 1 ? "s" : "" }}
          </p>
          <p v-if="day.meetingCount">
            {{ day.meetingCount }} meeting{{ day.meetingCount > 1 ? "s" : "" }}
            <span class="text-gray-400">({{ formatMin(day.meetingMinutes) }})</span>
          </p>
          <p v-if="day.winsLogged">
            {{ day.winsLogged }} win{{ day.winsLogged > 1 ? "s" : "" }}
          </p>
          <p
            v-if="isEmpty(day)"
            class="text-gray-300"
          >
            &mdash;
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DayActivity } from "@isaac/shared";

defineProps<{ days: DayActivity[] }>();

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

function formatMin(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h${m > 0 ? `${m}m` : ""}`;
  return `${m}m`;
}

function isEmpty(day: DayActivity): boolean {
  return (
    day.ticketsClosed === 0 &&
    day.ticketEvents === 0 &&
    day.mrsMerged === 0 &&
    day.mrsOpened === 0 &&
    day.mrComments === 0 &&
    day.confluencePublished === 0 &&
    day.meetingCount === 0 &&
    day.winsLogged === 0
  );
}
</script>
