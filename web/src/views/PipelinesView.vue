<template>
  <div>
    <!-- Header -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-xl font-bold text-ink sm:text-2xl">Pipelines</h1>
        <p class="mt-1 text-sm text-ink-muted">CI/CD performance tracking.</p>
      </div>
      <DateRangePicker v-model:since="since" v-model:until="until" />
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
      <DurationScatterChart v-else :points="points" :loading="initialLoading" v-model:split-by="splitBy" v-model:trend-line="trendLine" @select="onSelectPipeline" />
    </div>

    <!-- Job overview -->
    <div class="mt-6">
      <JobOverview :since="since" :until="until" />
    </div>

    <!-- Merge requests -->
    <div class="mt-6">
      <MrPipelineList :mrs="mrList" :loading="mrLoading" @search="onMrSearch" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { SplitBy, TrendLine } from "../components/pipelines/DurationScatterChart.vue";
import { useRouter } from "vue-router";
import type { MrPipelineSummary } from "@isaac/shared";
import { usePipelines } from "../composables/usePipelines";
import { api } from "../api/client";
import { useErrorHandler } from "../composables/useResource";
import DurationScatterChart from "../components/pipelines/DurationScatterChart.vue";
import PipelineDurationStats from "../components/pipelines/PipelineDurationStats.vue";
import JobOverview from "../components/pipelines/JobOverview.vue";
import MrPipelineList from "../components/pipelines/MrPipelineList.vue";
import DateRangePicker from "../components/common/DateRangePicker.vue";

const router = useRouter();

function onSelectPipeline(id: number) {
  router.push({ name: "pipeline-detail", params: { id } });
}

const { since, until, points, comparison, initialLoading, error } = usePipelines();
const splitBy = ref<SplitBy>("type");
const trendLine = ref<TrendLine>("p50");

// MR list data
const mrList = ref<MrPipelineSummary[]>([]);
const mrLoading = ref(false);
const mrSearch = ref("");
const mrError = ref("");
const handleMrError = useErrorHandler(mrError);

async function fetchMrList() {
  mrLoading.value = true;
  try {
    const params = new URLSearchParams({ limit: "50" });
    if (mrSearch.value) {
      params.set("search", mrSearch.value);
    } else {
      params.set("since", new Date(`${since.value}T00:00:00`).toISOString());
    }
    mrList.value = await api.get<MrPipelineSummary[]>(
      `/pipelines/merge-requests?${params}`
    );
  } catch (e) {
    handleMrError(e);
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
