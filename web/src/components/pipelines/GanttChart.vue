<template>
  <div class="flex">
    <!-- Labels column -->
    <div class="w-48 shrink-0 border-r border-border">
      <div class="h-6" />
      <template v-for="item in flatItems" :key="item.key">
        <div
          v-if="item.type === 'stage'"
          class="overflow-hidden transition-all duration-200"
          :style="{ maxHeight: item.hidden ? '0px' : STAGE_H + 'px', opacity: item.hidden ? 0 : 1 }"
        >
          <div class="flex items-center px-2 pt-3 pb-1">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              {{ item.label }}
            </span>
          </div>
        </div>
        <div
          v-else
          class="overflow-hidden transition-all duration-200"
          :style="{ maxHeight: item.hidden ? '0px' : ROW_H + 'px', opacity: item.hidden ? 0 : 1 }"
        >
          <div
            class="flex items-center h-7 px-3"
            :class="item.dimmed ? 'opacity-25' : ''"
          >
            <span class="truncate text-xs" :class="item.labelClass || 'text-ink'" :title="item.label">{{ item.label }}</span>
          </div>
        </div>
      </template>
    </div>

    <!-- Chart area -->
    <div ref="chartRef" class="flex-1 relative min-w-0">
      <!-- Time axis -->
      <div class="relative h-6 border-b border-border">
        <div
          v-for="tick in ticks"
          :key="tick.pct"
          class="absolute bottom-0 pb-1 text-[10px] text-ink-faint -translate-x-1/2"
          :style="{ left: tick.pct + '%' }"
        >
          {{ tick.label }}
        </div>
      </div>

      <!-- Row backgrounds -->
      <template v-for="item in flatItems" :key="'bg-' + item.key">
        <div
          class="overflow-hidden transition-all duration-200"
          :style="{ maxHeight: item.hidden ? '0px' : (item.type === 'stage' ? STAGE_H : ROW_H) + 'px' }"
        />
      </template>

      <!-- SVG overlay: grid lines + dependency lines -->
      <svg
        class="absolute left-0 pointer-events-none transition-[height] duration-200"
        :style="{ top: '24px', width: '100%', height: chartHeight + 'px' }"
        :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
        preserveAspectRatio="none"
      >
        <!-- Normal dependency lines (grouped so overlapping paths don't compound opacity) -->
        <g opacity="0.2">
          <path
            v-for="(p, i) in normalDepPaths"
            :key="'d-' + i"
            :d="p.d"
            fill="none"
            stroke="#9CA3AF"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
        </g>
        <!-- Critical path dependency lines -->
        <g v-if="criticalDepPaths.length > 0">
          <path
            v-for="(p, i) in criticalDepPaths"
            :key="'cd-' + i"
            :d="p.d"
            fill="none"
            stroke="#F59E0B"
            stroke-width="1.5"
            vector-effect="non-scaling-stroke"
          />
        </g>
      </svg>

      <!-- Bars -->
      <template v-for="bar in allBars" :key="bar.key">
        <!-- Dot indicator (jobs without timestamps) -->
        <div
          v-if="bar.dot"
          class="absolute h-3 w-3 rounded-full border-2 border-gray-400 transition-[top,opacity] duration-200"
          :style="{
            left: bar.startPct + '%',
            top: (24 + bar.y + 7) + 'px',
            opacity: !entered || bar.hidden ? 0 : bar.opacity,
            pointerEvents: bar.hidden ? 'none' : 'auto',
          }"
          :title="bar.title"
          @mouseenter="$emit('barEnter', bar.data, $event)"
          @mouseleave="$emit('barLeave')"
        />
        <!-- Dashed bar (skipped jobs) -->
        <div
          v-else-if="bar.dashed"
          class="absolute rounded-sm border border-dashed border-gray-400 transition-[top,opacity,width] duration-500 ease-out"
          :style="{
            left: bar.startPct + '%',
            width: entered ? Math.max(bar.widthPct, 0.4) + '%' : '0%',
            top: (24 + bar.y + 5) + 'px',
            height: '18px',
            opacity: bar.hidden ? 0 : bar.opacity,
            pointerEvents: bar.hidden ? 'none' : 'auto',
          }"
          :title="bar.title"
          @mouseenter="$emit('barEnter', bar.data, $event)"
          @mouseleave="$emit('barLeave')"
        />
        <!-- Normal bar -->
        <div
          v-else
          class="absolute rounded-sm transition-[top,opacity,width] duration-500 ease-out"
          :class="bar.highlight ? 'ring-2 ring-amber-400' : ''"
          :style="{
            left: bar.startPct + '%',
            width: entered ? Math.max(bar.widthPct, 0.4) + '%' : '0%',
            top: (24 + bar.y + 5) + 'px',
            height: '18px',
            backgroundColor: bar.color,
            opacity: bar.hidden ? 0 : (bar.onCriticalPath === false ? 0.45 : bar.opacity),
            pointerEvents: bar.hidden ? 'none' : 'auto',
          }"
          :title="bar.title"
          @mouseenter="$emit('barEnter', bar.data, $event)"
          @mouseleave="$emit('barLeave')"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import type { GanttStage, GanttTick } from "./gantt-types";

