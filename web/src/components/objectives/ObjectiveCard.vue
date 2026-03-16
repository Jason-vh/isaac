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
        </div>
        <p v-if="objective.description" class="mt-1 ml-8 text-sm text-ink-muted line-clamp-2">
          {{ objective.description }}
        </p>
        <div class="mt-2 ml-8 flex items-center gap-4 text-xs text-ink-faint">
          <span>
            {{ objective.keyResults.length }} key result{{ objective.keyResults.length !== 1 ? 's' : '' }}
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
        :key="kr.slug"
        :kr="kr"
        :evidence="getEvidence(kr.slug)"
        :search-fn="searchFn"
        :read-only="readOnly"
        @add-evidence="(type, id) => $emit('addEvidence', kr.slug, type, id)"
        @remove-evidence="(linkId) => $emit('removeEvidence', kr.slug, linkId)"
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
  addEvidence: [krSlug: string, targetType: string, targetId: string];
  removeEvidence: [krSlug: string, linkId: number];
}>();

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

function getEvidence(krSlug: string): EvidenceItem[] | undefined {
  if (!props.detail) return undefined;
  const kr = props.detail.keyResults.find((k) => k.slug === krSlug);
  return kr ? kr.evidence : undefined;
}
</script>
