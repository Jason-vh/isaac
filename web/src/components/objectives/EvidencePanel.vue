<template>
  <div class="space-y-3">
    <!-- Epics -->
    <div v-if="epics.length">
      <p class="mb-1.5 text-xs font-medium uppercase tracking-wider text-ink-faint">
        Epics
      </p>
      <div class="space-y-1.5">
        <div
          v-for="item in epics"
          :key="item.id"
          class="rounded-lg bg-surface-2 px-3 py-2"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs text-activity-ticket">{{ item.id }}</span>
              <span class="text-sm text-ink">{{ item.subtitle }}</span>
            </div>
            <button
              v-if="canRemove"
              @click="$emit('remove', item.linkId)"
              class="text-ink-faint hover:text-red-500 transition-colors"
            >
              <XMarkIcon class="h-4 w-4" />
            </button>
          </div>
          <!-- Auto-resolved children -->
          <div v-if="childrenOf(item.id).length" class="mt-2 ml-4 space-y-1 border-l-2 border-border pl-3">
            <div
              v-for="child in childrenOf(item.id)"
              :key="`${child.type}:${child.id}`"
              class="flex items-center gap-2 text-xs text-ink-muted"
            >
              <span class="shrink-0">
                <TicketIcon v-if="child.type === 'ticket'" class="h-3.5 w-3.5 text-activity-ticket" />
                <CodeBracketIcon v-else-if="child.type === 'merge_request'" class="h-3.5 w-3.5 text-activity-mr" />
                <DocumentTextIcon v-else class="h-3.5 w-3.5 text-activity-doc" />
              </span>
              <span v-if="child.type === 'ticket'" class="font-mono">{{ child.id }}</span>
              <span class="truncate">{{ child.type === 'ticket' ? child.subtitle : child.title }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Direct tickets -->
    <div v-if="directTickets.length">
      <p class="mb-1.5 text-xs font-medium uppercase tracking-wider text-ink-faint">
        Tickets
      </p>
      <div class="space-y-1">
        <div
          v-for="item in directTickets"
          :key="item.id"
          class="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2"
        >
          <div class="flex items-center gap-2">
            <TicketIcon class="h-3.5 w-3.5 text-activity-ticket" />
            <span class="font-mono text-xs">{{ item.id }}</span>
            <span class="text-sm text-ink-muted">{{ item.subtitle }}</span>
          </div>
          <button
            v-if="canRemove"
            @click="$emit('remove', item.linkId)"
            class="text-ink-faint hover:text-red-500 transition-colors"
          >
            <XMarkIcon class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- Direct MRs -->
    <div v-if="directMRs.length">
      <p class="mb-1.5 text-xs font-medium uppercase tracking-wider text-ink-faint">
        Merge Requests
      </p>
      <div class="space-y-1">
        <div
          v-for="item in directMRs"
          :key="item.id"
          class="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2"
        >
          <div class="flex items-center gap-2">
            <CodeBracketIcon class="h-3.5 w-3.5 text-activity-mr" />
            <span class="text-sm text-ink">{{ item.title }}</span>
          </div>
          <button
            v-if="canRemove"
            @click="$emit('remove', item.linkId)"
            class="text-ink-faint hover:text-red-500 transition-colors"
          >
            <XMarkIcon class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- Direct docs -->
    <div v-if="directDocs.length">
      <p class="mb-1.5 text-xs font-medium uppercase tracking-wider text-ink-faint">
        Documents
      </p>
      <div class="space-y-1">
        <div
          v-for="item in directDocs"
          :key="item.id"
          class="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2"
        >
          <div class="flex items-center gap-2">
            <DocumentTextIcon class="h-3.5 w-3.5 text-activity-doc" />
            <span class="text-sm text-ink">{{ item.title }}</span>
          </div>
          <button
            v-if="canRemove"
            @click="$emit('remove', item.linkId)"
            class="text-ink-faint hover:text-red-500 transition-colors"
          >
            <XMarkIcon class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>

    <p
      v-if="!evidence.length"
      class="py-4 text-center text-sm text-ink-faint"
    >
      No evidence linked yet.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { EvidenceItem } from "@isaac/shared";
import {
  TicketIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  XMarkIcon,
} from "@heroicons/vue/20/solid";

const props = defineProps<{
  evidence: EvidenceItem[];
  canRemove?: boolean;
}>();

defineEmits<{
  remove: [linkId: number];
}>();

const epics = computed(() =>
  props.evidence.filter(
    (e) =>
      e.type === "ticket" &&
      e.source === "direct" &&
      props.evidence.some((c) => c.epicKey === e.id && c.source === "via_epic")
  )
);

function childrenOf(epicKey: string) {
  return props.evidence.filter(
    (e) => e.epicKey === epicKey && e.source === "via_epic"
  );
}

const directTickets = computed(() =>
  props.evidence.filter(
    (e) =>
      e.type === "ticket" &&
      e.source === "direct" &&
      !epics.value.some((ep) => ep.id === e.id)
  )
);

const directMRs = computed(() =>
  props.evidence.filter((e) => e.type === "merge_request" && e.source === "direct")
);

const directDocs = computed(() =>
  props.evidence.filter(
    (e) => e.type === "confluence_document" && e.source === "direct"
  )
);
</script>
