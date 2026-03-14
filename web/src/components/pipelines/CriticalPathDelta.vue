<template>
  <div class="card overflow-hidden">
    <div class="border-b border-border px-4 py-3">
      <h3 class="text-xs font-semibold uppercase tracking-wider text-ink-faint">
        Critical Path Delta
      </h3>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="px-4 py-6">
      <div class="flex items-center gap-3">
        <div class="h-5 w-32 animate-pulse rounded bg-surface-2" />
        <div class="h-5 flex-1 animate-pulse rounded bg-surface-2" />
      </div>
    </div>

    <!-- No previous period -->
    <div v-else-if="!decomposition" class="px-4 py-6 text-sm text-ink-faint">
      No previous period to compare.
    </div>

    <!-- Negligible change -->
    <div v-else-if="Math.abs(decomposition.totalDeltaSeconds) < 10" class="px-4 py-6 text-sm text-ink-faint">
      Pipeline duration unchanged between periods.
    </div>

    <!-- Delta waterfall -->
    <div v-else class="px-4 py-4">
      <!-- Path changed banner -->
      <div v-if="decomposition.pathChanged" class="mb-3 rounded border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-600">
        Critical path changed
        <template v-if="decomposition.droppedJobs.length"> — {{ decomposition.droppedJobs.length }} job{{ decomposition.droppedJobs.length > 1 ? 's' : '' }} dropped off</template>
        <template v-if="decomposition.droppedJobs.length && decomposition.newJobs.length">,</template>
        <template v-if="decomposition.newJobs.length"> {{ decomposition.newJobs.length }} job{{ decomposition.newJobs.length > 1 ? 's' : '' }} added</template>
      </div>

      <!-- Summary line -->
      <div class="mb-3 flex items-baseline gap-2">
        <span class="text-sm font-medium" :class="decomposition.totalDeltaSeconds > 0 ? 'text-red-500' : 'text-emerald-600'">
          {{ decomposition.totalDeltaSeconds > 0 ? '+' : '' }}{{ fmtDuration(decomposition.totalDeltaSeconds) }}
        </span>
        <span class="text-xs text-ink-faint">
          wall-clock change ({{ fmtDuration(decomposition.prevMaxTime ?? 0) }} → {{ fmtDuration(decomposition.currentMaxTime) }})
        </span>
      </div>

      <!-- Waterfall bars -->
      <div class="relative" style="height: 48px">
        <div
          v-for="(seg, i) in visibleSegments"
          :key="seg.jobName"
          class="absolute top-0 flex flex-col items-center justify-center"
          :style="barStyle(seg, i)"
        >
          <!-- Bar -->
          <div
            class="h-6 w-full rounded-sm"
            :style="{ background: seg.ownContribution > 0 ? '#EF4444' : '#10B981' }"
          />
          <!-- Label below -->
          <div class="mt-1 flex flex-col items-center overflow-hidden" style="max-width: 100%">
            <span class="truncate text-[10px] text-ink-muted" style="max-width: 100%">{{ seg.jobName }}</span>
            <span class="text-[10px] font-mono tabular-nums" :class="seg.ownContribution > 0 ? 'text-red-500' : 'text-emerald-600'">
              {{ seg.ownContribution > 0 ? '+' : '' }}{{ fmtDuration(seg.ownContribution) }}
            </span>
          </div>
        </div>
      </div>
      <!-- Reserve space for labels below bars -->
      <div style="height: 28px" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CriticalPathDecomposition, CriticalPathSegment } from "@isaac/shared";

const props = defineProps<{
  decomposition: CriticalPathDecomposition | null;
  loading: boolean;
}>();

function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "--";
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = Math.round(abs % 60);
  const sign = seconds < 0 ? "-" : "";
  return `${sign}${m}m ${s}s`;
}

// Only show segments with non-zero contribution
const visibleSegments = computed(() => {
  if (!props.decomposition) return [];
  return props.decomposition.segments.filter((s) => Math.abs(s.ownContribution) >= 1);
});

// Compute bar positioning: each bar width proportional to |ownContribution| / totalAbsContrib
// Laid out left to right in execution order
function barStyle(seg: CriticalPathSegment, index: number) {
  const segments = visibleSegments.value;
  const totalAbs = segments.reduce((sum, s) => sum + Math.abs(s.ownContribution), 0);
  if (totalAbs === 0) return { left: "0%", width: "0%" };

  // Compute left offset from all preceding segments
  let leftPct = 0;
  for (let i = 0; i < index; i++) {
    leftPct += (Math.abs(segments[i].ownContribution) / totalAbs) * 100;
  }

  const widthPct = (Math.abs(seg.ownContribution) / totalAbs) * 100;
  // Minimum 4px via min-width, but use percent for layout
  return {
    left: `${leftPct}%`,
    width: `${Math.max(widthPct, 1)}%`,
    minWidth: "4px",
  };
}
</script>
