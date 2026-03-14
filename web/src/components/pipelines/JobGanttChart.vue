<template>
  <div class="card overflow-hidden">
    <div class="flex items-center gap-3 border-b border-border px-4 py-3">
      <h3 class="text-xs font-semibold uppercase tracking-wider text-ink-faint">
        Pipeline Structure
      </h3>
      <div class="ml-auto flex items-center gap-3">
        <input
          v-model="search"
          type="text"
          placeholder="Filter jobs..."
          class="w-48 rounded border border-border bg-surface px-2 py-1 text-xs text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
        />
      </div>
      <div class="flex items-center gap-3 text-[10px] text-ink-faint">
        <span class="flex items-center gap-1">
          <span class="inline-block h-2.5 w-5 rounded-sm" style="background: #93C5FD" />
          &lt; 5%
        </span>
        <span class="flex items-center gap-1">
          <span class="inline-block h-2.5 w-5 rounded-sm" style="background: #FBBF24" />
          5–15%
        </span>
        <span class="flex items-center gap-1">
          <span class="inline-block h-2.5 w-5 rounded-sm" style="background: #F87171" />
          &gt; 15%
        </span>
        <span class="text-ink-faint">retry rate</span>
      </div>
    </div>

    <div v-if="loading" class="p-4 space-y-2">
      <div v-for="i in 8" :key="i" class="flex items-center gap-3">
        <div class="h-4 w-36 animate-pulse rounded bg-surface-2" />
        <div
          class="h-4 animate-pulse rounded bg-surface-2"
          :style="{ width: (20 + Math.random() * 30) + '%', marginLeft: (Math.random() * 15) + '%' }"
        />
      </div>
    </div>
    <div v-else-if="scheduling.stages.length === 0" class="p-4 text-sm text-ink-faint">
      No job data.
    </div>
    <div v-else class="relative">
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
          <span class="font-mono text-ink-muted">P50: {{ fmtDuration(hoveredJob.p50) }}</span>
          <span :class="hoveredJob.retryRate >= 15 ? 'text-red-500' : hoveredJob.retryRate >= 5 ? 'text-amber-500' : 'text-ink-faint'">
            {{ hoveredJob.retryRate.toFixed(1) }}% retry
          </span>
          <span class="text-ink-faint">{{ hoveredJob.runCount }} runs</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import type { JobStats } from "@isaac/shared";
import GanttChart from "./GanttChart.vue";
import type { GanttStage, GanttTick, GanttBar, GanttRow } from "./gantt-types";

interface JobTooltipData {
  name: string;
  stage: string;
  p50: number;
  retryRate: number;
  runCount: number;
}

const HIDDEN_STAGES = new Set(["security"]);

const props = defineProps<{
  jobs: JobStats[];
  loading: boolean;
}>();

// --- Tooltip state ---

const hoveredJob = ref<JobTooltipData | null>(null);
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
  hoveredJob.value = data as JobTooltipData;
}

function onBarLeave() {
  hoveredJob.value = null;
}

const search = ref("");
const searchTerms = computed(() =>
  search.value.toLowerCase().split(/\s+/).filter(Boolean)
);

function isMatch(name: string): boolean {
  if (searchTerms.value.length === 0) return true;
  const lower = name.toLowerCase();
  return searchTerms.value.some((term) => lower.includes(term));
}

function retryColor(retryRate: number): string {
  if (retryRate < 5) return "#93C5FD";
  if (retryRate < 15) return "#FBBF24";
  return "#F87171";
}

function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "--";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

// --- Scheduling: compute stage order and simulated job positions ---

