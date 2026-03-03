<template>
  <div class="rounded-lg border border-gray-200 bg-white">
    <h3 class="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">
      Activity
    </h3>
    <div v-if="feed.length === 0" class="p-4 text-sm text-gray-400">
      No activity this week.
    </div>
    <ul v-else class="divide-y divide-gray-50">
      <li
        v-for="item in feed"
        :key="item.id"
        class="flex items-start gap-3 px-4 py-3"
      >
        <component
          :is="iconForType(item.type)"
          class="mt-0.5 h-4 w-4 flex-shrink-0"
          :class="colorForType(item.type)"
        />
        <div class="min-w-0 flex-1">
          <p class="text-sm text-gray-900">
            <a
              v-if="item.externalUrl"
              :href="item.externalUrl"
              target="_blank"
              rel="noopener"
              class="hover:underline"
            >
              {{ item.title }}
            </a>
            <span v-else>{{ item.title }}</span>
          </p>
          <p v-if="item.subtitle" class="text-xs text-gray-500">
            {{ item.subtitle }}
          </p>
        </div>
        <time class="flex-shrink-0 text-xs text-gray-400">
          {{ formatTime(item.occurredAt) }}
        </time>
      </li>
    </ul>
  </div>
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

defineProps<{ feed: FeedItem[] }>();

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

function colorForType(type: FeedItemType): string {
  switch (type) {
    case "ticket_closed":
      return "text-green-500";
    case "ticket_status_changed":
      return "text-blue-400";
    case "mr_merged":
      return "text-purple-500";
    case "mr_opened":
      return "text-blue-500";
    case "mr_commented":
      return "text-gray-400";
    case "confluence_published":
      return "text-orange-400";
    case "meeting":
      return "text-sky-400";
    case "win":
      return "text-yellow-500";
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isThisYear = d.getFullYear() === now.getFullYear();

  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(isThisYear ? {} : { year: "numeric" }),
  });

  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${date} ${time}`;
}
</script>
