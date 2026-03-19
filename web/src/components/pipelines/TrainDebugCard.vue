<template>
  <div class="card overflow-hidden">
    <div class="border-b border-border px-4 py-3">
      <h3 class="text-xs font-semibold uppercase tracking-wider text-ink-faint">
        Train Debug
        <span class="ml-1 font-normal">{{ attempts.length }}</span>
      </h3>
    </div>

    <div v-if="loading" class="p-4 text-sm text-ink-faint animate-pulse">
      Loading train ancestry...
    </div>

    <div v-else-if="attempts.length === 0" class="p-4 text-sm text-ink-faint">
      No merge-train attempts found for this MR.
    </div>

    <div v-else class="divide-y divide-border">
      <div v-for="(attempt, idx) in attempts" :key="attempt.pipelineId" class="px-4 py-4">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold text-ink">Run #{{ idx + 1 }}</span>
          <span
            class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
            :class="statusBadgeColor(attempt.status)"
          >
            {{ attempt.status }}
          </span>
          <span
            class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
            :class="outcomeBadgeColor(attempt.outcome)"
          >
            {{ outcomeLabel(attempt.outcome) }}
          </span>
          <span
            class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
            :class="positionBadgeColor(attempt.position)"
          >
            {{ positionLabel(attempt.position) }}
          </span>
          <span class="ml-auto font-mono text-xs text-ink-muted">
            {{ fmtDate(attempt.createdAt) }}
          </span>
        </div>

        <div class="mt-3 grid gap-3 text-sm text-ink-muted md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div class="space-y-2">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span class="font-mono text-xs text-ink">
                {{ attempt.sha ? shortSha(attempt.sha) : "unknown sha" }}
              </span>
              <span v-if="attempt.durationSeconds != null" class="font-mono text-xs">
                {{ fmtDuration(attempt.durationSeconds) }}
              </span>
              <span v-if="attempt.parentSha" class="font-mono text-xs text-ink-faint">
                parent {{ shortSha(attempt.parentSha) }}
              </span>
            </div>

            <div>
              <span class="text-ink-faint">Base:</span>
              <span class="ml-1 text-ink">{{ basedOnLabel(attempt) }}</span>
            </div>

            <div v-if="attempt.invalidation" class="rounded-lg border border-border bg-surface-1 px-3 py-2">
              <div class="font-medium text-ink">Why this run was replaced</div>
              <div class="mt-1">{{ attempt.invalidation.summary }}</div>
              <div
                v-if="attempt.invalidation.blockingJob?.name"
                class="mt-2 font-mono text-xs text-ink-faint"
              >
                {{ attempt.invalidation.blockingJob.name }}
                <span v-if="attempt.invalidation.blockingJob.failureReason">
                  · {{ attempt.invalidation.blockingJob.failureReason }}
                </span>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <a
              :href="attempt.webUrl"
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-0 px-2.5 py-1.5 text-xs text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors"
            >
              Pipeline
              <ArrowTopRightOnSquareIcon class="h-3.5 w-3.5" />
            </a>
            <a
              v-if="attempt.invalidation?.upstreamPipelineWebUrl"
              :href="attempt.invalidation.upstreamPipelineWebUrl"
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-0 px-2.5 py-1.5 text-xs text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors"
            >
              Upstream
              <ArrowTopRightOnSquareIcon class="h-3.5 w-3.5" />
            </a>
            <a
              v-if="attempt.invalidation?.blockingJob?.webUrl"
              :href="attempt.invalidation.blockingJob.webUrl"
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-0 px-2.5 py-1.5 text-xs text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors"
            >
              Blocking job
              <ArrowTopRightOnSquareIcon class="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TrainDebugAttempt } from "@isaac/shared";
import { ArrowTopRightOnSquareIcon } from "@heroicons/vue/20/solid";

defineProps<{
  attempts: TrainDebugAttempt[];
  loading: boolean;
}>();

function shortSha(sha: string): string {
  return sha.slice(0, 8);
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

function statusBadgeColor(status: string): string {
  switch (status) {
    case "success": return "bg-emerald-100 text-emerald-700";
    case "failed": return "bg-red-100 text-red-700";
    case "canceled": return "bg-gray-100 text-gray-600";
    case "running": return "bg-blue-100 text-blue-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

function outcomeLabel(outcome: TrainDebugAttempt["outcome"]): string {
  switch (outcome) {
    case "merged": return "merged";
    case "superseded": return "superseded";
    case "active": return "active";
    default: return "completed";
  }
}

function outcomeBadgeColor(outcome: TrainDebugAttempt["outcome"]): string {
  switch (outcome) {
    case "merged": return "bg-emerald-100 text-emerald-700";
    case "superseded": return "bg-amber-100 text-amber-700";
    case "active": return "bg-blue-100 text-blue-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

function positionLabel(position: TrainDebugAttempt["position"]): string {
  switch (position) {
    case "front_of_train": return "front of train";
    case "behind_other_mr": return "behind another MR";
    default: return "unknown position";
  }
}

function positionBadgeColor(position: TrainDebugAttempt["position"]): string {
  switch (position) {
    case "front_of_train": return "bg-blue-100 text-blue-700";
    case "behind_other_mr": return "bg-violet-100 text-violet-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

function basedOnLabel(attempt: TrainDebugAttempt): string {
  if (attempt.basedOn.kind === "merge_request" && attempt.basedOn.mrIid) {
    const suffix = attempt.basedOn.title ? ` ${attempt.basedOn.title}` : "";
    return `!${attempt.basedOn.mrIid}${suffix}`;
  }
  if (attempt.basedOn.kind === "main") {
    if (attempt.basedOn.mrIid && attempt.basedOn.title) {
      return `main after !${attempt.basedOn.mrIid} ${attempt.basedOn.title}`;
    }
    if (attempt.basedOn.title) return `main (${attempt.basedOn.title})`;
    return "main";
  }
  return "unknown";
}
</script>
