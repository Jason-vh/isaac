<template>
  <div class="card overflow-hidden">
    <div class="grid grid-cols-5 divide-x divide-border">
      <div v-for="day in days" :key="day.date" class="min-w-0">
        <!-- Day header -->
        <div class="border-b border-border px-3 py-2.5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold uppercase text-ink-muted">
              {{ day.dayLabel }}
            </span>
            <span class="font-mono text-xs tabular-nums text-ink-faint">
              {{ formatShortDate(day.date) }}
            </span>
          </div>
          <div class="mt-1 flex items-center gap-2">
            <span class="font-mono text-lg font-medium tabular-nums text-ink">
              {{ day.totalHours }}h
            </span>
            <span class="text-xs text-ink-faint">/ 8h</span>
          </div>
          <!-- Progress bar -->
          <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              class="h-full rounded-full transition-all"
              :class="day.totalHours > 0 ? progressColor(day.totalHours) : ''"
              :style="{ width: `${Math.min(100, (day.totalHours / 8) * 100)}%` }"
            />
          </div>
        </div>
        <!-- Entries -->
        <div class="space-y-1 p-2" :class="{ 'min-h-[120px]': day.entries.length === 0 }">
          <WbsoEntryChip
            v-for="(entry, i) in day.entries"
            :key="i"
            :entry="entry"
            @toggle-category="(id) => $emit('toggleCategory', id)"
          />
          <p
            v-if="day.entries.length === 0"
            class="py-4 text-center text-xs text-ink-faint"
          >
            No activity
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WbsoDayData } from "@isaac/shared";
import WbsoEntryChip from "./WbsoEntryChip.vue";

defineProps<{ days: WbsoDayData[] }>();
defineEmits<{ toggleCategory: [meetingId: number] }>();

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function progressColor(hours: number): string {
  if (hours >= 7) return "bg-emerald-500";
  if (hours >= 4) return "bg-sky-500";
  return "bg-amber-400";
}
</script>
