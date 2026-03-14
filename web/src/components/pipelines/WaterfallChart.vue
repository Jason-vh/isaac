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
      <p class="text-xs text-ink-muted">{{ hoveredBarKind === 'queue' ? 'queued' : hoveredJob.stage }}</p>
      <div class="mt-1 flex items-center gap-3 text-xs">
        <template v-if="hoveredBarKind === 'queue'">
          <span class="font-mono text-amber-500">
            Queued: {{ formatDuration(hoveredJob.queuedDurationSeconds!) }}
          </span>
        </template>
        <template v-else>
          <span :class="statusTextColor(hoveredJob.status)">{{ hoveredJob.status }}</span>
          <span v-if="hoveredJob.durationSeconds != null" class="font-mono text-ink-muted">
            {{ formatDuration(hoveredJob.durationSeconds) }}
          </span>
          <span v-if="hoveredJob.queuedDurationSeconds" class="font-mono text-amber-500">
            +{{ formatDuration(hoveredJob.queuedDurationSeconds) }} queued
          </span>
          <span v-if="hoveredJob.retried" class="text-amber-500">retried</span>
        </template>
      </div>
      <div v-if="criticalPath && !hoveredJob.retried && hoveredJob.durationSeconds != null" class="mt-1 text-xs">
        <span v-if="criticalPath.criticalJobs.has(hoveredJob.name)" class="font-medium text-amber-500">On critical path</span>
        <span v-else-if="criticalPath.slack.has(hoveredJob.name)" class="text-ink-faint">
          Slack: +{{ formatDuration(criticalPath.slack.get(hoveredJob.name)!) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import type { PipelineDetail, PipelineJobDetail } from "@isaac/shared";
import GanttChart from "./GanttChart.vue";
import type { GanttStage, GanttTick, GanttBar, GanttRow } from "./gantt-types";
import { computeCriticalPath } from "../../composables/useCriticalPath";

const HIDDEN_STAGES = new Set(["security"]);

const props = defineProps<{
  pipeline: PipelineDetail;
  search?: string;
  showCriticalPath?: boolean;
}>();

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
const hoveredBarKind = ref<"queue" | "execution">("execution");
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
  const barData = data as { kind?: "queue" | "execution"; job: PipelineJobDetail } | PipelineJobDetail;
  if ("kind" in barData && barData.kind) {
    hoveredBarKind.value = barData.kind;
    hoveredJob.value = barData.job;
  } else {
    hoveredBarKind.value = "execution";
    hoveredJob.value = barData as PipelineJobDetail;
  }
}

function onBarLeave() {
  hoveredJob.value = null;
  hoveredBarKind.value = "execution";
}

// --- Timeline helpers ---

const visibleJobs = computed(() =>
  props.pipeline.jobs.filter((j) => !HIDDEN_STAGES.has(j.stage) && j.status !== "manual")
);

const pipelineStart = computed(() => {
  const starts: number[] = [];
  for (const j of visibleJobs.value) {
    if (!j.startedAt) continue;
    const startMs = new Date(j.startedAt).getTime();
    if (j.queuedDurationSeconds && j.queuedDurationSeconds > 0) {
      starts.push(startMs - j.queuedDurationSeconds * 1000);
    } else {
      starts.push(startMs);
    }
  }
  if (starts.length > 0) return Math.min(...starts);
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

const criticalPath = computed(() => {
  if (!props.showCriticalPath) return null;
  return computeCriticalPath(visibleJobs.value, pipelineStart.value, pipelineEnd.value);
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

        const cp = criticalPath.value;
        const isCritical = cp ? cp.criticalJobs.has(name) : undefined;

        const bars: GanttBar[] = [];
        for (const job of rowJobs) {
          if (!job.startedAt || !job.finishedAt) {
            bars.push({
              key: `job-${job.id}`,
              startPct: 0,
              widthPct: 0,
              color: "#9CA3AF",
              opacity: 1,
              dot: true,
              data: { kind: "execution" as const, job },
            });
            continue;
          }
          // Queue bar (before execution)
          if (job.queuedDurationSeconds && job.queuedDurationSeconds > 0) {
            const queueStart = jobStart(job) - job.queuedDurationSeconds;
            bars.push({
              key: `queue-${job.id}`,
              startPct: (queueStart / dur) * 100,
              widthPct: (job.queuedDurationSeconds / dur) * 100,
              color: "#F59E0B",
              opacity: 0.5,
              data: { kind: "queue" as const, job },
            });
          }
          // Execution bar
          const start = jobStart(job);
          const width = jobDuration(job);
          bars.push({
            key: `job-${job.id}`,
            startPct: (start / dur) * 100,
            widthPct: (width / dur) * 100,
            color: job.retried ? "#FBBF24" : statusToColor(job.status),
            opacity: 1,
            dashed: job.status === "skipped",
            highlight: isCritical === true && !job.retried,
            data: { kind: "execution" as const, job },
          });
        }

        const hasRetried = rowJobs.some((j) => j.retried);
        return {
          key: name,
          name,
          bars,
          labelClass: hasRetried ? "text-amber-600" : undefined,
          onCriticalPath: isCritical,
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
