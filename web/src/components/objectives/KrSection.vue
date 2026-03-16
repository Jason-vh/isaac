<template>
  <div class="card overflow-hidden">
    <!-- Header -->
    <div class="flex items-start justify-between gap-4 p-5">
      <div class="flex-1 min-w-0">
        <h3 class="text-sm font-medium text-ink">{{ kr.title }}</h3>

        <!-- Evidence summary chips -->
        <div v-if="summary && summary.total > 0" class="mt-1.5 flex items-center gap-2">
          <span v-if="summary.epics" class="inline-flex items-center gap-1 text-xs text-ink-faint">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-activity-ticket" />
            {{ summary.epics }} epic{{ summary.epics !== 1 ? 's' : '' }}
          </span>
          <span v-if="summary.tickets" class="inline-flex items-center gap-1 text-xs text-ink-faint">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-activity-ticket" />
            {{ summary.tickets }} ticket{{ summary.tickets !== 1 ? 's' : '' }}
          </span>
          <span v-if="summary.mergeRequests" class="inline-flex items-center gap-1 text-xs text-ink-faint">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-activity-mr" />
            {{ summary.mergeRequests }} MR{{ summary.mergeRequests !== 1 ? 's' : '' }}
          </span>
          <span v-if="summary.documents" class="inline-flex items-center gap-1 text-xs text-ink-faint">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-activity-doc" />
            {{ summary.documents }} doc{{ summary.documents !== 1 ? 's' : '' }}
          </span>
        </div>
      </div>

      <button
        v-if="!readOnly"
        @click="$emit('edit')"
        class="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        Edit
      </button>
    </div>

    <!-- Widget slot -->
    <div v-if="hasWidget" class="border-t border-border">
      <KrWidget :kr-slug="kr.slug" />
    </div>

    <!-- Timeline -->
    <div class="border-t border-border px-5 py-4">
      <KrTimeline :events="timeline" :loading="timelineLoading" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import type { KeyResultWithEvidence, TimelineEvent } from "@isaac/shared";
import KrWidget from "./KrWidget.vue";
import KrTimeline from "./KrTimeline.vue";

const WIDGET_KRS = new Set(["pipeline-duration"]);

const props = defineProps<{
  kr: KeyResultWithEvidence;
  readOnly?: boolean;
  fetchTimeline: (krSlug: string) => Promise<TimelineEvent[]>;
}>();

defineEmits<{
  edit: [];
}>();

const timeline = ref<TimelineEvent[]>([]);
const timelineLoading = ref(true);

const summary = computed(() => {
  const items = props.kr.evidence;
  const epics = items.filter(
    (e) => e.type === "ticket" && e.source === "direct" &&
      items.some((c) => c.epicKey === e.id && c.source === "via_epic")
  ).length;
  const tickets = items.filter(
    (e) => e.type === "ticket" && (e.source === "via_epic" ||
      (e.source === "direct" && !items.some((c) => c.epicKey === e.id && c.source === "via_epic")))
  ).length;
  const mergeRequests = items.filter((e) => e.type === "merge_request").length;
  const documents = items.filter((e) => e.type === "confluence_document").length;
  return { epics, tickets, mergeRequests, documents, total: epics + tickets + mergeRequests + documents };
});

const hasWidget = computed(() => WIDGET_KRS.has(props.kr.slug));

async function loadTimeline() {
  timelineLoading.value = true;
  timeline.value = await props.fetchTimeline(props.kr.slug);
  timelineLoading.value = false;
}

onMounted(loadTimeline);

watch(() => props.kr.slug, loadTimeline);

// Refresh timeline when evidence changes (add/remove)
watch(() => props.kr.evidence.length, loadTimeline);
</script>
