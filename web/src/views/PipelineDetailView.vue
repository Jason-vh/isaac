<template>
  <div>
    <div class="flex items-center gap-3">
      <router-link to="/pipelines" class="text-ink-faint hover:text-ink transition-colors">
        <ArrowLeftIcon class="h-4 w-4" />
      </router-link>
      <h1 class="text-2xl font-bold text-ink">
        Pipeline #{{ pipelineId }}
      </h1>
      <a
        v-if="detail"
        :href="detail.webUrl"
        target="_blank"
        rel="noopener"
        class="text-ink-faint hover:text-ink transition-colors"
      >
        <ArrowTopRightOnSquareIcon class="h-4 w-4" />
      </a>
    </div>

    <div v-if="loading" class="py-20 text-center text-ink-faint animate-pulse">
      Loading pipeline...
    </div>
    <div v-else-if="error" class="py-20 text-center text-red-500">{{ error }}</div>
    <template v-else-if="detail">
      <!-- Summary -->
      <div class="mt-6 flex flex-wrap gap-4">
        <div class="card px-4 py-3">
          <p class="text-[10px] font-medium uppercase tracking-wider text-ink-faint">Status</p>
          <p class="mt-0.5 text-sm font-medium" :class="statusColor(detail.status)">
            {{ detail.status }}
          </p>
        </div>
        <div class="card px-4 py-3">
          <p class="text-[10px] font-medium uppercase tracking-wider text-ink-faint">Duration</p>
          <p class="mt-0.5 font-mono text-sm text-ink">
            {{ detail.durationSeconds ? fmtDuration(detail.durationSeconds) : '--' }}
          </p>
        </div>
        <div class="card px-4 py-3">
          <p class="text-[10px] font-medium uppercase tracking-wider text-ink-faint">Jobs</p>
          <p class="mt-0.5 text-sm text-ink">{{ detail.jobCount }}</p>
        </div>
        <div v-if="detail.retriedJobCount > 0" class="card px-4 py-3">
          <p class="text-[10px] font-medium uppercase tracking-wider text-ink-faint">Retried</p>
          <p class="mt-0.5 text-sm text-amber-600">{{ detail.retriedJobCount }}</p>
        </div>
        <div class="card px-4 py-3">
          <p class="text-[10px] font-medium uppercase tracking-wider text-ink-faint">Type</p>
          <p class="mt-0.5 text-sm text-ink">{{ pipelineType }}</p>
        </div>
        <div class="card px-4 py-3">
          <p class="text-[10px] font-medium uppercase tracking-wider text-ink-faint">Created</p>
          <p class="mt-0.5 text-sm text-ink">{{ fmtDate(detail.gitlabCreatedAt) }}</p>
        </div>
      </div>

      <!-- Waterfall chart -->
      <div class="mt-6 card overflow-hidden">
        <h3 class="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
          Job Timeline
        </h3>
        <div class="px-4 py-3">
          <WaterfallChart :pipeline="detail" />
        </div>
      </div>

      <!-- Job list -->
      <div class="mt-6 card overflow-hidden">
        <h3 class="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
          Jobs
        </h3>
        <div class="divide-y divide-border">
          <a
            v-for="job in nonRetriedJobs"
            :key="job.id"
            :href="job.webUrl"
            target="_blank"
            rel="noopener"
            class="flex items-center gap-3 px-4 py-2 hover:bg-surface-1 transition-colors"
          >
            <div class="h-2 w-2 shrink-0 rounded-full" :class="statusDot(job.status)" />
            <span class="min-w-0 flex-1 truncate text-sm text-ink">{{ job.name }}</span>
            <span class="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-faint">
              {{ job.stage }}
            </span>
            <span v-if="job.durationSeconds != null" class="shrink-0 font-mono text-xs tabular-nums text-ink-muted">
              {{ fmtDuration(job.durationSeconds) }}
            </span>
            <span v-else class="shrink-0 text-xs text-ink-faint">--</span>
          </a>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { PipelineDetail } from "@isaac/shared";
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon } from "@heroicons/vue/20/solid";
import WaterfallChart from "../components/pipelines/WaterfallChart.vue";
import { api, UnauthorizedError } from "../api/client";

const route = useRoute();
const router = useRouter();

const pipelineId = computed(() => Number(route.params.id));
const detail = ref<PipelineDetail | null>(null);
const loading = ref(true);
const error = ref("");

const pipelineType = computed(() => {
  if (!detail.value?.ref) return "unknown";
  if (detail.value.ref.endsWith("/train")) return "Merge Train";
  if (detail.value.ref.endsWith("/merge")) return "Merged Results";
  if (detail.value.ref.endsWith("/head")) return "Detached MR";
  return detail.value.source ?? "unknown";
});

const nonRetriedJobs = computed(() =>
  (detail.value?.jobs ?? []).filter((j) => !j.retried)
);

onMounted(async () => {
  try {
    detail.value = await api.get<PipelineDetail>(`/pipelines/${pipelineId.value}/jobs`);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      router.push("/login");
      return;
    }
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
});

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusColor(status: string): string {
  switch (status) {
    case "success": return "text-emerald-600";
    case "failed": return "text-red-500";
    case "canceled": return "text-gray-400";
    case "running": return "text-blue-500";
    default: return "text-ink-muted";
  }
}

function statusDot(status: string): string {
  switch (status) {
    case "success": return "bg-emerald-500";
    case "failed": return "bg-red-500";
    case "canceled": return "bg-gray-400";
    case "skipped": return "bg-gray-300";
    default: return "bg-blue-400";
  }
}
</script>
