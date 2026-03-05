<template>
  <div class="card overflow-hidden">
    <button
      @click="$emit('toggle')"
      class="flex w-full items-start justify-between gap-4 p-5 text-left transition-colors hover:bg-surface-1"
    >
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-3">
          <ChevronRightIcon
            class="h-5 w-5 shrink-0 text-ink-faint transition-transform"
            :class="{ 'rotate-90': expanded }"
          />
          <h3 class="text-base font-medium text-ink">{{ objective.title }}</h3>
          <StatusBadge :status="objective.status" />
        </div>
        <p v-if="objective.description" class="mt-1 ml-8 text-sm text-ink-muted line-clamp-2">
          {{ objective.description }}
        </p>
        <div class="mt-2 ml-8 flex items-center gap-4 text-xs text-ink-faint">
          <span>
            {{ objective.keyResults.length }} key result{{ objective.keyResults.length !== 1 ? 's' : '' }}
          </span>
          <span v-if="completedCount">
            {{ completedCount }}/{{ objective.keyResults.length }} completed
          </span>
          <span v-if="totalEvidence">
            {{ totalEvidence }} evidence item{{ totalEvidence !== 1 ? 's' : '' }}
          </span>
        </div>
      </div>
    </button>

    <!-- Expanded: KR list -->
    <div v-if="expanded" class="border-t border-border px-5 pb-4">
      <KeyResultRow
        v-for="kr in keyResultsData"
        :key="kr.id"
        :kr="kr"
        :evidence="getEvidence(kr.id)"
        :search-fn="searchFn"
        :read-only="readOnly"
        @update-status="(status) => $emit('updateKrStatus', kr.id, status)"
        @add-evidence="(type, id) => $emit('addEvidence', kr.id, type, id)"
        @remove-evidence="(linkId) => $emit('removeEvidence', kr.id, linkId)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type {
  ObjectiveWithSummary,
  ObjectiveWithKeyResults,
  EvidenceItem,
} from "@isaac/shared";
import { ChevronRightIcon } from "@heroicons/vue/20/solid";
import StatusBadge from "./StatusBadge.vue";
import KeyResultRow from "./KeyResultRow.vue";

const props = defineProps<{
  objective: ObjectiveWithSummary;
  detail: ObjectiveWithKeyResults | null;
  expanded: boolean;
  searchFn: (q: string) => Promise<{ key: string; title: string }[]>;
  readOnly?: boolean;
}>();

defineEmits<{
  toggle: [];
  updateKrStatus: [krId: number, status: string];
  addEvidence: [krId: number, targetType: string, targetId: string];
  removeEvidence: [krId: number, linkId: number];
}>();

const completedCount = computed(
  () => props.objective.keyResults.filter((kr) => kr.status === "completed").length
);

const totalEvidence = computed(() =>
  props.objective.keyResults.reduce(
    (sum, kr) =>
      sum + ("evidenceSummary" in kr ? kr.evidenceSummary.total : 0),
    0
  )
);

const keyResultsData = computed(() => {
  if (props.detail) return props.detail.keyResults;
  return props.objective.keyResults;
});

function getEvidence(krId: number): EvidenceItem[] | undefined {
  if (!props.detail) return undefined;
  const kr = props.detail.keyResults.find((k) => k.id === krId);
  return kr ? kr.evidence : undefined;
}
</script>
