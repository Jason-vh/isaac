<template>
  <div class="flex">
    <!-- Labels column -->
    <div class="w-48 shrink-0 border-r border-border">
      <div class="h-6" />
      <template v-for="item in flatItems" :key="item.key">
        <div
          v-if="item.type === 'stage'"
          class="overflow-hidden transition-all duration-300"
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
          class="overflow-hidden transition-all duration-300"
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
    <div class="flex-1 relative min-w-0">
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
          class="overflow-hidden transition-all duration-300"
          :style="{ maxHeight: item.hidden ? '0px' : (item.type === 'stage' ? STAGE_H : ROW_H) + 'px' }"
        />
      </template>

      <!-- Dependency lines (HTML divs for smooth transitions) -->
      <template v-for="dep in depLines" :key="dep.key">
        <!-- Horizontal from source to midpoint -->
        <div
          class="absolute pointer-events-none transition-[top,opacity] duration-300"
          :style="{
            left: dep.fromPct + '%',
            width: (dep.mxPct - dep.fromPct) + '%',
            top: (24 + dep.y1) + 'px',
            height: '1px',
            backgroundColor: '#9CA3AF',
            opacity: dep.hidden ? 0 : (dep.critical ? 1 : 0.2),
          }"
        />
        <!-- Vertical from source y to target y -->
        <div
          class="absolute pointer-events-none transition-[top,height,opacity] duration-300"
          :style="{
            left: dep.mxPct + '%',
            width: '1px',
            top: (24 + Math.min(dep.y1, dep.y2)) + 'px',
            height: Math.abs(dep.y2 - dep.y1) + 'px',
            backgroundColor: '#9CA3AF',
            opacity: dep.hidden ? 0 : (dep.critical ? 1 : 0.2),
          }"
        />
        <!-- Horizontal from midpoint to target -->
        <div
          class="absolute pointer-events-none transition-[top,opacity] duration-300"
          :style="{
            left: dep.mxPct + '%',
            width: (dep.toPct - dep.mxPct) + '%',
            top: (24 + dep.y2) + 'px',
            height: '1px',
            backgroundColor: '#9CA3AF',
            opacity: dep.hidden ? 0 : (dep.critical ? 1 : 0.2),
          }"
        />
      </template>

      <!-- Bars -->
      <template v-for="bar in allBars" :key="bar.key">
        <!-- Dot indicator (jobs without timestamps) -->
        <div
          v-if="bar.dot"
          class="absolute h-3 w-3 rounded-full border-2 border-gray-400 transition-[top,opacity] duration-300"
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
          class="absolute rounded-sm border border-dashed border-gray-400 transition-[top,opacity,width] duration-300 ease-out"
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
        <!-- Queue bar (thin dashed line) -->
        <div
          v-else-if="bar.queue"
          class="absolute transition-[top,opacity,width] duration-300 ease-out"
          :style="{
            left: bar.startPct + '%',
            width: entered ? Math.max(bar.widthPct, 0.4) + '%' : '0%',
            top: (24 + bar.y + 14) + 'px',
            height: '0px',
            borderTop: '1px dashed ' + bar.color,
            opacity: bar.hidden ? 0 : (bar.onCriticalPath === false ? 0.3 : bar.opacity),
            pointerEvents: bar.hidden ? 'none' : 'auto',
          }"
          :title="bar.title"
          @mouseenter="$emit('barEnter', bar.data, $event)"
          @mouseleave="$emit('barLeave')"
        />
        <!-- Normal bar -->
        <div
          v-else
          class="absolute rounded-sm transition-[top,opacity,width] duration-300 ease-out"
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
import { computed, ref, onMounted } from "vue";
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
  queue: boolean;
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
          queue: bar.queue ?? false,
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

// --- Dependency lines (HTML divs that transition with the bars) ---

interface DepLine {
  key: string;
  fromPct: number;
  toPct: number;
  mxPct: number;
  y1: number;
  y2: number;
  critical: boolean;
  hidden: boolean;
}

const depLines = computed(() => {
  const { rowYMap } = layout.value;
  const lines: DepLine[] = [];

  const rowMap = new Map<string, GanttStage["rows"][0]>();
  for (const stage of props.stages) {
    for (const row of stage.rows) {
      rowMap.set(row.key, row);
    }
  }

  for (const stage of props.stages) {
    for (const row of stage.rows) {
      if (row.deps.length === 0 || row.bars.length === 0) continue;
      const rowY = rowYMap.get(row.key);
      if (rowY == null) continue;

      const toPct =
        row.depToPct ?? Math.min(...row.bars.filter((b) => !b.dot).map((b) => b.startPct));
      if (!isFinite(toPct)) continue;

      for (const depKey of row.deps) {
        const depRow = rowMap.get(depKey);
        if (!depRow || depRow.bars.length === 0) continue;
        const depY = rowYMap.get(depKey);
        if (depY == null) continue;

        const fromPct =
          depRow.depFromPct ??
          Math.max(...depRow.bars.filter((b) => !b.dot).map((b) => b.startPct + b.widthPct));
        if (!isFinite(fromPct)) continue;

        if (toPct <= fromPct) continue;

        const mxPct = fromPct + (toPct - fromPct) * 0.3;
        const isCritical = row.onCriticalPath === true && depRow.onCriticalPath === true;
        const isHidden = (row.hidden ?? false) || (depRow.hidden ?? false);

        lines.push({
          key: `dep-${depKey}-${row.key}`,
          fromPct,
          toPct,
          mxPct,
          y1: depY + ROW_H / 2,
          y2: rowY + ROW_H / 2,
          critical: isCritical,
          hidden: isHidden,
        });
      }
    }
  }

  return lines;
});
</script>
