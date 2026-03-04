<template>
  <div class="card overflow-hidden">
    <div class="flex items-center justify-between border-b border-border px-5 py-3">
      <h3 class="text-sm font-semibold text-ink">Activity</h3>
      <div class="flex gap-1">
        <button
          v-for="mode in viewModes"
          :key="mode.key"
          @click="viewMode = mode.key"
          class="rounded-md px-2 py-1 text-xs font-medium transition-colors"
          :class="
            viewMode === mode.key
              ? 'bg-surface-2 text-ink'
              : 'text-ink-faint hover:text-ink-muted'
          "
        >
          {{ mode.label }}
        </button>
      </div>
    </div>

    <div v-if="feed.length === 0" class="p-5 text-sm text-ink-faint">
      No activity this week.
    </div>

    <!-- Grouped by day -->
    <template v-else-if="viewMode === 'day'">
      <div v-for="group in feedByDay" :key="group.date">
        <button
          @click="toggleDay(group.date)"
          class="flex w-full items-center gap-2 border-b border-border bg-surface-1 px-5 py-2 text-left hover:bg-surface-2"
        >
          <ChevronRightIcon
            class="h-3.5 w-3.5 text-ink-faint transition-transform"
            :class="{ 'rotate-90': expandedDays.has(group.date) }"
          />
          <span class="text-xs font-semibold text-ink-muted">
            {{ formatDayHeader(group.date) }}
          </span>
          <span class="font-mono text-[11px] text-ink-faint">
            {{ group.items.length }}
          </span>
        </button>
        <ul v-if="expandedDays.has(group.date)">
          <FeedRow v-for="item in group.items" :key="item.id" :item="item" />
        </ul>
      </div>
    </template>

    <!-- Flat chronological -->
    <template v-else>
      <ul>
        <FeedRow v-for="item in feed" :key="item.id" :item="item" />
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive } from "vue";
import type { DayActivity, FeedItem } from "@isaac/shared";
import { ChevronRightIcon } from "@heroicons/vue/20/solid";
import FeedRow from "./FeedRow.vue";

const props = defineProps<{
  feed: FeedItem[];
  days: DayActivity[];
}>();

const viewMode = ref<"day" | "all">("day");
const viewModes = [
  { key: "day" as const, label: "By Day" },
  { key: "all" as const, label: "All" },
];

// Expand today + most recent day with activity by default
const expandedDays = reactive(new Set<string>());
const todayStr = new Date().toISOString().split("T")[0];
expandedDays.add(todayStr);

const feedByDay = computed(() => {
  const map = new Map<string, FeedItem[]>();
  for (const item of props.feed) {
    const d = new Date(item.occurredAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  // Sort days descending
  const groups = Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, items }));

  // Auto-expand the first day with activity
  if (groups.length > 0 && expandedDays.size <= 1) {
    expandedDays.add(groups[0].date);
  }

  return groups;
});

function toggleDay(date: string) {
  if (expandedDays.has(date)) {
    expandedDays.delete(date);
  } else {
    expandedDays.add(date);
  }
}

function formatDayHeader(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  const isToday = dateStr === todayStr;
  if (isToday) return "Today";

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === yesterday.toISOString().split("T")[0]) return "Yesterday";

  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}
</script>
