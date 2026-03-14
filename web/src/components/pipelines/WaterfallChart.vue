<template>
  <div class="relative">
    <GanttChart
      :stages="stages"
      :ticks="ticks"
      @bar-enter="onBarEnter"
      @bar-leave="onBarLeave"
    />

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
import { computed, ref, onMounted, onUnmounted } from "vue";
import type { PipelineDetail, PipelineJobDetail } from "@isaac/shared";
import GanttChart from "./GanttChart.vue";
import type { GanttStage, GanttTick, GanttBar, GanttRow } from "./gantt-types";

const HIDDEN_STAGES = new Set(["security"]);

const props = defineProps<{ pipeline: PipelineDetail; search?: string }>();

const searchTerms = computed(() =>
  (props.search ?? "").toLowerCase().split(/\s+/).filter(Boolean)
);

function isMatch(name: string): boolean {
  if (searchTerms.value.length === 0) return true;
  const lower = name.toLowerCase();
  return searchTerms.value.some((term) => lower.includes(term));
}

// --- Tooltip state ---

const hoveredJob = ref<PipelineJobDetail | null>(null);
const mouseX = ref(0);
const mouseY = ref(0);

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

function onBarEnter(data: unknown) {
  hoveredJob.value = data as PipelineJobDetail;
}

function onBarLeave() {
  hoveredJob.value = null;
}

// --- Timeline helpers ---

const visibleJobs = computed(() =>
  props.pipeline.jobs.filter((j) => !HIDDEN_STAGES.has(j.stage) && j.status !== "manual")
);

const pipelineStart = computed(() => {
  const jobStarts = visibleJobs.value
    .filter((j) => j.startedAt)
    .map((j) => new Date(j.startedAt!).getTime());
  if (jobStarts.length > 0) return Math.min(...jobStarts);
  if (props.pipeline.startedAt) return new Date(props.pipeline.startedAt).getTime();
  return 0;
});

const pipelineEnd = computed(() => {
  const jobEnds = visibleJobs.value
    .filter((j) => j.finishedAt)
    .map((j) => new Date(j.finishedAt!).getTime());
  if (jobEnds.length > 0) return Math.max(...jobEnds);
  if (props.pipeline.finishedAt) return new Date(props.pipeline.finishedAt).getTime();
  return pipelineStart.value + (props.pipeline.durationSeconds || 1) * 1000;
});

const totalDuration = computed(() => {
  return Math.max((pipelineEnd.value - pipelineStart.value) / 1000, 1);
});

function jobStart(job: PipelineJobDetail): number {
  if (!job.startedAt) return 0;
  return (new Date(job.startedAt).getTime() - pipelineStart.value) / 1000;
}

function jobDuration(job: PipelineJobDetail): number {
  if (!job.startedAt || !job.finishedAt) return 0;
  return (new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) / 1000;
}

function statusToColor(status: string): string {
  switch (status) {
    case "success": return "#10B981";
    case "failed": return "#EF4444";
    case "canceled": return "#9CA3AF";
    case "manual": return "#6B7280";
    default: return "#60A5FA";
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

// --- Build GanttStage[] from pipeline data ---

const stages = computed<GanttStage[]>(() => {
  const dur = totalDuration.value;
  const jobs = visibleJobs.value;

  // Collect visible job names for dep filtering
  const visibleNames = new Set(jobs.map((j) => j.name));

  const stageMap = new Map<string, PipelineJobDetail[]>();
  const stageOrder: string[] = [];

  for (const job of jobs) {
    if (!stageMap.has(job.stage)) {
      stageMap.set(job.stage, []);
      stageOrder.push(job.stage);
    }
    stageMap.get(job.stage)!.push(job);
  }

  // Sort stages by earliest start
  stageOrder.sort((a, b) => {
    const aJobs = stageMap.get(a)!;
    const bJobs = stageMap.get(b)!;
    const aStart = Math.min(
      ...aJobs.filter((j) => j.startedAt).map((j) => new Date(j.startedAt!).getTime()),
      Infinity
    );
    const bStart = Math.min(
      ...bJobs.filter((j) => j.startedAt).map((j) => new Date(j.startedAt!).getTime()),
      Infinity
    );
    return aStart - bStart;
  });

  return stageOrder.map((stageName) => {
    const jobs = stageMap.get(stageName)!;

    // Group by job name into rows
    const rowMap = new Map<string, PipelineJobDetail[]>();
    const rowOrder: string[] = [];
    for (const job of jobs) {
      if (!rowMap.has(job.name)) {
        rowMap.set(job.name, []);
        rowOrder.push(job.name);
      }
      rowMap.get(job.name)!.push(job);
    }

    // Sort rows by earliest start
    rowOrder.sort((a, b) => {
      const aJobs = rowMap.get(a)!;
      const bJobs = rowMap.get(b)!;
      const aStart = Math.min(
        ...aJobs.filter((j) => j.startedAt).map((j) => new Date(j.startedAt!).getTime()),
        Infinity
      );
      const bStart = Math.min(
        ...bJobs.filter((j) => j.startedAt).map((j) => new Date(j.startedAt!).getTime()),
        Infinity
      );
      return aStart - bStart;
    });

    return {
      key: stageName,
      name: stageName,
      rows: rowOrder.map((name): GanttRow => {
        const rowJobs = rowMap.get(name)!;
        const nonRetried = rowJobs.find((j) => !j.retried);

        const bars: GanttBar[] = rowJobs.map((job) => {
          if (!job.startedAt || !job.finishedAt) {
            return {
              key: `job-${job.id}`,
              startPct: 0,
              widthPct: 0,
              color: "#9CA3AF",
              opacity: 1,
              dot: true,
              data: job,
            };
          }
          const start = jobStart(job);
          const width = jobDuration(job);
          return {
            key: `job-${job.id}`,
            startPct: (start / dur) * 100,
            widthPct: (width / dur) * 100,
            color: job.retried ? "#FBBF24" : statusToColor(job.status),
            opacity: 1,
            dashed: job.status === "skipped",
            data: job,
          };
        });

        const hasRetried = rowJobs.some((j) => j.retried);
        return {
          key: name,
          name,
          bars,
          labelClass: hasRetried ? "text-amber-600" : undefined,
          deps: nonRetried?.needs?.filter((n) => visibleNames.has(n)) ?? [],
          depFromPct:
            nonRetried?.startedAt && nonRetried?.finishedAt
              ? ((jobStart(nonRetried) + jobDuration(nonRetried)) / dur) * 100
              : undefined,
          depToPct:
            nonRetried?.startedAt
              ? (jobStart(nonRetried) / dur) * 100
              : undefined,
        };
      }).map((row) => ({ ...row, hidden: !isMatch(row.name) })),
    };
  });
});

// --- Time axis ticks ---

const ticks = computed<GanttTick[]>(() => {
  const dur = totalDuration.value;
  if (dur <= 0) return [];

  let interval: number;
  if (dur <= 120) interval = 30;
  else if (dur <= 600) interval = 60;
  else if (dur <= 1800) interval = 300;
  else interval = 600;

  const result: GanttTick[] = [];
  for (let t = 0; t <= dur; t += interval) {
    result.push({
      pct: (t / dur) * 100,
      label: formatDuration(t),
    });
  }
  return result;
});
</script>
