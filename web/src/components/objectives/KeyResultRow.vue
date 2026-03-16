<template>
  <div class="border-t border-border py-3">
    <div class="flex items-start justify-between gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <button
            @click="expanded = !expanded"
            class="shrink-0 text-ink-faint hover:text-ink transition-colors"
          >
            <ChevronRightIcon
              class="h-4 w-4 transition-transform"
              :class="{ 'rotate-90': expanded }"
            />
          </button>
          <p class="text-sm text-ink">{{ kr.title }}</p>
        </div>

        <!-- Evidence summary chips -->
        <div v-if="summary && summary.total > 0" class="ml-6 mt-1.5 flex items-center gap-2">
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
    </div>

    <!-- Expanded evidence + picker -->
    <div v-if="expanded" class="mt-3 ml-6">
      <EvidencePanel
        :evidence="evidence ?? []"
        :can-remove="!readOnly"
        @remove="(linkId) => $emit('removeEvidence', linkId)"
      />
      <div v-if="!readOnly" class="mt-3">
        <EvidencePicker
          :search-fn="searchFn"
          @select="(epic) => $emit('addEvidence', 'ticket', epic.key)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import type {
  KeyResultWithSummary,
  KeyResultWithEvidence,
  EvidenceItem,
} from "@isaac/shared";
import { ChevronRightIcon } from "@heroicons/vue/20/solid";
import EvidencePanel from "./EvidencePanel.vue";
import EvidencePicker from "./EvidencePicker.vue";

const props = defineProps<{
  kr: KeyResultWithSummary | KeyResultWithEvidence;
  evidence?: EvidenceItem[];
  searchFn: (q: string) => Promise<{ key: string; title: string }[]>;
  readOnly?: boolean;
}>();

defineEmits<{
  addEvidence: [targetType: string, targetId: string];
  removeEvidence: [linkId: number];
}>();

const expanded = ref(false);

const summary = computed(() => {
  if ("evidenceSummary" in props.kr) return props.kr.evidenceSummary;
  return null;
});
</script>
