<template>
  <div>
    <div v-if="loading && !metrics.length" class="py-20 text-center text-ink-faint">
      Loading...
    </div>
    <div v-else-if="error" class="py-20 text-center text-red-500">
      {{ error }}
    </div>
    <template v-else>
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-ink">Pipelines</h1>
          <p class="mt-1 text-sm text-ink-muted">CI/CD performance tracking.</p>
        </div>
        <div class="flex items-center gap-2">
          <router-link
            to="/pipelines/waterfall"
            class="rounded-lg border border-border px-3 py-1.5 text-sm text-ink-muted hover:text-ink hover:bg-surface-1 transition-colors"
          >
            Waterfall
          </router-link>
          <span class="text-sm text-ink-muted">Period:</span>
          <select
            v-model="weeks"
            class="rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm text-ink"
          >
            <option :value="8">8 weeks</option>
            <option :value="12">12 weeks</option>
            <option :value="16">16 weeks</option>
            <option :value="24">24 weeks</option>
          </select>
          <div v-if="loading" class="text-sm text-ink-faint">Updating...</div>
        </div>
      </div>

      <!-- Stats cards -->
      <div class="mt-6">
        <PipelineStatsCards :metrics="metrics" />
      </div>

      <!-- Duration trend chart -->
      <div class="mt-6">
        <DurationTrendChart :metrics="metrics" />
      </div>

      <!-- Two-column: slowest + flaky -->
      <div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SlowestJobsList :jobs="slowestJobs" />
        <FlakyJobsList :jobs="flakyJobs" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { usePipelines } from "../composables/usePipelines";
import PipelineStatsCards from "../components/pipelines/PipelineStatsCards.vue";
import DurationTrendChart from "../components/pipelines/DurationTrendChart.vue";
import SlowestJobsList from "../components/pipelines/SlowestJobsList.vue";
import FlakyJobsList from "../components/pipelines/FlakyJobsList.vue";

const { weeks, metrics, slowestJobs, flakyJobs, loading, error } = usePipelines();
</script>
