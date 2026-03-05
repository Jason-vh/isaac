<template>
  <div>
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-ink">Objectives</h1>
        <p class="mt-1 text-sm text-ink-muted">2026 objectives and key results.</p>
      </div>
      <button
        v-if="!isShareMode && !objectives.length && !loading"
        @click="seed"
        class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
      >
        Seed Objectives
      </button>
    </div>

    <p v-if="error" class="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </p>

    <div v-if="loading && !objectives.length" class="mt-8 flex justify-center">
      <div class="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
    </div>

    <div v-else-if="!objectives.length" class="mt-12 text-center">
      <p class="text-ink-faint">No objectives yet. Seed from the Confluence page to get started.</p>
    </div>

    <div v-else class="mt-6 space-y-4">
      <ObjectiveCard
        v-for="obj in objectives"
        :key="obj.id"
        :objective="obj"
        :detail="expandedId === obj.id ? selectedObjective : null"
        :expanded="expandedId === obj.id"
        :search-fn="searchEpics"
        :read-only="isShareMode"
        @toggle="toggleObjective(obj.id)"
        @update-kr-status="(krId, status) => updateKeyResult(krId, { status })"
        @add-evidence="(krId, type, id) => addEvidence(krId, type, id)"
        @remove-evidence="(krId, linkId) => removeEvidence(krId, linkId)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, inject, type Ref } from "vue";
import { useObjectives } from "../composables/useObjectives";
import ObjectiveCard from "../components/objectives/ObjectiveCard.vue";

const isShareMode = inject<Ref<boolean>>("isShareMode", ref(false));

const {
  objectives,
  selectedObjective,
  loading,
  error,
  fetchObjectives,
  fetchObjective,
  seed,
  updateKeyResult,
  addEvidence,
  removeEvidence,
  searchEpics,
} = useObjectives();

const expandedId = ref<number | null>(null);

async function toggleObjective(id: number) {
  if (expandedId.value === id) {
    expandedId.value = null;
    return;
  }
  expandedId.value = id;
  await fetchObjective(id);
}

onMounted(() => fetchObjectives());
</script>
