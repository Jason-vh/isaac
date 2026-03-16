<template>
  <div class="card overflow-hidden">
    <button
      class="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface-1"
      :class="{ 'border-b border-border': expanded }"
      @click="expanded = !expanded"
    >
      <h3 class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-faint">
        <ChevronRightIcon
          class="h-3.5 w-3.5 transition-transform"
          :class="{ 'rotate-90': expanded }"
        />
        Merge Requests
        <span class="font-normal">{{ mrs.length }}</span>
      </h3>
    </button>

    <template v-if="expanded">
      <!-- Search -->
      <div class="border-b border-border px-4 py-2">
        <input
          v-model="search"
          type="text"
          placeholder="Search merge requests..."
          class="w-full rounded-md border border-border bg-surface-0 px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          @input="onSearchInput"
        />
      </div>

      <!-- Loading skeleton -->
      <div v-if="loading" class="divide-y divide-border">
        <div v-for="i in 8" :key="i" class="flex items-center gap-3 px-4 py-3">
          <div class="h-5 w-14 animate-pulse rounded-full bg-surface-2" />
          <div class="h-4 flex-1 animate-pulse rounded bg-surface-2" />
          <div class="h-4 w-16 animate-pulse rounded bg-surface-2" />
          <div class="h-4 w-20 animate-pulse rounded bg-surface-2" />
        </div>
      </div>

      <!-- Empty state -->
      <div v-else-if="mrs.length === 0" class="p-4 text-sm text-ink-faint">
        {{ search ? 'No matching merge requests.' : 'No merge requests with pipelines in this period.' }}
      </div>

      <!-- Table -->
      <div v-else class="divide-y divide-border">
        <router-link
          v-for="mr in mrs"
          :key="mr.id"
          :to="{ name: 'mr-pipelines', params: { id: mr.id }, state: { mrTitle: mr.title, mrStatus: mr.status, mrGitlabIid: mr.gitlabIid, mrProjectPath: mr.projectPath } }"
          class="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-surface-1 transition-colors text-left"
        >
          <!-- Status badge -->
          <span
            class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
            :class="mrBadgeColor(mr)"
          >
            {{ mrBadgeLabel(mr) }}
          </span>

          <!-- MR title + iid -->
          <span class="min-w-0 flex-1 truncate text-sm text-ink">
            {{ mr.title }}
            <span class="ml-1 text-ink-faint">!{{ mr.gitlabIid }}</span>
          </span>

          <!-- Pipeline count -->
          <span class="shrink-0 text-xs tabular-nums text-ink-muted">
            {{ mr.pipelineCount }} runs
          </span>

          <!-- Failed count -->
          <span
            v-if="mr.failedCount > 0"
            class="shrink-0 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 tabular-nums"
          >
            {{ mr.failedCount }} failed
          </span>

          <!-- Total CI time -->
          <span class="shrink-0 font-mono text-sm tabular-nums text-ink">
            {{ mr.totalDurationSeconds != null ? fmtCiTime(mr.totalDurationSeconds) : '--' }}
          </span>

          <!-- GitLab link -->
          <a
            :href="gitlabUrl(mr)"
            target="_blank"
            rel="noopener"
            class="shrink-0 text-ink-faint hover:text-ink transition-colors"
            @click.stop
          >
            <ArrowTopRightOnSquareIcon class="h-3.5 w-3.5" />
          </a>
        </router-link>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { MrPipelineSummary } from "@isaac/shared";
import { ArrowTopRightOnSquareIcon, ChevronRightIcon } from "@heroicons/vue/20/solid";

defineProps<{
  mrs: MrPipelineSummary[];
  loading: boolean;
}>();

const emit = defineEmits<{
  search: [query: string];
}>();

const expanded = ref(false);
const search = ref("");
let debounceTimer: ReturnType<typeof setTimeout>;

function onSearchInput() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    emit("search", search.value.trim());
  }, 300);
}

function isDraft(mr: MrPipelineSummary): boolean {
  return mr.title.toLowerCase().startsWith("draft:");
}

function mrBadgeLabel(mr: MrPipelineSummary): string {
  if (isDraft(mr)) return "draft";
  return mr.status;
}

function mrBadgeColor(mr: MrPipelineSummary): string {
  if (isDraft(mr)) return "bg-amber-100 text-amber-700";
  switch (mr.status) {
    case "merged": return "bg-emerald-100 text-emerald-700";
    case "opened": return "bg-blue-100 text-blue-700";
    case "closed": return "bg-gray-100 text-gray-600";
    default: return "bg-gray-100 text-gray-600";
  }
}

function fmtCiTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function gitlabUrl(mr: MrPipelineSummary): string {
  return `https://gitlab.com/${mr.projectPath}/-/merge_requests/${mr.gitlabIid}`;
}
</script>
