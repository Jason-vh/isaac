<template>
  <div>
    <!-- Header -->
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

    <!-- Critical Path Frequency -->
    <div class="mt-6">
      <CriticalPathFrequency :items="criticalPathFrequency" :loading="initialLoading" />
    </div>

    <!-- Job overview -->
    <div class="mt-6">
      <JobOverview :jobs="jobStats" :prev-jobs="prevJobStats" :job-trends="jobTrends" :loading="initialLoading" />
    </div>

    <!-- Merge requests -->
    <div class="mt-6">
      <MrPipelineList :mrs="mrList" :loading="mrLoading" @search="onMrSearch" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import type { MrPipelineSummary } from "@isaac/shared";
import { usePipelines } from "../composables/usePipelines";
import { api, UnauthorizedError } from "../api/client";
import DurationScatterChart from "../components/pipelines/DurationScatterChart.vue";
import PipelineDurationStats from "../components/pipelines/PipelineDurationStats.vue";
import JobOverview from "../components/pipelines/JobOverview.vue";
import CriticalPathFrequency from "../components/pipelines/CriticalPathFrequency.vue";
import MrPipelineList from "../components/pipelines/MrPipelineList.vue";

const router = useRouter();

function onSelectPipeline(id: number) {
  router.push({ name: "pipeline-detail", params: { id } });
}

const presets = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
];

const { since, until, points, comparison, jobStats, prevJobStats, criticalPathFrequency, jobTrends, initialLoading, error, applyPreset, isActivePreset } = usePipelines();

// MR list data
const mrList = ref<MrPipelineSummary[]>([]);
const mrLoading = ref(false);
const mrSearch = ref("");

async function fetchMrList() {
  mrLoading.value = true;
  try {
    const params = new URLSearchParams({ limit: "50" });
    if (mrSearch.value) {
      params.set("search", mrSearch.value);
    } else {
      params.set("since", new Date(since.value).toISOString());
    }
    mrList.value = await api.get<MrPipelineSummary[]>(
      `/pipelines/merge-requests?${params}`
    );
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      router.push("/login");
      return;
    }
  } finally {
    mrLoading.value = false;
  }
}

function onMrSearch(query: string) {
  mrSearch.value = query;
  fetchMrList();
}

// Fetch on load and when date range changes
watch([since, until], () => {
  if (!mrSearch.value) fetchMrList();
}, { immediate: true });
</script>
