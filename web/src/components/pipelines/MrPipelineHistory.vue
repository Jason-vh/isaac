<template>
  <div class="card overflow-hidden">
    <h3
      class="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-faint"
    >
      Pipeline Runs
      <span class="ml-1 font-normal">{{ pipelines.length }}</span>
    </h3>

    <div v-if="pipelines.length === 0" class="p-4 text-sm text-ink-faint">
      No pipelines found.
    </div>

    <div v-else class="divide-y divide-border">
      <router-link
        v-for="(p, idx) in chronological"
        :key="p.id"
        :to="{ name: 'pipeline-detail', params: { id: p.id } }"
        class="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-surface-1 transition-colors text-left"
        :class="idx === firstSuccessIndex ? 'ring-1 ring-inset ring-emerald-300 bg-emerald-50/40' : ''"
      >
        <!-- Left border color strip -->
        <span
          class="w-1 self-stretch rounded-full shrink-0"
          :class="statusBarColor(p.status)"
        />

        <!-- Run number -->
        <span class="shrink-0 text-xs font-semibold text-ink-muted tabular-nums w-8">
          #{{ idx + 1 }}
        </span>

        <!-- Status badge -->
        <span
          class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
          :class="statusBadgeColor(p.status)"
        >
          {{ p.status }}
        </span>

        <!-- Type badge -->
        <span
          class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
          :class="typeBadgeColor(p)"
        >
          {{ pipelineType(p) }}
        </span>

        <!-- Duration -->
        <span class="shrink-0 font-mono text-sm tabular-nums text-ink">
          {{ p.durationSeconds != null ? fmtDuration(p.durationSeconds) : '--' }}
        </span>

        <!-- Spacer -->
        <span class="flex-1" />

        <!-- Job counts -->
        <span class="shrink-0 text-xs text-ink-faint tabular-nums">
          {{ p.jobCount }} jobs
        </span>
        <span
          v-if="p.retriedJobCount > 0"
          class="shrink-0 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 tabular-nums"
        >
          {{ p.retriedJobCount }} retried
        </span>

        <!-- Date -->
        <span class="shrink-0 font-mono text-xs text-ink-muted tabular-nums">
          {{ fmtDate(p.gitlabCreatedAt) }}
        </span>

        <!-- GitLab link -->
        <a
          :href="p.webUrl"
          target="_blank"
          rel="noopener"
          class="shrink-0 text-ink-faint hover:text-ink transition-colors"
          @click.stop
        >
          <ArrowTopRightOnSquareIcon class="h-3.5 w-3.5" />
        </a>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { PipelineListItem } from "@isaac/shared";
import { ArrowTopRightOnSquareIcon } from "@heroicons/vue/20/solid";

const props = defineProps<{
  pipelines: PipelineListItem[];
  firstSuccessIndex: number;
}>();

// Sort oldest first for chronological timeline
const chronological = computed(() =>
  [...props.pipelines].sort(
    (a, b) => new Date(a.gitlabCreatedAt).getTime() - new Date(b.gitlabCreatedAt).getTime()
  )
);

function statusBarColor(status: string): string {
  switch (status) {
    case "success": return "bg-emerald-500";
    case "failed": return "bg-red-500";
    case "canceled": return "bg-gray-400";
    case "running": return "bg-blue-500";
    default: return "bg-gray-300";
  }
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

function pipelineType(p: PipelineListItem): string {
  if (!p.ref) return p.source ?? "unknown";
  if (p.ref.endsWith("/train")) return "train";
  if (p.ref.endsWith("/merge")) return "merge";
  if (p.ref.endsWith("/head")) return "head";
  return p.source ?? "unknown";
}

function typeBadgeColor(p: PipelineListItem): string {
  if (!p.ref) return "bg-gray-100 text-gray-600";
  if (p.ref.endsWith("/train")) return "bg-purple-100 text-purple-700";
  return "bg-blue-100 text-blue-700";
}

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
</script>
