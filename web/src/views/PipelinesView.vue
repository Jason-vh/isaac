<template>
  <div>
    <!-- Header (always visible) -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-ink">Pipelines</h1>
        <p class="mt-1 text-sm text-ink-muted">CI/CD performance tracking.</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-for="p in presets"
          :key="p.days"
          class="rounded-lg border px-2.5 py-1 text-sm transition-colors"
          :class="isActivePreset(p.days)
            ? 'border-accent bg-accent-light text-accent'
            : 'border-border bg-surface-0 text-ink-muted hover:text-ink hover:bg-surface-2'"
          @click="applyPreset(p.days)"
        >
          {{ p.label }}
        </button>
        <input
          v-model="since"
          type="date"
          class="rounded-lg border border-border bg-surface-0 px-3 py-1 text-sm text-ink"
        />
        <span class="text-sm text-ink-faint">to</span>
        <input
          v-model="until"
          type="date"
          class="rounded-lg border border-border bg-surface-0 px-3 py-1 text-sm text-ink"
        />
      </div>
    </div>

    <!-- Tabs -->
    <div class="mt-4 flex gap-1 border-b border-border">
      <button
        class="relative px-4 py-2 text-sm font-medium transition-colors"
        :class="tab === 'performance'
          ? 'text-ink after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-accent'
          : 'text-ink-faint hover:text-ink'"
        @click="switchTab('performance')"
      >
        Performance
      </button>
      <button
        class="relative px-4 py-2 text-sm font-medium transition-colors"
        :class="tab === 'mr'
          ? 'text-ink after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-accent'
          : 'text-ink-faint hover:text-ink'"
        @click="switchTab('mr')"
      >
        By MR
      </button>
    </div>

    <!-- Performance tab (default) -->
    <template v-if="tab === 'performance'">
      <!-- Stats -->
      <div class="mt-6">
        <PipelineDurationStats :comparison="comparison" :loading="initialLoading" />
      </div>

      <!-- Chart area -->
      <div class="mt-6">
        <div v-if="error" class="py-20 text-center text-red-500">
          {{ error }}
        </div>
        <DurationScatterChart v-else :points="points" :loading="initialLoading" @select="onSelectPipeline" />
      </div>

      <!-- Job Gantt chart -->
      <div class="mt-6">
        <JobGanttChart :jobs="jobStats" :loading="initialLoading" />
      </div>

      <!-- Job overview -->
      <div class="mt-6">
        <JobOverview :jobs="jobStats" :prev-jobs="prevJobStats" :loading="initialLoading" />
      </div>

      <!-- Pipeline list -->
      <div class="mt-6">
        <PipelineList :points="points" :loading="initialLoading" />
      </div>
    </template>

    <!-- By MR tab -->
    <template v-if="tab === 'mr'">
      <div class="mt-6">
        <MrPipelineList :mrs="mrList" :loading="mrLoading" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import type { MrPipelineSummary } from "@isaac/shared";
import { usePipelines } from "../composables/usePipelines";
import { api, UnauthorizedError } from "../api/client";
import DurationScatterChart from "../components/pipelines/DurationScatterChart.vue";
import PipelineDurationStats from "../components/pipelines/PipelineDurationStats.vue";
import PipelineList from "../components/pipelines/PipelineList.vue";
import JobOverview from "../components/pipelines/JobOverview.vue";
import JobGanttChart from "../components/pipelines/JobGanttChart.vue";
import MrPipelineList from "../components/pipelines/MrPipelineList.vue";

const router = useRouter();
const route = useRoute();

function onSelectPipeline(id: number) {
  router.push({ name: "pipeline-detail", params: { id } });
}

const presets = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
];

const { since, until, points, comparison, jobStats, prevJobStats, initialLoading, error, applyPreset, isActivePreset } = usePipelines();

// Tab state
const tab = ref<"performance" | "mr">((route.query.tab as string) === "mr" ? "mr" : "performance");

function switchTab(newTab: "performance" | "mr") {
  tab.value = newTab;
  router.replace({
    query: { ...route.query, tab: newTab === "performance" ? undefined : newTab },
  });
}

// MR tab data
const mrList = ref<MrPipelineSummary[]>([]);
const mrLoading = ref(false);
let mrFetched = false;

async function fetchMrList() {
  if (mrFetched) return;
  mrLoading.value = true;
  try {
    const sinceParam = new Date(since.value).toISOString();
    mrList.value = await api.get<MrPipelineSummary[]>(
      `/pipelines/merge-requests?since=${sinceParam}&limit=50`
    );
    mrFetched = true;
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      router.push("/login");
      return;
    }
  } finally {
    mrLoading.value = false;
  }
}

// Fetch MR data when switching to the MR tab
watch(tab, (newTab) => {
  if (newTab === "mr") fetchMrList();
}, { immediate: true });

// Re-fetch MR data when date range changes while on the MR tab
watch([since, until], () => {
  if (tab.value === "mr") {
    mrFetched = false;
    fetchMrList();
  }
});
</script>
