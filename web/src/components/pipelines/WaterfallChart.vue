<template>
  <div class="relative overflow-x-auto">
    <!-- Time ruler -->
    <div class="relative ml-[180px] h-6 border-b border-border">
      <div
        v-for="mark in timeMarks"
        :key="mark.seconds"
        class="absolute top-0 flex h-full flex-col justify-end"
        :style="{ left: `${pct(mark.seconds)}%` }"
      >
        <span class="text-[10px] text-ink-faint -translate-x-1/2">{{ mark.label }}</span>
        <div class="mx-auto h-2 w-px bg-border" />
      </div>
    </div>

    <!-- Stages and jobs -->
    <div ref="chartArea">
      <div v-for="stage in stages" :key="stage.name" class="mt-2">
        <div class="flex items-center gap-2 px-2 py-1">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            {{ stage.name }}
          </span>
        </div>
        <div
          v-for="row in stage.rows"
          :key="row.name"
          :ref="(el) => setRowRef(row.name, el as HTMLElement)"
          class="group relative flex h-7 items-center"
        >
          <!-- Job name -->
          <div class="w-[180px] flex-shrink-0 truncate px-2 text-xs text-ink-muted" :title="row.name">
            {{ row.name }}
          </div>

          <!-- Bar area -->
          <div class="relative h-5 flex-1">
            <!-- Vertical grid lines -->
            <div
              v-for="mark in timeMarks"
              :key="`grid-${mark.seconds}`"
              class="absolute top-0 h-full w-px bg-border/30"
              :style="{ left: `${pct(mark.seconds)}%` }"
            />

            <!-- All attempts for this job -->
            <template v-for="job in row.jobs" :key="job.id">
              <!-- Job bar -->
              <div
                v-if="job.startedAt && job.finishedAt"
                class="absolute top-0.5 h-4 rounded"
                :class="[statusColor(job.status), { 'opacity-40': job.retried }]"
                :style="{
                  left: `${pct(jobStart(job))}%`,
                  width: `max(3px, ${pct(jobDuration(job))}%)`,
                }"
                @mouseenter="hoveredJob = job"
                @mouseleave="hoveredJob = null"
              />
              <!-- No-timestamp indicator -->
              <div
                v-else
                class="absolute left-0 top-1 h-3 w-3 rounded-full border-2"
                :class="noTimestampStyle(job.status)"
                @mouseenter="hoveredJob = job"
                @mouseleave="hoveredJob = null"
              />
            </template>
          </div>
        </div>
      </div>

      <!-- Dependency lines SVG overlay -->
      <svg
        v-if="depLines.length > 0"
        class="pointer-events-none absolute inset-0"
        :style="{ width: '100%', height: '100%' }"
      >
        <path
          v-for="(line, i) in depLines"
          :key="i"
          :d="line.d"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
          class="text-ink-faint/40"
        />
      </svg>
    </div>

    <!-- Tooltip -->
    <div
      v-if="hoveredJob"
      class="pointer-events-none fixed z-50 rounded-lg border border-border bg-surface-0 px-3 py-2 shadow-lg"
      :style="tooltipStyle"
    >
      <p class="text-sm font-medium text-ink">{{ hoveredJob.name }}</p>
      <p class="text-xs text-ink-muted">{{ hoveredJob.stage }}</p>
      <div class="mt-1 flex items-center gap-3 text-xs">
        <span :class="statusTextColor(hoveredJob.status)">{{ hoveredJob.status }}</span>
        <span v-if="hoveredJob.durationSeconds != null" class="font-mono text-ink-muted">
          {{ formatDuration(hoveredJob.durationSeconds) }}
        </span>
        <span v-if="hoveredJob.retried" class="text-amber-500">retried</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onUnmounted, watch } from "vue";
import type { PipelineDetail, PipelineJobDetail } from "@isaac/shared";

const props = defineProps<{ pipeline: PipelineDetail }>();

