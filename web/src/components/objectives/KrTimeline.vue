<template>
  <div>
    <div v-if="loading" class="flex justify-center py-6">
      <div class="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" />
    </div>

    <div v-else-if="topLevelEvents.length === 0" class="py-6 text-center text-sm text-ink-faint">
      No timeline events yet.
    </div>

    <div v-else class="relative">
      <!-- Vertical line -->
      <div class="absolute left-[19px] top-3 bottom-3 w-px bg-border" />

      <div class="space-y-0">
        <TimelineRow
          v-for="(event, i) in topLevelEvents"
          :key="event.id"
          :event="event"
          :children="childEventsOf(event)"
          :has-children="hasChildren(event)"
          :is-last="i === topLevelEvents.length - 1"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { TimelineEvent } from "@isaac/shared";
import TimelineRow from "./TimelineRow.vue";

const props = defineProps<{
  events: TimelineEvent[];
  loading: boolean;
}>();

// Top-level events: not MR events whose parentTicketKey matches a ticket in this timeline
const topLevelEvents = computed(() => {
  const ticketIds = new Set(
    props.events.filter((e) => e.entityType === "ticket").map((e) => e.entityId)
  );
  return props.events.filter((e) => {
    if (e.entityType === "merge_request" && e.parentTicketKey && ticketIds.has(e.parentTicketKey)) {
      return false;
    }
    return true;
  });
});

function hasChildren(event: TimelineEvent): boolean {
  if (event.entityType !== "ticket") return false;
  return props.events.some(
    (e) => e.entityType === "merge_request" && e.parentTicketKey === event.entityId
  );
}

function childEventsOf(event: TimelineEvent): TimelineEvent[] {
  if (event.entityType !== "ticket") return [];
  return props.events.filter(
    (e) => e.entityType === "merge_request" && e.parentTicketKey === event.entityId
  );
}
</script>
