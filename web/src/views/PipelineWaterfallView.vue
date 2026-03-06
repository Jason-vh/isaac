<template>
  <div>
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <div class="flex items-center gap-3">
          <router-link to="/pipelines" class="text-ink-faint hover:text-ink transition-colors">
            <ArrowLeftIcon class="h-4 w-4" />
          </router-link>
          <h1 class="text-2xl font-bold text-ink">Pipeline Waterfall</h1>
        </div>
        <p class="mt-1 text-sm text-ink-muted">Individual pipeline execution timelines.</p>
      </div>
    </div>

    <!-- Tabs -->
    <div class="mt-6 flex gap-1 rounded-lg bg-surface-1 p-1 w-fit">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="rounded-md px-4 py-1.5 text-sm font-medium transition-colors"
        :class="activeTab === tab.key
          ? 'bg-surface-0 text-ink shadow-sm'
          : 'text-ink-muted hover:text-ink'"
        @click="switchTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="py-20 text-center text-ink-faint">Loading...</div>
    <div v-else-if="error" class="py-20 text-center text-red-500">{{ error }}</div>

    <!-- By Pipeline -->
    <template v-else-if="activeTab === 'pipeline'">
      <div v-if="pipelinesList.length === 0" class="py-20 text-center text-ink-faint">
        No pipelines found.
      </div>
      <div v-else class="mt-4 space-y-2">
        <PipelineWaterfallCard
          v-for="p in pipelinesList"
          :key="p.id"
          :pipeline="p"
        />
      </div>
    </template>

    <!-- By MR -->
    <template v-else-if="activeTab === 'mr'">
      <div v-if="mergeRequests.length === 0" class="py-20 text-center text-ink-faint">
        No merge requests with pipelines found.
      </div>
      <div v-else class="mt-4 space-y-2">
        <div v-for="mr in mergeRequests" :key="mr.id" class="card overflow-hidden">
          <!-- MR header -->
          <button
            class="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-surface-1 transition-colors"
            @click="toggleMr(mr.id)"
          >
            <ChevronRightIcon
              class="h-4 w-4 flex-shrink-0 text-ink-faint transition-transform"
              :class="{ 'rotate-90': expandedMrs.has(mr.id) }"
            />
            <div class="h-2.5 w-2.5 flex-shrink-0 rounded-full" :class="mrStatusDot(mr.status)" />
            <div class="min-w-0 flex-1">
              <span class="text-sm font-medium text-ink">!{{ mr.gitlabIid }}</span>
              <span class="ml-2 text-sm text-ink-muted truncate">{{ mr.title }}</span>
            </div>
            <span class="flex-shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-muted">
              {{ mr.pipelineCount }} pipelines
            </span>
            <span class="flex-shrink-0 text-xs text-ink-faint">{{ mr.branchName }}</span>
          </button>

          <!-- MR's pipelines -->
          <div v-if="expandedMrs.has(mr.id)" class="border-t border-border px-4 py-3 space-y-2">
            <div v-if="mrPipelinesLoading.has(mr.id)" class="py-4 text-center text-sm text-ink-faint">
              Loading pipelines...
            </div>
            <template v-else>
              <PipelineWaterfallCard
                v-for="p in mrPipelinesMap.get(mr.id) || []"
                :key="p.id"
                :pipeline="p"
              />
            </template>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import type { PipelineListItem } from "@isaac/shared";
import { ArrowLeftIcon, ChevronRightIcon } from "@heroicons/vue/20/solid";
import PipelineWaterfallCard from "../components/pipelines/PipelineWaterfallCard.vue";
import { usePipelineWaterfall } from "../composables/usePipelineWaterfall";

const {
  pipelinesList,
  mergeRequests,
  loading,
  error,
  fetchPipelines,
  fetchMergeRequests,
  fetchMrPipelines,
} = usePipelineWaterfall();

const tabs = [
  { key: "pipeline", label: "By Pipeline" },
  { key: "mr", label: "By MR" },
] as const;

type TabKey = (typeof tabs)[number]["key"];
const activeTab = ref<TabKey>("pipeline");

const expandedMrs = reactive(new Set<number>());
const mrPipelinesMap = reactive(new Map<number, PipelineListItem[]>());
const mrPipelinesLoading = reactive(new Set<number>());

function switchTab(tab: TabKey) {
  activeTab.value = tab;
  if (tab === "pipeline" && pipelinesList.value.length === 0) {
    fetchPipelines(50);
  } else if (tab === "mr" && mergeRequests.value.length === 0) {
    fetchMergeRequests(30);
  }
}

async function toggleMr(mrId: number) {
  if (expandedMrs.has(mrId)) {
    expandedMrs.delete(mrId);
    return;
  }
  expandedMrs.add(mrId);
  if (!mrPipelinesMap.has(mrId)) {
    mrPipelinesLoading.add(mrId);
    const pipelines = await fetchMrPipelines(mrId);
    mrPipelinesMap.set(mrId, pipelines);
    mrPipelinesLoading.delete(mrId);
  }
}

function mrStatusDot(status: string): string {
  switch (status) {
    case "merged": return "bg-purple-500";
    case "opened": return "bg-green-500";
    case "closed": return "bg-red-500";
    default: return "bg-gray-400";
  }
}

onMounted(() => fetchPipelines(50));
</script>
