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
          <!-- Stacked progress bar by category -->
          <div class="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              v-for="seg in categorySegments(day)"
              :key="seg.category"
              class="h-full transition-all"
              :class="seg.colorClass"
              :style="{ width: `${seg.pct}%` }"
            />
          </div>
        </div>
        <!-- Entries grouped by epic -->
        <div class="p-2" :class="{ 'min-h-[120px]': day.entries.length === 0 }">
          <div
            v-for="group in groupByEpic(day.entries)"
            :key="group.key"
            class="mb-2 last:mb-0"
            :class="{ 'mt-3 border-t border-dashed border-border pt-2': group.key === '_none' && groupByEpic(day.entries).length > 1 }"
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
              class="mb-1 truncate px-1 text-[11px] font-semibold uppercase tracking-wider text-amber-500"
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
                @click="$emit('entryClick', entry, day.dayLabel, day.date)"
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

const props = defineProps<{ days: WbsoDayData[]; jiraBrowseUrl: string; epicDates: Record<string, string> }>();
defineEmits<{
  entryClick: [entry: WbsoEntry, dayLabel: string, date: string];
}>();

interface EpicGroup {
  key: string;
  label: string;
  entries: WbsoEntry[];
}

function groupByEpic(entries: WbsoEntry[]): EpicGroup[] {
  const map = new Map<string, EpicGroup>();

  for (const entry of entries) {
    const key = entry.epicKey ?? "_none";
    const label = entry.epicTitle ?? "No epic";
    let group = map.get(key);
    if (!group) {
      group = { key, label, entries: [] };
      map.set(key, group);
    }
    group.entries.push(entry);
  }

  // Sort: named epics by Jira creation date (newest first), "no epic" last
  return [...map.values()].sort((a, b) => {
    if (a.key === "_none") return 1;
    if (b.key === "_none") return -1;
    const aDate = props.epicDates[a.key] ?? "";
    const bDate = props.epicDates[b.key] ?? "";
    return bDate.localeCompare(aDate);
  });
}

const CATEGORY_COLORS: Record<string, string> = {
  coding: "bg-emerald-500",
  code_review: "bg-violet-500",
  dev_meeting: "bg-fuchsia-500",
  dev_misc: "bg-fuchsia-500",
  non_dev: "bg-amber-500",
  leave: "bg-gray-400",
};

// Order for consistent stacking
const CATEGORY_ORDER = ["coding", "code_review", "dev_meeting", "dev_misc", "non_dev", "leave"];

function categorySegments(day: WbsoDayData): { category: string; pct: number; colorClass: string }[] {
  const hoursByCategory = new Map<string, number>();
  for (const e of day.entries) {
    hoursByCategory.set(e.category, (hoursByCategory.get(e.category) ?? 0) + e.hours);
  }
  return CATEGORY_ORDER
    .filter((cat) => (hoursByCategory.get(cat) ?? 0) > 0)
    .map((cat) => ({
      category: cat,
      pct: ((hoursByCategory.get(cat)!) / 8) * 100,
      colorClass: CATEGORY_COLORS[cat],
    }));
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
</script>
