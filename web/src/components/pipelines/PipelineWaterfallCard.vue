<template>
  <div class="card overflow-hidden">
    <!-- Header (always visible, clickable) -->
    <button
      class="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-surface-1 transition-colors"
      @click="toggle"
    >
      <ChevronRightIcon
        class="h-4 w-4 flex-shrink-0 text-ink-faint transition-transform"
        :class="{ 'rotate-90': expanded }"
      />

      <!-- Status dot -->
      <div class="h-2.5 w-2.5 flex-shrink-0 rounded-full" :class="statusDot(pipeline.status)" />

      <!-- Pipeline info -->
      <div class="min-w-0 flex-1">
        <span class="font-mono text-sm text-ink">#{{ pipeline.id }}</span>
        <span v-if="pipeline.ref" class="ml-2 text-xs text-ink-muted">{{ pipeline.ref }}</span>
      </div>

      <!-- Source badge -->
      <span
        v-if="pipeline.source"
        class="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
        :class="sourceBadge(pipeline.source)"
      >
        {{ sourceLabel(pipeline.source) }}
      </span>

      <!-- Duration -->
      <span v-if="pipeline.durationSeconds" class="flex-shrink-0 font-mono text-sm tabular-nums text-ink-muted">
        {{ formatDuration(pipeline.durationSeconds) }}
      </span>

      <!-- Job count + retries -->
      <span class="flex-shrink-0 text-xs text-ink-faint">
        {{ pipeline.jobCount }} jobs
      </span>
      <span
        v-if="pipeline.retriedJobCount > 0"
        class="flex-shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
      >
        {{ pipeline.retriedJobCount }} retried
      </span>

      <!-- Timestamp -->
      <span class="flex-shrink-0 text-xs text-ink-faint">
        {{ formatDate(pipeline.gitlabCreatedAt) }}
      </span>

      <!-- GitLab link -->
      <a
        :href="pipeline.webUrl"
        target="_blank"
        rel="noopener"
        class="flex-shrink-0 text-ink-faint hover:text-ink"
        @click.stop
      >
        <ArrowTopRightOnSquareIcon class="h-3.5 w-3.5" />
      </a>
    </button>

    <!-- Expanded chart -->
    <div v-if="expanded" class="border-t border-border px-4 py-3">
      <div v-if="loadingDetail" class="py-6 text-center text-sm text-ink-faint">Loading jobs...</div>
      <WaterfallChart v-else-if="detail" :pipeline="detail" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { PipelineListItem, PipelineDetail } from "@isaac/shared";
import { ChevronRightIcon, ArrowTopRightOnSquareIcon } from "@heroicons/vue/20/solid";
import WaterfallChart from "./WaterfallChart.vue";
import { usePipelineWaterfall } from "../../composables/usePipelineWaterfall";

const props = defineProps<{ pipeline: PipelineListItem }>();

const { fetchPipelineDetail } = usePipelineWaterfall();

const expanded = ref(false);
const detail = ref<PipelineDetail | null>(null);
const loadingDetail = ref(false);

async function toggle() {
  expanded.value = !expanded.value;
  if (expanded.value && !detail.value) {
    loadingDetail.value = true;
    detail.value = await fetchPipelineDetail(props.pipeline.id);
    loadingDetail.value = false;
  }
}

function statusDot(status: string): string {
  switch (status) {
    case "success": return "bg-emerald-500";
    case "failed": return "bg-red-500";
    case "canceled": return "bg-gray-400";
    case "running": return "bg-blue-500";
    default: return "bg-gray-400";
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function sourceLabel(source: string): string {
  switch (source) {
    case "merge_request_event": return "MR";
    case "push": return "push";
    case "web": return "web";
    case "schedule": return "schedule";
    case "api": return "API";
    case "merge_train": return "merge train";
    case "pipeline": return "child";
    case "parent_pipeline": return "parent";
    default: return source.replace(/_/g, " ");
  }
}

function sourceBadge(source: string): string {
  switch (source) {
    case "merge_train": return "bg-purple-100 text-purple-700";
    case "merge_request_event": return "bg-blue-100 text-blue-700";
    case "schedule": return "bg-amber-100 text-amber-700";
    case "push": return "bg-surface-2 text-ink-muted";
    default: return "bg-surface-2 text-ink-muted";
  }
}
</script>