const scheduling = computed(() => {
  const jobs = props.jobs.filter((j) => !HIDDEN_STAGES.has(j.stage));
  if (jobs.length === 0) return { stages: [] as GanttStage[], maxTime: 0 };

  const jobMap = new Map(jobs.map((j) => [j.name, j]));

  // Derive stage order from cross-stage dependencies (topological sort)
  const stageSet = new Set(jobs.map((j) => j.stage));
  const stageEdges = new Map<string, Set<string>>();
  for (const s of stageSet) stageEdges.set(s, new Set());

  for (const j of jobs) {
    for (const dep of j.needs) {
      const depJob = jobMap.get(dep);
      if (depJob && depJob.stage !== j.stage) {
        stageEdges.get(j.stage)!.add(depJob.stage);
      }
    }
  }

  // Kahn's algorithm
  const inDegree = new Map<string, number>();
  for (const s of stageSet) inDegree.set(s, stageEdges.get(s)!.size);

  const queue: string[] = [];
  for (const [s, d] of inDegree) {
    if (d === 0) queue.push(s);
  }

  const stageOrder: string[] = [];
  while (queue.length > 0) {
    const s = queue.shift()!;
    stageOrder.push(s);
    for (const [stage, deps] of stageEdges) {
      if (deps.has(s)) {
        deps.delete(s);
        inDegree.set(stage, (inDegree.get(stage) ?? 0) - 1);
        if (inDegree.get(stage) === 0) queue.push(stage);
      }
    }
  }
  for (const s of stageSet) {
    if (!stageOrder.includes(s)) stageOrder.push(s);
  }

  // Group jobs by stage
  const byStage = new Map<string, JobStats[]>();
  for (const j of jobs) {
    if (!byStage.has(j.stage)) byStage.set(j.stage, []);
    byStage.get(j.stage)!.push(j);
  }

  // Resolve deps (filter to known jobs only)
  const resolvedDeps = new Map<string, string[]>();
  for (const j of jobs) {
    resolvedDeps.set(j.name, j.needs.filter((n) => jobMap.has(n)));
  }

  // Simulate scheduling: compute start/end times from P50 durations
  const endTimes = new Map<string, number>();
  const startTimes = new Map<string, number>();

  function resolve(name: string): number {
    if (endTimes.has(name)) return endTimes.get(name)!;
    const job = jobMap.get(name);
    if (!job) return 0;

    const deps = resolvedDeps.get(name) || [];
    const start = deps.length > 0 ? Math.max(...deps.map(resolve)) : 0;
    const duration = job.p50Duration ?? job.avgDuration;

    startTimes.set(name, start);
    endTimes.set(name, start + duration);
    return start + duration;
  }

  for (const j of jobs) resolve(j.name);

  const totalDuration = Math.max(...[...endTimes.values()], 1);

  // Sort jobs within each stage by start time
  for (const [, stageJobs] of byStage) {
    stageJobs.sort((a, b) => (startTimes.get(a.name) ?? 0) - (startTimes.get(b.name) ?? 0));
  }

  // Build GanttStage[]
  const ganttStages: GanttStage[] = [];

  for (const stageName of stageOrder) {
    const stageJobs = byStage.get(stageName);
    if (!stageJobs?.length) continue;

    const rows: GanttRow[] = stageJobs.map((j) => {
      const start = startTimes.get(j.name) ?? 0;
      const end = endTimes.get(j.name) ?? 0;
      const totalRuns = j.runCount + j.retryCount;
      const retryRate = totalRuns > 0 ? (j.retryCount / totalRuns) * 100 : 0;
      const p50 = j.p50Duration ?? j.avgDuration;

      const bar: GanttBar = {
        key: j.name,
        startPct: (start / totalDuration) * 100,
        widthPct: ((end - start) / totalDuration) * 100,
        color: retryColor(retryRate),
        opacity: 1,
        data: { name: j.name, stage: j.stage, p50, retryRate, runCount: j.runCount } satisfies JobTooltipData,
      };

      return {
        key: j.name,
        name: j.name,
        bars: [bar],
        deps: resolvedDeps.get(j.name) || [],
      };
    });

    ganttStages.push({ key: stageName, name: stageName, rows });
  }

  return { stages: ganttStages, maxTime: totalDuration };
});

// --- Apply search filtering (marks non-matching rows as hidden) ---

const stages = computed<GanttStage[]>(() =>
  scheduling.value.stages.map((stage) => ({
    ...stage,
    rows: stage.rows.map((row) => ({
      ...row,
      hidden: !isMatch(row.name),
    })),
  }))
);

// --- Time axis ticks ---

const ticks = computed<GanttTick[]>(() => {
  const maxSeconds = scheduling.value.maxTime;
  if (maxSeconds <= 0) return [];
  const maxMinutes = maxSeconds / 60;

  let interval: number;
  if (maxMinutes <= 5) interval = 1;
  else if (maxMinutes <= 15) interval = 2;
  else if (maxMinutes <= 30) interval = 5;
  else if (maxMinutes <= 60) interval = 10;
  else interval = 15;

  const result: GanttTick[] = [];
  for (let m = 0; m <= maxMinutes + interval; m += interval) {
    const pct = ((m * 60) / maxSeconds) * 100;
    result.push({ pct, label: `${m}m` });
    if (pct > 100) break;
  }
  return result;
});
</script>
