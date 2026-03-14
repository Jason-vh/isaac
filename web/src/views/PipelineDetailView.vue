<template>
  <div>
    <div class="flex items-center gap-3">
      <router-link to="/pipelines" class="text-ink-faint hover:text-ink transition-colors">
        <ArrowLeftIcon class="h-4 w-4" />
      </router-link>
      <div class="flex-1">
        <h1 class="text-2xl font-bold text-ink">
          Pipeline #{{ pipelineId }}
        </h1>
        <div v-if="detail" class="mt-1 flex items-center gap-3 text-sm">
          <span
            class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
            :class="statusBadgeColor(detail.status)"
          >{{ detail.status }}</span>
          <span class="text-ink-faint">&middot;</span>
          <span class="font-mono text-ink-muted">{{ detail.durationSeconds ? fmtDuration(detail.durationSeconds) : '--' }}</span>
          <span class="text-ink-faint">&middot;</span>
          <span class="text-ink-muted">{{ detail.jobCount }} jobs</span>
          <template v-if="detail.retriedJobCount > 0">
            <span class="text-ink-faint">&middot;</span>
            <span class="text-amber-600">{{ detail.retriedJobCount }} retried</span>
          </template>
          <span class="text-ink-faint">&middot;</span>
          <span
            class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
            :class="pipelineTypeColor"
          >{{ pipelineType }}</span>
          <span class="text-ink-faint">&middot;</span>
          <span class="text-ink-muted">{{ fmtDate(detail.gitlabCreatedAt) }}</span>
        </div>
      </div>
      <a
        v-if="detail"
        :href="detail.webUrl"
        target="_blank"
        rel="noopener"
        class="flex items-center gap-1.5 rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
      >
        View on GitLab
        <ArrowTopRightOnSquareIcon class="h-3.5 w-3.5" />
      </a>
    </div>

    <div v-if="loading" class="py-20 text-center text-ink-faint animate-pulse">
      Loading pipeline...
    </div>
    <div v-else-if="error" class="py-20 text-center text-red-500">{{ error }}</div>
    <template v-else-if="detail">

      <!-- Waterfall chart -->
      <div class="mt-6 card overflow-hidden">
        <div class="flex items-center gap-3 border-b border-border px-4 py-3">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-ink-faint">
            Job Timeline
          </h3>
          <div class="ml-auto flex items-center gap-3">
            <button
              class="rounded border px-2 py-1 text-xs transition-colors"
              :class="showCriticalPath
                ? 'border-amber-400 bg-amber-50 text-amber-700'
                : 'border-border bg-surface text-ink-faint hover:text-ink'"
              @click="showCriticalPath = !showCriticalPath"
            >
              Critical path
            </button>
            <input
              v-model="jobSearch"
              type="text"
              placeholder="Filter jobs..."
              class="w-48 rounded border border-border bg-surface px-2 py-1 text-xs text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
            />
          </div>
        </div>
        <WaterfallChart :pipeline="detail" :search="jobSearch" :show-critical-path="showCriticalPath" />
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
const jobSearch = ref("");
const showCriticalPath = ref(true);
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

const pipelineTypeColor = computed(() => {
  if (!detail.value?.ref) return "bg-gray-100 text-gray-600";
  if (detail.value.ref.endsWith("/train")) return "bg-purple-100 text-purple-700";
  return "bg-blue-100 text-blue-700";
});

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

function statusBadgeColor(status: string): string {
  switch (status) {
    case "success": return "bg-emerald-100 text-emerald-700";
    case "failed": return "bg-red-100 text-red-700";
    case "canceled": return "bg-gray-100 text-gray-600";
    case "running": return "bg-blue-100 text-blue-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

</script>
