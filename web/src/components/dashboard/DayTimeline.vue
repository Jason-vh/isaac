<template>
  <div class="flex flex-col gap-1.5">
    <!-- Meeting blocks -->
    <div
      v-for="meeting in meetingItems"
      :key="meeting.id"
      class="flex items-center gap-1.5 rounded-md border border-activity-meeting/20 bg-activity-meeting/8 px-2 py-1"
      :title="meeting.title"
    >
      <span class="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-activity-meeting" />
      <span class="min-w-0 truncate text-[11px] font-medium leading-tight text-activity-meeting">
        {{ meeting.title }}
      </span>
      <span class="ml-auto flex-shrink-0 font-mono text-[10px] text-activity-meeting/60">
        {{ formatDuration(meeting) }}
      </span>
    </div>

    <!-- Grouped activity chips -->
    <div
      v-for="group in activityGroups"
      :key="group.label"
      class="flex items-center gap-1.5 px-1"
    >
      <div class="flex gap-px">
        <span
          v-for="n in Math.min(group.count, 5)"
          :key="n"
          class="h-[6px] w-[6px] rounded-full"
          :class="group.color"
        />
        <span
          v-if="group.count > 5"
          class="ml-0.5 font-mono text-[9px] leading-none text-ink-faint"
        >
          +{{ group.count - 5 }}
        </span>
      </div>
      <span class="text-[11px] leading-tight text-ink-muted">
        {{ group.label }}
      </span>
    </div>

    <!-- Empty state -->
    <div
      v-if="meetingItems.length === 0 && activityGroups.length === 0"
      class="py-2 text-center text-[10px] text-ink-faint"
    >
      &mdash;
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { FeedItem } from "@isaac/shared";

const props = defineProps<{
  items: FeedItem[];
  date: string;
  showLabels?: boolean;
}>();

const meetingItems = computed(() =>
  props.items
    .filter((i) => i.type === "meeting" && i.endsAt)
    .sort(
      (a, b) =>
        new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
    )
);

interface ActivityGroup {
  label: string;
  count: number;
  color: string;
  order: number;
}

const activityGroups = computed(() => {
  const counts = {
    ticket_closed: 0,
    ticket_status_changed: 0,
    mr_merged: 0,
    mr_opened: 0,
    mr_commented: 0,
    confluence_published: 0,
    win: 0,
  };

  for (const item of props.items) {
    if (item.type === "meeting") continue;
    if (item.type in counts) {
      counts[item.type as keyof typeof counts]++;
    }
  }

  const groups: ActivityGroup[] = [];

  if (counts.ticket_closed > 0) {
    groups.push({
      label: counts.ticket_closed === 1 ? "ticket closed" : "tickets closed",
      count: counts.ticket_closed,
      color: "bg-activity-ticket",
      order: 0,
    });
  }
  if (counts.ticket_status_changed > 0) {
    groups.push({
      label: counts.ticket_status_changed === 1 ? "status change" : "status changes",
      count: counts.ticket_status_changed,
      color: "bg-activity-status",
      order: 1,
    });
  }
  if (counts.mr_merged > 0) {
    groups.push({
      label: counts.mr_merged === 1 ? "MR merged" : "MRs merged",
      count: counts.mr_merged,
      color: "bg-activity-mr",
      order: 2,
    });
  }
  if (counts.mr_opened > 0) {
    groups.push({
      label: counts.mr_opened === 1 ? "MR opened" : "MRs opened",
      count: counts.mr_opened,
      color: "bg-activity-mr/60",
      order: 3,
    });
  }
  if (counts.mr_commented > 0) {
    groups.push({
      label: counts.mr_commented === 1 ? "MR comment" : "MR comments",
      count: counts.mr_commented,
      color: "bg-activity-comment",
      order: 4,
    });
  }
  if (counts.confluence_published > 0) {
    groups.push({
      label: counts.confluence_published === 1 ? "doc published" : "docs published",
      count: counts.confluence_published,
      color: "bg-activity-doc",
      order: 5,
    });
  }
  if (counts.win > 0) {
    groups.push({
      label: counts.win === 1 ? "win" : "wins",
      count: counts.win,
      color: "bg-activity-win",
      order: 6,
    });
  }

  return groups.sort((a, b) => a.order - b.order);
});

function formatDuration(item: FeedItem): string {
  if (!item.endsAt) return "";
  const start = new Date(item.occurredAt);
  const end = new Date(item.endsAt);
  const mins = Math.round((end.getTime() - start.getTime()) / 60000);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h${m}m` : `${h}h`;
  }
  return `${mins}m`;
}
</script>
