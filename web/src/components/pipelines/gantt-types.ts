export interface GanttBar {
  key: string;
  startPct: number;
  widthPct: number;
  color: string;
  opacity: number;
  dashed?: boolean;
  dot?: boolean;
  queue?: boolean;
  title?: string;
  data?: unknown;
}

export interface GanttRow {
  key: string;
  name: string;
  bars: GanttBar[];
  deps: string[];
  dimmed?: boolean;
  hidden?: boolean;
  onCriticalPath?: boolean;
  labelClass?: string;
  /** Override x% for outgoing dependency lines (default: end of last bar) */
  depFromPct?: number;
  /** Override x% for incoming dependency lines (default: start of first bar) */
  depToPct?: number;
}

export interface GanttStage {
  key: string;
  name: string;
  rows: GanttRow[];
  hidden?: boolean;
}

export interface GanttTick {
  pct: number;
  label: string;
}
