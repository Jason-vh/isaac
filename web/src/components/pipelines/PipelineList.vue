<template>
  <div class="card overflow-hidden">
    <h3
      class="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-faint"
    >
      Pipelines
      <span class="ml-1 font-normal">{{ points.length }}</span>
    </h3>
    <div v-if="loading" class="divide-y divide-border">
      <div v-for="i in 8" :key="i" class="flex items-center gap-3 px-4 py-2.5">
        <div class="h-5 w-14 animate-pulse rounded-full bg-surface-2" />
        <div class="h-4 w-32 animate-pulse rounded bg-surface-2" />
        <div class="h-4 w-16 animate-pulse rounded bg-surface-2" />
        <div class="flex-1" />
        <div class="h-4 w-12 animate-pulse rounded bg-surface-2" />
      </div>
    </div>
    <div v-else-if="points.length === 0" class="p-4 text-sm text-ink-faint">
      No pipelines in this period.
    </div>
    <div v-else class="divide-y divide-border">
      <button
        v-for="p in sorted"
        :key="p.id"
        class="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-surface-1 transition-colors text-left"
        @click="router.push({ name: 'pipeline-detail', params: { id: p.id } })"
      >
        <!-- Type badge -->
        <span
          class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
          :class="p.type === 'train'
            ? 'bg-purple-100 text-purple-700'
            : 'bg-blue-100 text-blue-700'"
        >
          {{ p.type }}
        </span>

        <!-- Date -->
        <span class="shrink-0 font-mono text-xs text-ink-muted tabular-nums">
          {{ fmtDate(p.createdAt) }}
        </span>

        <!-- Duration -->
        <span class="shrink-0 font-mono text-sm tabular-nums text-ink">
          {{ fmtDuration(p.durationSeconds) }}
        </span>

        <!-- Spacer -->
        <span class="flex-1" />

        <!-- Retry badge -->
        <span
          v-if="p.retriedJobCount > 0"
          class="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
        >
          {{ p.retriedJobCount }} retried
        </span>

        <!-- Job count -->
        <span class="shrink-0 text-xs text-ink-faint">
          {{ p.jobCount }} jobs
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import type { PipelineDurationPoint } from "@isaac/shared";

const props = defineProps<{ points: PipelineDurationPoint[]; loading: boolean }>();
const router = useRouter();

const sorted = computed(() =>
  [...props.points].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
);

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}
</script>
