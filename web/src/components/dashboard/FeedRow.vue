<template>
  <li class="flex items-start gap-3 border-b border-border/50 px-5 py-2.5 last:border-b-0">
    <div
      class="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md"
      :class="iconBg(item.type)"
    >
      <component
        :is="iconForType(item.type)"
        class="h-3.5 w-3.5"
        :class="iconColor(item.type)"
      />
    </div>
    <div class="min-w-0 flex-1">
      <p class="text-sm text-ink">
        <a
          v-if="item.externalUrl"
          :href="item.externalUrl"
          target="_blank"
          rel="noopener"
          class="hover:text-accent hover:underline"
        >
          {{ item.title }}
        </a>
        <span v-else>{{ item.title }}</span>
      </p>
      <p v-if="item.subtitle" class="mt-0.5 text-xs text-ink-faint">
        {{ item.subtitle }}
      </p>
    </div>
    <time class="mt-0.5 flex-shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
      {{ formatTime(item.occurredAt) }}
    </time>
  </li>
</template>

<script setup lang="ts">
import type { FeedItem, FeedItemType } from "@isaac/shared";
import {
  TicketIcon,
  CodeBracketIcon,
  ChatBubbleLeftIcon,
  DocumentTextIcon,
  CalendarIcon,
  TrophyIcon,
  ArrowRightCircleIcon,
} from "@heroicons/vue/20/solid";

defineProps<{ item: FeedItem }>();

function iconForType(type: FeedItemType) {
  switch (type) {
    case "ticket_closed":
      return TicketIcon;
    case "ticket_status_changed":
      return ArrowRightCircleIcon;
    case "mr_merged":
    case "mr_opened":
      return CodeBracketIcon;
    case "mr_commented":
      return ChatBubbleLeftIcon;
    case "confluence_published":
      return DocumentTextIcon;
    case "meeting":
      return CalendarIcon;
    case "win":
      return TrophyIcon;
  }
}

function iconBg(type: FeedItemType): string {
  switch (type) {
    case "ticket_closed":
      return "bg-emerald-50";
    case "ticket_status_changed":
      return "bg-blue-50";
    case "mr_merged":
    case "mr_opened":
      return "bg-violet-50";
    case "mr_commented":
      return "bg-gray-100";
    case "confluence_published":
      return "bg-orange-50";
    case "meeting":
      return "bg-sky-50";
    case "win":
      return "bg-amber-50";
  }
}

function iconColor(type: FeedItemType): string {
  switch (type) {
    case "ticket_closed":
      return "text-activity-ticket";
    case "ticket_status_changed":
      return "text-activity-status";
    case "mr_merged":
    case "mr_opened":
      return "text-activity-mr";
    case "mr_commented":
      return "text-activity-comment";
    case "confluence_published":
      return "text-activity-doc";
    case "meeting":
      return "text-activity-meeting";
    case "win":
      return "text-activity-win";
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
</script>
