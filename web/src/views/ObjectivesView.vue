<template>
  <div>
    <div>
      <h1 class="text-2xl font-bold text-ink">Objectives</h1>
      <p class="mt-1 text-sm text-ink-muted">2026 objectives and key results.</p>
    </div>

    <p v-if="error" class="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </p>

    <div v-if="loading && !objectives.length" class="mt-8 flex justify-center">
      <div class="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
    </div>

    <div v-else class="mt-6 space-y-4">
      <ObjectiveCard
        v-for="obj in objectives"
        :key="obj.slug"
        :objective="obj"
        :detail="expandedSlug === obj.slug ? selectedObjective : null"
        :expanded="expandedSlug === obj.slug"
        :search-fn="searchEpics"
        :read-only="isShareMode"
        @toggle="toggleObjective(obj.slug)"
        @add-evidence="(krSlug, type, id) => addEvidence(krSlug, type, id)"
        @remove-evidence="(krSlug, linkId) => removeEvidence(krSlug, linkId)"
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
  addEvidence,
  removeEvidence,
  searchEpics,
} = useObjectives();

const expandedSlug = ref<string | null>(null);

async function toggleObjective(slug: string) {
  if (expandedSlug.value === slug) {
    expandedSlug.value = null;
    return;
  }
  expandedSlug.value = slug;
  await fetchObjective(slug);
}

onMounted(() => fetchObjectives());
</script>
