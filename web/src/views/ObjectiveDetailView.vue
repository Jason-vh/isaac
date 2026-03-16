<template>
  <div>
    <!-- Tabs -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-ink">Objectives</h1>
        <p class="mt-1 text-sm text-ink-muted">2026 objectives and key results.</p>
      </div>
    </div>

    <div class="mt-4">
      <ObjectiveTabs :active-slug="slug" />
    </div>

    <!-- Error -->
    <p v-if="error" class="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </p>

    <!-- Loading -->
    <div v-if="loading && !selectedObjective" class="mt-8 flex justify-center">
      <div class="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
    </div>

    <!-- Objective detail -->
    <template v-if="selectedObjective">
      <div class="mt-6">
        <p class="text-sm text-ink-muted">{{ selectedObjective.description }}</p>
      </div>

      <div class="mt-6 space-y-4">
        <KrSection
          v-for="kr in selectedObjective.keyResults"
          :key="kr.slug"
          :kr="kr"
          :read-only="isShareMode"
          :fetch-timeline="fetchTimeline"
          @edit="openEditModal(kr.slug)"
        />
      </div>
    </template>

    <!-- Edit modal -->
    <KrEditModal
      :open="editModalOpen"
      :evidence="editingKrEvidence"
      :search-epics="searchEpics"
      :search-entities="searchEntities"
      @close="editModalOpen = false"
      @add-evidence="onAddEvidence"
      @remove-evidence="onRemoveEvidence"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject, type Ref } from "vue";
import { useRoute } from "vue-router";
import { useObjectives } from "../composables/useObjectives";
import ObjectiveTabs from "../components/objectives/ObjectiveTabs.vue";
import KrSection from "../components/objectives/KrSection.vue";
import KrEditModal from "../components/objectives/KrEditModal.vue";

const route = useRoute();
const isShareMode = inject<Ref<boolean>>("isShareMode", ref(false));

const {
  selectedObjective,
  loading,
  error,
  fetchObjective,
  addEvidence,
  removeEvidence,
  searchEpics,
  searchEntities,
  fetchTimeline,
} = useObjectives();

const slug = computed(() => route.params.slug as string);

// Edit modal state
const editModalOpen = ref(false);
const editingKrSlug = ref<string | null>(null);

const editingKrEvidence = computed(() => {
  if (!editingKrSlug.value || !selectedObjective.value) return [];
  const kr = selectedObjective.value.keyResults.find((k) => k.slug === editingKrSlug.value);
  return kr?.evidence ?? [];
});

function openEditModal(krSlug: string) {
  editingKrSlug.value = krSlug;
  editModalOpen.value = true;
}

async function onAddEvidence(targetType: string, targetId: string) {
  if (!editingKrSlug.value) return;
  await addEvidence(editingKrSlug.value, targetType, targetId);
}

async function onRemoveEvidence(linkId: number) {
  if (!editingKrSlug.value) return;
  await removeEvidence(editingKrSlug.value, linkId);
}

// Load objective when slug changes
watch(slug, (s) => {
  if (s) fetchObjective(s);
}, { immediate: true });
</script>