const hoveredJob = ref<PipelineJobDetail | null>(null);
const mouseX = ref(0);
const mouseY = ref(0);
const chartArea = ref<HTMLElement | null>(null);
const rowRefs = new Map<string, HTMLElement>();

function setRowRef(name: string, el: HTMLElement | null) {
  if (el) rowRefs.set(name, el);
}

function onMouseMove(e: MouseEvent) {
  mouseX.value = e.clientX;
  mouseY.value = e.clientY;
}

onMounted(() => window.addEventListener("mousemove", onMouseMove));
onUnmounted(() => window.removeEventListener("mousemove", onMouseMove));

const tooltipStyle = computed(() => ({
  left: `${mouseX.value + 12}px`,
  top: `${mouseY.value - 40}px`,
}));

const pipelineStart = computed(() => {
  if (!props.pipeline.startedAt) return 0;
  return new Date(props.pipeline.startedAt).getTime();
});

const totalDuration = computed(() => {
  if (!props.pipeline.startedAt || !props.pipeline.finishedAt) {
    return props.pipeline.durationSeconds || 1;
  }
  return (new Date(props.pipeline.finishedAt).getTime() - pipelineStart.value) / 1000;
});

const timeMarks = computed(() => {
  const dur = totalDuration.value;
  const marks: { seconds: number; label: string }[] = [];
  let interval: number;
  if (dur <= 120) interval = 30;
  else if (dur <= 600) interval = 60;
  else if (dur <= 1800) interval = 300;
  else interval = 600;

  for (let t = 0; t <= dur; t += interval) {
    marks.push({ seconds: t, label: formatDuration(t) });
  }
  return marks;
});

interface JobRow {
  name: string;
  jobs: PipelineJobDetail[]; // multiple if retried
}

interface StageGroup {
  name: string;
  rows: JobRow[];
}

const stages = computed<StageGroup[]>(() => {
  const stageMap = new Map<string, PipelineJobDetail[]>();
  const stageOrder: string[] = [];

  for (const job of props.pipeline.jobs) {
    if (!stageMap.has(job.stage)) {
      stageMap.set(job.stage, []);
      stageOrder.push(job.stage);
    }
    stageMap.get(job.stage)!.push(job);
  }

  // Sort stages by earliest startedAt
  stageOrder.sort((a, b) => {
    const aJobs = stageMap.get(a)!;
    const bJobs = stageMap.get(b)!;
    const aStart = Math.min(...aJobs.filter(j => j.startedAt).map(j => new Date(j.startedAt!).getTime()), Infinity);
    const bStart = Math.min(...bJobs.filter(j => j.startedAt).map(j => new Date(j.startedAt!).getTime()), Infinity);
    return aStart - bStart;
  });

  return stageOrder.map((stageName) => {
    const jobs = stageMap.get(stageName)!;
    // Group jobs by name into rows
    const rowMap = new Map<string, PipelineJobDetail[]>();
    const rowOrder: string[] = [];
    for (const job of jobs) {
      if (!rowMap.has(job.name)) {
        rowMap.set(job.name, []);
        rowOrder.push(job.name);
      }
      rowMap.get(job.name)!.push(job);
    }
    // Sort rows by earliest startedAt
    rowOrder.sort((a, b) => {
      const aJobs = rowMap.get(a)!;
      const bJobs = rowMap.get(b)!;
      const aStart = Math.min(...aJobs.filter(j => j.startedAt).map(j => new Date(j.startedAt!).getTime()), Infinity);
      const bStart = Math.min(...bJobs.filter(j => j.startedAt).map(j => new Date(j.startedAt!).getTime()), Infinity);
      return aStart - bStart;
    });
    return {
      name: stageName,
      rows: rowOrder.map((name) => ({ name, jobs: rowMap.get(name)! })),
    };
  });
});

// ---------------------------------------------------------------------------
// Dependency lines between jobs with `needs`
// ---------------------------------------------------------------------------