const ROW_H = 28;
const STAGE_H = 30; // pt-3 (12) + text (~14) + pb-1 (4)

const props = defineProps<{
  stages: GanttStage[];
  ticks: GanttTick[];
}>();

defineEmits<{
  barEnter: [data: unknown, event: MouseEvent];
  barLeave: [];
}>();

// --- Entrance animation ---
const entered = ref(false);
onMounted(() => {
  requestAnimationFrame(() => { entered.value = true; });
});

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

// --- Layout computation ---

interface FlatItem {
  type: "stage" | "row";
  key: string;
  label: string;
  dimmed: boolean;
  hidden: boolean;
  labelClass?: string;
}

interface PositionedBar {
  key: string;
  startPct: number;
  widthPct: number;
  color: string;
  opacity: number;
  dashed: boolean;
  dot: boolean;
  highlight: boolean;
  onCriticalPath: boolean | undefined;
  hidden: boolean;
  title?: string;
  data?: unknown;
  y: number;
}

const layout = computed(() => {
  const flat: FlatItem[] = [];
  const bars: PositionedBar[] = [];
  const rowYMap = new Map<string, number>();
  let y = 0;

  for (const stage of props.stages) {
    const stageHidden = stage.hidden ?? stage.rows.every((r) => r.hidden);
    flat.push({ type: "stage", key: "stage-" + stage.key, label: stage.name, dimmed: false, hidden: stageHidden });
    if (!stageHidden) y += STAGE_H;

    for (const row of stage.rows) {
      const rowHidden = row.hidden ?? false;
      flat.push({ type: "row", key: row.key, label: row.name, dimmed: row.dimmed ?? false, hidden: rowHidden, labelClass: row.labelClass });
      rowYMap.set(row.key, y);

      for (const bar of row.bars) {
        bars.push({
          key: bar.key,
          startPct: bar.startPct,
          widthPct: bar.widthPct,
          color: bar.color,
          opacity: bar.opacity,
          dashed: bar.dashed ?? false,
          dot: bar.dot ?? false,
          highlight: bar.highlight ?? false,
          onCriticalPath: row.onCriticalPath,
          hidden: rowHidden,
          title: bar.title,
          data: bar.data,
          y,
        });
      }

      if (!rowHidden) y += ROW_H;
    }
  }

  return { flat, bars, rowYMap, height: y };
});

const flatItems = computed(() => layout.value.flat);
const allBars = computed(() => layout.value.bars);
const chartHeight = computed(() => layout.value.height);

// --- Dependency paths (right-angle with rounded corners) ---

interface DepPath {
  d: string;
  critical: boolean;
}

const depPathData = computed(() => {
  const w = chartWidth.value;
  const { rowYMap } = layout.value;
  const paths: DepPath[] = [];

  const rowMap = new Map<string, GanttStage["rows"][0]>();
  for (const stage of props.stages) {
    for (const row of stage.rows) {
      if (row.hidden) continue;
      rowMap.set(row.key, row);
    }
  }

  for (const stage of props.stages) {
    for (const row of stage.rows) {
      if (row.hidden) continue;
      if (row.deps.length === 0 || row.bars.length === 0) continue;
      const rowY = rowYMap.get(row.key);
      if (rowY == null) continue;

      const toPct =
        row.depToPct ?? Math.min(...row.bars.filter((b) => !b.dot).map((b) => b.startPct));
      if (!isFinite(toPct)) continue;
      const x2 = (toPct / 100) * w;
      const y2 = rowY + ROW_H / 2;

      for (const depKey of row.deps) {
        const depRow = rowMap.get(depKey);
        if (!depRow || depRow.bars.length === 0) continue;
        const depY = rowYMap.get(depKey);
        if (depY == null) continue;

        const fromPct =
          depRow.depFromPct ??
          Math.max(...depRow.bars.filter((b) => !b.dot).map((b) => b.startPct + b.widthPct));
        if (!isFinite(fromPct)) continue;
        const x1 = (fromPct / 100) * w;
        const y1 = depY + ROW_H / 2;

        if (x2 <= x1) continue;

        const pad = 6;
        const mx = x1 + (x2 - x1) * 0.3;
        const r = Math.min(
          4,
          Math.abs(y2 - y1) / 2,
          Math.abs(mx - x1 - pad),
          Math.abs(x2 - mx - pad)
        );
        if (r <= 0) continue;

        const dy = y2 > y1 ? 1 : -1;
        const isCritical = row.onCriticalPath === true && depRow.onCriticalPath === true;
        paths.push({
          d: `M ${x1} ${y1} H ${mx - r} Q ${mx} ${y1}, ${mx} ${y1 + r * dy} V ${y2 - r * dy} Q ${mx} ${y2}, ${mx + r} ${y2} H ${x2}`,
          critical: isCritical,
        });
      }
    }
  }

  return paths;
});

const normalDepPaths = computed(() => depPathData.value.filter((p) => !p.critical));
const criticalDepPaths = computed(() => depPathData.value.filter((p) => p.critical));
</script>
