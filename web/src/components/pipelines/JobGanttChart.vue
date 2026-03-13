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
    <div v-else-if="scheduled.jobs.length === 0" class="p-4 text-sm text-ink-faint">
      No job data.
    </div>
    <div v-else>
      <div class="flex">
        <!-- Labels column -->
        <div class="w-48 shrink-0 border-r border-border">
          <div class="h-6" />
          <template v-for="item in filteredFlat" :key="item.key">
            <div
              v-if="item.type === 'stage'"
              class="flex items-center h-5 bg-surface-2 px-3"
            >
              <span class="text-[10px] font-medium uppercase tracking-wider text-ink-faint">
                {{ item.label }}
              </span>
            </div>
            <div v-else class="flex items-center h-7 px-3 transition-opacity" :class="item.matched ? '' : 'opacity-25'">
              <span class="truncate text-xs text-ink">{{ item.label }}</span>
            </div>
          </template>
        </div>

        <!-- Chart area -->
        <div ref="chartRef" class="flex-1 relative min-w-0">
          <!-- Time axis -->
          <div class="relative h-6 border-b border-border">
            <div
              v-for="tick in ticks"
              :key="tick.value"
              class="absolute bottom-0 pb-1 text-[10px] text-ink-faint -translate-x-1/2"
              :style="{ left: tick.pct + '%' }"
            >
              {{ tick.label }}
            </div>
          </div>

          <!-- Row backgrounds -->
          <template v-for="item in scheduled.flat" :key="'bg-' + item.key">
            <div v-if="item.type === 'stage'" class="h-5 bg-surface-2" />
            <div v-else class="h-7" />
          </template>

          <!-- SVG overlay: grid lines + dependency lines -->
          <svg
            class="absolute left-0 pointer-events-none"
            :style="{ top: '24px', width: '100%', height: scheduled.chartHeight + 'px' }"
            :viewBox="`0 0 ${chartWidth} ${scheduled.chartHeight}`"
            preserveAspectRatio="none"
          >
            <!-- Grid lines -->
            <line
              v-for="tick in ticks"
              :key="'g-' + tick.value"
              :x1="(tick.pct / 100) * chartWidth"
              :y1="0"
              :x2="(tick.pct / 100) * chartWidth"
              :y2="scheduled.chartHeight"
              stroke="currentColor"
              class="text-border"
              stroke-width="1"
              vector-effect="non-scaling-stroke"
            />
            <!-- Dependency lines -->
            <path
              v-for="(line, i) in depPaths"
              :key="'d-' + i"
              :d="line"
              fill="none"
              stroke="#9CA3AF"
              stroke-width="1"
              opacity="0.2"
              vector-effect="non-scaling-stroke"
            />
          </svg>

          <!-- Bars (HTML for native tooltips) -->
          <div
            v-for="job in filteredJobs"
            :key="'bar-' + job.name"
            class="absolute rounded-sm transition-opacity"
            :style="{
              left: job.startPct + '%',
              width: Math.max(job.widthPct, 0.4) + '%',
              top: (24 + job.y + 5) + 'px',
              height: '18px',
              backgroundColor: job.barColor,
              opacity: job.matched ? 1 : 0.15,
            }"
            :title="`${job.name}\nP50: ${fmtDuration(job.p50)}\nRetry rate: ${job.retryRate.toFixed(1)}%`"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import type { JobStats } from "@isaac/shared";

const props = defineProps<{
  jobs: JobStats[];
  loading: boolean;
}>();

const ROW_H = 28;
const STAGE_H = 20;
const BAR_H = 18;

const search = ref("");
const searchTerms = computed(() =>
  search.value.toLowerCase().split(/\s+/).filter(Boolean)
);

function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "--";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function barColor(retryRate: number): string {
  if (retryRate < 5) return "#93C5FD";
  if (retryRate < 15) return "#FBBF24";
  return "#F87171";
}

// --- Resize observer for chart width ---
const chartRef = ref<HTMLElement>();
const chartWidth = ref(800);

let observer: ResizeObserver | null = null;
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    chartWidth.value = entries[0].contentRect.width;
  });
  if (chartRef.value) observer.observe(chartRef.value);
});
onUnmounted(() => observer?.disconnect());

// --- Scheduling ---
interface ScheduledJob {
  name: string;
  stage: string;
  p50: number;
  retryRate: number;
  deps: string[];
  startTime: number;
  endTime: number;
  startPct: number;
  endPct: number;
  widthPct: number;
  y: number;
  barColor: string;
  matched: boolean;
}

interface FlatItem {
  type: "stage" | "job";
  label: string;
  key: string;
  matched: boolean;
}

