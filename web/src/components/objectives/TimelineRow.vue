<template>
  <div>
    <div class="relative flex items-start gap-3 py-2.5 pl-1">
      <!-- Icon on the line -->
      <div
        class="relative z-10 flex h-[38px] w-[38px] shrink-0 items-center justify-center"
      >
        <div
          class="flex h-8 w-8 items-center justify-center rounded-lg"
          :class="iconBg(event.type)"
        >
          <component
            :is="iconForType(event.type)"
            class="h-4 w-4"
            :class="iconColor(event.type)"
          />
        </div>
      </div>

      <!-- Content -->
      <div class="min-w-0 flex-1 pt-0.5">
        <div class="flex items-baseline justify-between gap-2">
          <p class="text-xs font-medium text-ink-muted">{{ event.title }}</p>
          <time class="shrink-0 font-mono text-[11px] tabular-nums text-ink-faint whitespace-nowrap">
            {{ formatDate(event.occurredAt) }}
          </time>
        </div>
        <p v-if="event.subtitle" class="mt-0.5 text-sm text-ink">
          <a
            v-if="event.externalUrl"
            :href="event.externalUrl"
            target="_blank"
            rel="noopener"
            class="hover:text-accent hover:underline"
          >
            {{ event.subtitle }}
          </a>
          <span v-else>{{ event.subtitle }}</span>
        </p>
      </div>

      <!-- Expand chevron for tickets with children -->
      <button
        v-if="hasChildren"
        @click="expanded = !expanded"
        class="mt-1.5 shrink-0 text-ink-faint hover:text-ink transition-colors"
      >
        <ChevronRightIcon
          class="h-3.5 w-3.5 transition-transform"
          :class="{ 'rotate-90': expanded }"
        />
      </button>
    </div>

    <!-- Child MR events -->
    <div v-if="hasChildren && expanded" class="ml-[19px] border-l border-accent/20 pl-6 pb-1">
      <div
        v-for="child in children"
        :key="child.id"
        class="flex items-start gap-3 py-1.5"
      >
        <div
          class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
          :class="iconBg(child.type)"
        >
          <component
            :is="iconForType(child.type)"
            class="h-3 w-3"
            :class="iconColor(child.type)"
          />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline justify-between gap-2">
            <p class="text-[11px] font-medium text-ink-muted">{{ child.title }}</p>
            <time class="shrink-0 font-mono text-[10px] tabular-nums text-ink-faint whitespace-nowrap">
              {{ formatDate(child.occurredAt) }}
            </time>
          </div>
          <p v-if="child.subtitle" class="text-xs text-ink">
            <a
              v-if="child.externalUrl"
              :href="child.externalUrl"
              target="_blank"
              rel="noopener"
              class="hover:text-accent hover:underline"
            >
              {{ child.subtitle }}
            </a>
            <span v-else>{{ child.subtitle }}</span>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { TimelineEvent, TimelineEventType } from "@isaac/shared";
import { ChevronRightIcon } from "@heroicons/vue/20/solid";
import {
  TicketIcon,
  CodeBracketIcon,
  ChatBubbleLeftIcon,
  DocumentTextIcon,
  TrophyIcon,
  ArrowRightCircleIcon,
  CheckCircleIcon,
  PlusCircleIcon,
} from "@heroicons/vue/20/solid";

defineProps<{
  event: TimelineEvent;
  children: TimelineEvent[];
  hasChildren: boolean;
  isLast: boolean;
}>();

const expanded = ref(false);

function iconForType(type: TimelineEventType) {
  switch (type) {
    case "ticket_created": return PlusCircleIcon;
    case "ticket_closed": return CheckCircleIcon;
    case "ticket_status_changed": return ArrowRightCircleIcon;
    case "mr_opened": return CodeBracketIcon;
    case "mr_merged": return CodeBracketIcon;
    case "mr_commented": return ChatBubbleLeftIcon;
    case "confluence_published": return DocumentTextIcon;
    case "confluence_updated": return DocumentTextIcon;
    case "win": return TrophyIcon;
  }
}

function iconBg(type: TimelineEventType): string {
  switch (type) {
    case "ticket_created": return "bg-blue-50";
    case "ticket_closed": return "bg-emerald-50";
    case "ticket_status_changed": return "bg-blue-50";
    case "mr_opened": return "bg-violet-50";
    case "mr_merged": return "bg-violet-50";
    case "mr_commented": return "bg-gray-100";
    case "confluence_published": return "bg-orange-50";
    case "confluence_updated": return "bg-orange-50";
    case "win": return "bg-amber-50";
  }
}

function iconColor(type: TimelineEventType): string {
  switch (type) {
    case "ticket_created": return "text-activity-status";
    case "ticket_closed": return "text-activity-ticket";
    case "ticket_status_changed": return "text-activity-status";
    case "mr_opened":
    case "mr_merged": return "text-activity-mr";
    case "mr_commented": return "text-activity-comment";
    case "confluence_published":
    case "confluence_updated": return "text-activity-doc";
    case "win": return "text-activity-win";
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
</script>
