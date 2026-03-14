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

    <!-- Critical Path Delta -->
    <div class="mt-6">
      <CriticalPathDelta :decomposition="criticalPathDecomposition" :loading="initialLoading" />
    </div>

    <!-- Job overview -->
    <div class="mt-6">
      <JobOverview :jobs="jobStats" :prev-jobs="prevJobStats" :critical-path="criticalPathDecomposition" :job-trends="jobTrends" :loading="initialLoading" />
    </div>

    <!-- Pipeline list -->
    <div class="mt-6">
      <PipelineList :points="points" :loading="initialLoading" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import { usePipelines } from "../composables/usePipelines";

const router = useRouter();
function onSelectPipeline(id: number) {
  router.push({ name: "pipeline-detail", params: { id } });
}
import DurationScatterChart from "../components/pipelines/DurationScatterChart.vue";
import PipelineDurationStats from "../components/pipelines/PipelineDurationStats.vue";
import PipelineList from "../components/pipelines/PipelineList.vue";
import JobOverview from "../components/pipelines/JobOverview.vue";
import JobGanttChart from "../components/pipelines/JobGanttChart.vue";
import CriticalPathDelta from "../components/pipelines/CriticalPathDelta.vue";

const presets = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
];

const { since, until, points, comparison, jobStats, prevJobStats, criticalPathDecomposition, jobTrends, initialLoading, error, applyPreset, isActivePreset } = usePipelines();
</script>
