<template>
  <div class="card overflow-hidden">
    <h3 class="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
      Projects This Week
    </h3>
    <div v-if="projects.length === 0" class="p-4 text-sm text-ink-faint">
      No ticket activity this week.
    </div>
    <ul v-else class="p-2">
      <li
        v-for="project in projects"
        :key="project.key"
        class="flex items-center gap-3 rounded-lg px-3 py-2"
      >
        <div class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-surface-2">
          <TicketIcon class="h-3.5 w-3.5 text-ink-faint" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-ink">
            {{ project.key }}
          </p>
          <p class="truncate text-xs text-ink-faint">
            {{ project.title }}
          </p>
        </div>
        <div class="flex items-center gap-1.5">
          <span
            v-for="type in project.types"
            :key="type"
            class="h-2 w-2 rounded-full"
            :class="typeColor(type)"
            :title="typeLabel(type)"
          />
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { FeedItem, FeedItemType } from "@isaac/shared";
import { TicketIcon } from "@heroicons/vue/20/solid";

const props = defineProps<{ feed: FeedItem[] }>();

interface ProjectInfo {
  key: string;
  title: string;
  types: Set<FeedItemType>;
  count: number;
}

const TICKET_KEY_RE = /^([A-Z]+-\d+)\s+(.+)/;
const MR_TICKET_RE = /\[([A-Z]+-\d+)\]/;

const projects = computed(() => {
  const map = new Map<string, ProjectInfo>();

  for (const item of props.feed) {
    let key: string | null = null;
    let title = "";

    // Extract ticket key from feed item titles
    if (
      item.type === "ticket_closed" ||
      item.type === "ticket_status_changed"
    ) {
      const match = item.title.match(TICKET_KEY_RE);
      if (match) {
        key = match[1];
        title = match[2];
      }
    } else if (
      item.type === "mr_merged" ||
      item.type === "mr_opened" ||
      item.type === "mr_commented"
    ) {
      // Try to extract ticket key from MR title "[DESK-1234]"
      const match = item.title.match(MR_TICKET_RE);
      if (match) {
        key = match[1];
        title = item.title.replace(/^!\d+\s+/, "");
      }
    }

    if (key) {
      if (!map.has(key)) {
        map.set(key, { key, title, types: new Set(), count: 0 });
      }
      const p = map.get(key)!;
      p.types.add(item.type);
      p.count++;
      if (!p.title && title) p.title = title;
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
});

function typeColor(type: FeedItemType): string {
  switch (type) {
    case "ticket_closed":
      return "bg-activity-ticket";
    case "ticket_status_changed":
      return "bg-activity-status";
    case "mr_merged":
    case "mr_opened":
      return "bg-activity-mr";
    case "mr_commented":
      return "bg-activity-comment";
    default:
      return "bg-ink-faint";
  }
}

function typeLabel(type: FeedItemType): string {
  switch (type) {
    case "ticket_closed":
      return "Closed";
    case "ticket_status_changed":
      return "Status changed";
    case "mr_merged":
      return "MR merged";
    case "mr_opened":
      return "MR opened";
    case "mr_commented":
      return "MR comment";
    default:
      return type;
  }
}
</script>
