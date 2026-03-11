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
        <!-- Entries grouped by epic -->
        <div class="p-2" :class="{ 'min-h-[120px]': day.entries.length === 0 }">
          <div
            v-for="group in groupByEpic(day.entries)"
            :key="group.key"
            class="mb-2 last:mb-0"
          >
            <!-- Epic group header -->
            <a
              v-if="group.key !== '_none'"
              :href="`${jiraBrowseUrl}/${group.key}`"
              target="_blank"
              class="mb-1 block truncate px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint hover:text-ink-muted"
            >
              {{ group.label }}
            </a>
            <p
              v-else
              class="mb-1 truncate px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint"
            >
              {{ group.label }}
            </p>
            <!-- Entries in group -->
            <div class="space-y-1">
              <WbsoEntryChip
                v-for="(entry, i) in group.entries"
                :key="i"
                :entry="entry"
                :jira-browse-url="props.jiraBrowseUrl"
                @toggle-category="(id) => $emit('toggleCategory', id)"
              />
            </div>
          </div>
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
import type { WbsoDayData, WbsoEntry } from "@isaac/shared";
import WbsoEntryChip from "./WbsoEntryChip.vue";

const props = defineProps<{ days: WbsoDayData[]; jiraBrowseUrl: string }>();
defineEmits<{ toggleCategory: [meetingId: number] }>();

interface EpicGroup {
  key: string;
  label: string;
  entries: WbsoEntry[];
}

function groupByEpic(entries: WbsoEntry[]): EpicGroup[] {
  const map = new Map<string, EpicGroup>();

  for (const entry of entries) {
    const key = entry.epicKey ?? "_none";
    const label = entry.epicTitle ?? "Other";
    let group = map.get(key);
    if (!group) {
      group = { key, label, entries: [] };
      map.set(key, group);
    }
    group.entries.push(entry);
  }

  // Sort: named epics first (by total hours desc), "Other" last
  return [...map.values()].sort((a, b) => {
    if (a.key === "_none") return 1;
    if (b.key === "_none") return -1;
    const aHours = a.entries.reduce((s, e) => s + e.hours, 0);
    const bHours = b.entries.reduce((s, e) => s + e.hours, 0);
    return bHours - aHours;
  });
}

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