interface DepLine {
  d: string;
}

const depLines = ref<DepLine[]>([]);

function computeDepLines() {
  if (!chartArea.value) {
    depLines.value = [];
    return;
  }

  const chartRect = chartArea.value.getBoundingClientRect();
  const lines: DepLine[] = [];

  // Build lookup: job name → latest non-retried job
  const latestJob = new Map<string, PipelineJobDetail>();
  for (const job of props.pipeline.jobs) {
    if (job.retried) continue;
    latestJob.set(job.name, job);
  }

  for (const [name, job] of latestJob) {
    if (!job.needs || job.needs.length === 0) continue;
    if (!job.startedAt || !job.finishedAt) continue;

    const toRow = rowRefs.get(name);
    if (!toRow) continue;
    const toRect = toRow.getBoundingClientRect();
    const toY = toRect.top + toRect.height / 2 - chartRect.top;

    // Bar area starts after the 180px label
    const barAreaEl = toRow.querySelector('.relative.flex-1') as HTMLElement;
    if (!barAreaEl) continue;
    const barAreaRect = barAreaEl.getBoundingClientRect();
    const barAreaLeft = barAreaRect.left - chartRect.left;
    const barAreaWidth = barAreaRect.width;

    // Target job left edge (start of its bar)
    const toX = barAreaLeft + (jobStart(job) / totalDuration.value) * barAreaWidth;

    for (const needName of job.needs) {
      const needJob = latestJob.get(needName);
      if (!needJob || !needJob.startedAt || !needJob.finishedAt) continue;

      const fromRow = rowRefs.get(needName);
      if (!fromRow) continue;
      const fromRect = fromRow.getBoundingClientRect();
      const fromY = fromRect.top + fromRect.height / 2 - chartRect.top;

      const fromBarArea = fromRow.querySelector('.relative.flex-1') as HTMLElement;
      if (!fromBarArea) continue;
      const fromBarRect = fromBarArea.getBoundingClientRect();
      const fromBarLeft = fromBarRect.left - chartRect.left;
      const fromBarWidth = fromBarRect.width;

      // Source job right edge (end of its bar)
      const fromX = fromBarLeft + ((jobStart(needJob) + jobDuration(needJob)) / totalDuration.value) * fromBarWidth;

      // Cubic bezier curve
      const midX = (fromX + toX) / 2;
      lines.push({
        d: `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`,
      });
    }
  }

  depLines.value = lines;
}

watch(
  () => props.pipeline,
  async () => {
    await nextTick();
    computeDepLines();
  },
  { immediate: false }
);

onMounted(async () => {
  await nextTick();
  computeDepLines();
});

function pct(seconds: number): number {
  return (seconds / totalDuration.value) * 100;
}

function jobStart(job: PipelineJobDetail): number {
  if (!job.startedAt) return 0;
  return (new Date(job.startedAt).getTime() - pipelineStart.value) / 1000;
}

function jobDuration(job: PipelineJobDetail): number {
  if (!job.startedAt || !job.finishedAt) return 0;
  return (new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) / 1000;
}

function statusColor(status: string): string {
  switch (status) {
    case "success": return "bg-emerald-500";
    case "failed": return "bg-red-500";
    case "canceled": return "bg-gray-400";
    case "skipped": return "border border-dashed border-gray-400 bg-transparent";
    case "manual": return "bg-gray-500";
    default: return "bg-blue-400";
  }
}

function noTimestampStyle(status: string): string {
  switch (status) {
    case "skipped": return "border-gray-400";
    case "manual": return "border-gray-500 bg-gray-500/20";
    default: return "border-gray-400";
  }
}

function statusTextColor(status: string): string {
  switch (status) {
    case "success": return "text-emerald-500";
    case "failed": return "text-red-500";
    case "canceled": return "text-gray-400";
    default: return "text-ink-muted";
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
</script>