const scheduled = computed(() => {
  const jobs = props.jobs;
  if (jobs.length === 0) return { jobs: [] as ScheduledJob[], flat: [] as FlatItem[], chartHeight: 0 };

  const jobMap = new Map(jobs.map((j) => [j.name, j]));

  // Derive stage order from cross-stage dependencies
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

  // Topological sort (Kahn's)
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
  // Add any remaining stages
  for (const s of stageSet) {
    if (!stageOrder.includes(s)) stageOrder.push(s);
  }

  // Group jobs by stage
  const byStage = new Map<string, JobStats[]>();
  for (const j of jobs) {
    if (!byStage.has(j.stage)) byStage.set(j.stage, []);
    byStage.get(j.stage)!.push(j);
  }

  // Resolve dependencies (use needs; skip deps not in our data)
  const resolvedDeps = new Map<string, string[]>();
  for (const j of jobs) {
    resolvedDeps.set(j.name, j.needs.filter((n) => jobMap.has(n)));
  }

  // Schedule: compute start/end times
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

  // Build flat items and scheduled jobs
  const flat: FlatItem[] = [];
  const result: ScheduledJob[] = [];
  let y = 0;

  for (const stage of stageOrder) {
    const stageJobs = byStage.get(stage);
    if (!stageJobs?.length) continue;

    flat.push({ type: "stage", label: stage, key: "stage-" + stage, matched: true });
    y += STAGE_H;

    for (const j of stageJobs) {
      flat.push({ type: "job", label: j.name, key: j.name, matched: true });

      const start = startTimes.get(j.name) ?? 0;
      const end = endTimes.get(j.name) ?? 0;
      const totalRuns = j.runCount + j.retryCount;
      const retryRate = totalRuns > 0 ? (j.retryCount / totalRuns) * 100 : 0;

      result.push({
        name: j.name,
        stage: j.stage,
        p50: j.p50Duration ?? j.avgDuration,
        retryRate,
        deps: resolvedDeps.get(j.name) || [],
        startTime: start,
        endTime: end,
        startPct: (start / totalDuration) * 100,
        endPct: (end / totalDuration) * 100,
        widthPct: ((end - start) / totalDuration) * 100,
        y,
        barColor: barColor(retryRate),
        matched: true,
      });

      y += ROW_H;
    }
  }

  return { jobs: result, flat, chartHeight: y };
});

// --- Search filtering (dim non-matching, preserve layout) ---
function isMatch(name: string): boolean {
  if (searchTerms.value.length === 0) return true;
  const lower = name.toLowerCase();
  return searchTerms.value.some((term) => lower.includes(term));
}

const filteredFlat = computed(() =>
  scheduled.value.flat.map((item) => ({
    ...item,
    matched: item.type === "stage" || isMatch(item.label),
  }))
);

const filteredJobs = computed(() =>
  scheduled.value.jobs.map((job) => ({
    ...job,
    matched: isMatch(job.name),
  }))
);

// --- Time axis ticks ---
const ticks = computed(() => {
  const maxSeconds = Math.max(
    ...scheduled.value.jobs.map((j) => j.endTime),
    1
  );
  const maxMinutes = maxSeconds / 60;

  let interval: number;
  if (maxMinutes <= 5) interval = 1;
  else if (maxMinutes <= 15) interval = 2;
  else if (maxMinutes <= 30) interval = 5;
  else if (maxMinutes <= 60) interval = 10;
  else interval = 15;

  const result: { value: number; label: string; pct: number }[] = [];
  for (let m = 0; m <= maxMinutes + interval; m += interval) {
    result.push({
      value: m * 60,
      label: `${m}m`,
      pct: ((m * 60) / maxSeconds) * 100,
    });
    if (result[result.length - 1].pct > 100) break;
  }
  return result;
});

// --- Dependency lines ---
const depPaths = computed(() => {
  const w = chartWidth.value;
  const jobYMap = new Map(scheduled.value.jobs.map((j) => [j.name, j]));
  const paths: string[] = [];

  for (const job of scheduled.value.jobs) {
    for (const depName of job.deps) {
      const dep = jobYMap.get(depName);
      if (!dep) continue;

      const x1 = (dep.endPct / 100) * w;
      const y1 = dep.y + BAR_H / 2 + 5;
      const x2 = (job.startPct / 100) * w;
      const y2 = job.y + BAR_H / 2 + 5;

      const pad = 6;
      const mx = x1 + (x2 - x1) * 0.3;
      const r = Math.min(4, Math.abs(y2 - y1) / 2, Math.abs(mx - x1 - pad), Math.abs(x2 - mx - pad));
      const dy = y2 > y1 ? 1 : -1;
      paths.push(
        `M ${x1} ${y1} H ${mx - r} Q ${mx} ${y1}, ${mx} ${y1 + r * dy} V ${y2 - r * dy} Q ${mx} ${y2}, ${mx + r} ${y2} H ${x2}`
      );
    }
  }

  return paths;
});
</script>
