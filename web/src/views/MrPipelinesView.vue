<template>
  <div>
    <div class="flex items-center gap-3">
      <router-link to="/pipelines?tab=mr" class="text-ink-faint hover:text-ink transition-colors">
        <ArrowLeftIcon class="h-4 w-4" />
      </router-link>
      <div class="flex-1">
        <h1 class="text-2xl font-bold text-ink">
          {{ mrTitle }}
        </h1>
        <div v-if="mrMeta" class="mt-1 flex items-center gap-3 text-sm">
          <span
            class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
            :class="mrStatusColor(mrMeta.status)"
          >{{ mrMeta.status }}</span>
          <span class="text-ink-faint">&middot;</span>
          <span class="text-ink-muted">!{{ mrMeta.gitlabIid }}</span>
        </div>
      </div>
      <a
        v-if="mrMeta"
        :href="gitlabUrl"
        target="_blank"
        rel="noopener"
        class="flex items-center gap-1.5 rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
      >
        View on GitLab
        <ArrowTopRightOnSquareIcon class="h-3.5 w-3.5" />
      </a>
    </div>

    <div v-if="loading" class="py-20 text-center text-ink-faint animate-pulse">
      Loading pipelines...
    </div>
    <div v-else-if="error" class="py-20 text-center text-red-500">{{ error }}</div>
    <template v-else>
      <!-- Summary stats -->
      <div class="mt-6 flex items-center gap-4 text-sm text-ink-muted">
        <span>{{ pipelines.length }} pipelines</span>
        <span v-if="firstSuccessIndex >= 0" class="text-ink-faint">&middot;</span>
        <span v-if="firstSuccessIndex >= 0" class="text-emerald-600">
          First green on run #{{ firstSuccessIndex + 1 }}
        </span>
        <span class="text-ink-faint">&middot;</span>
        <span class="font-mono tabular-nums">
          {{ totalCiTime }}
        </span>
      </div>

      <div class="mt-6">
        <TrainDebugCard :attempts="trainAttempts" :loading="trainDebugLoading" />
      </div>

      <!-- Pipeline history timeline -->
      <div class="mt-6">
        <MrPipelineHistory :pipelines="pipelines" :first-success-index="firstSuccessIndex" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { PipelineListItem, TrainDebugAttempt } from "@isaac/shared";
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon } from "@heroicons/vue/20/solid";
import MrPipelineHistory from "../components/pipelines/MrPipelineHistory.vue";
import TrainDebugCard from "../components/pipelines/TrainDebugCard.vue";
import { api, UnauthorizedError } from "../api/client";

interface MrMeta {
  title: string;
  status: string;
  gitlabIid: number;
  projectPath: string;
}

const route = useRoute();
const router = useRouter();

const mrId = computed(() => Number(route.params.id));
const pipelines = ref<PipelineListItem[]>([]);
const trainAttempts = ref<TrainDebugAttempt[]>([]);
const loading = ref(true);
const trainDebugLoading = ref(true);
const error = ref("");

// Read MR metadata from history.state (passed by MrPipelineList)
const mrMeta = ref<MrMeta | null>(null);

onMounted(async () => {
  // Try to get MR metadata from router state
  const s = history.state;
  if (s?.mrTitle) {
    mrMeta.value = {
      title: s.mrTitle,
      status: s.mrStatus,
      gitlabIid: s.mrGitlabIid,
      projectPath: s.mrProjectPath,
    };
  }

  try {
    pipelines.value = await api.get<PipelineListItem[]>(
      `/pipelines/merge-requests/${mrId.value}/pipelines`
    );

    try {
      trainAttempts.value = await api.get<TrainDebugAttempt[]>(
        `/pipelines/merge-requests/${mrId.value}/train-debug`
      );
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        throw e;
      }
      trainAttempts.value = [];
    } finally {
      trainDebugLoading.value = false;
    }
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      router.push("/login");
      return;
    }
    error.value = (e as Error).message;
  } finally {
    trainDebugLoading.value = false;
    loading.value = false;
  }
});

const mrTitle = computed(() => {
  if (mrMeta.value) return mrMeta.value.title;
  return `MR #${mrId.value}`;
});

const gitlabUrl = computed(() => {
  if (!mrMeta.value) return "";
  return `https://gitlab.com/${mrMeta.value.projectPath}/-/merge_requests/${mrMeta.value.gitlabIid}`;
});

// Sort oldest first to find first success
const chronological = computed(() =>
  [...pipelines.value].sort(
    (a, b) => new Date(a.gitlabCreatedAt).getTime() - new Date(b.gitlabCreatedAt).getTime()
  )
);

const firstSuccessIndex = computed(() =>
  chronological.value.findIndex((p) => p.status === "success")
);

const totalCiTime = computed(() => {
  const total = pipelines.value.reduce(
    (sum, p) => sum + (p.durationSeconds ?? 0),
    0
  );
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m total CI`;
  const s = Math.round(total % 60);
  return `${m}m ${s}s total CI`;
});

function mrStatusColor(status: string): string {
  switch (status) {
    case "merged": return "bg-emerald-100 text-emerald-700";
    case "opened": return "bg-blue-100 text-blue-700";
    case "closed": return "bg-gray-100 text-gray-600";
    default: return "bg-gray-100 text-gray-600";
  }
}
</script>
