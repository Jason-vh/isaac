<template>
  <div class="rounded-xl border border-border bg-surface-0">
    <div class="flex items-center justify-between border-b border-border px-4 py-3">
      <div>
        <h2 class="font-semibold text-ink">Transcription worksheet</h2>
        <p class="text-sm text-ink-faint">
          Columns match the WBSO form. Click any cell to copy it.
        </p>
      </div>
      <span v-if="copied" class="text-sm text-emerald-500">Copied “{{ copied }}”</span>
    </div>

    <div v-for="day in days" :key="day.date" class="border-b border-border last:border-0">
      <div class="flex items-baseline justify-between bg-surface-1 px-4 py-2">
        <span class="text-sm font-medium text-ink">{{ day.dayLabel }} {{ formatDate(day.date) }}</span>
        <span class="text-sm" :class="day.needsInput ? 'text-amber-500' : 'text-ink-faint'">
          {{ formatHours(day.totalHours) }} of {{ formatHours(HOURS_PER_DAY) }}
        </span>
      </div>

      <p v-if="day.needsInput" class="px-4 py-3 text-sm text-amber-500">
        No commits, reviews or meetings found for this day. Fill it in from memory —
        or leave it if you weren't working.
      </p>

      <table v-if="day.entries.length" class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs uppercase tracking-wide text-ink-faint">
            <th class="px-4 py-2 font-medium">Work Type</th>
            <th class="px-4 py-2 font-medium">Work Description</th>
            <th class="px-4 py-2 font-medium">Jira Issue</th>
            <th class="px-4 py-2 font-medium">Jira Epic</th>
            <th class="px-4 py-2 font-medium">WBSO / IDS Project</th>
            <th class="px-4 py-2 text-right font-medium">Hours</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in rowsFor(day)" :key="i" class="border-t border-border/50">
            <td class="px-4 py-2"><Cell :value="row.workType" mono @copy="copy" /></td>
            <td class="max-w-md px-4 py-2"><Cell :value="row.description" @copy="copy" /></td>
            <td class="px-4 py-2"><Cell :value="row.jiraIssue" mono @copy="copy" /></td>
            <td class="px-4 py-2"><Cell :value="row.jiraEpic" mono @copy="copy" /></td>
            <td class="px-4 py-2">
              <input
                v-model="projectByEpic[row.jiraEpic || '_none']"
                placeholder="—"
                class="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-ink placeholder:text-ink-faint hover:border-border focus:border-accent focus:outline-none"
              />
            </td>
            <td class="px-4 py-2 text-right"><Cell :value="formatHours(row.hours)" mono @copy="copy" /></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { WBSO_WORK_TYPE, wbsoDescription } from "@isaac/shared";
import type { WbsoDayData } from "@isaac/shared";
import Cell from "./WbsoWorksheetCell.vue";

defineProps<{ days: WbsoDayData[] }>();

const HOURS_PER_DAY = 8;
const STORAGE_KEY = "isaac-wbso-projects";

const copied = ref("");
const projectByEpic = ref<Record<string, string>>(load());

function load(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

// Remember the epic → WBSO project mapping so it's typed once, not every week
watch(
  projectByEpic,
  (val) => localStorage.setItem(STORAGE_KEY, JSON.stringify(val)),
  { deep: true }
);

function rowsFor(day: WbsoDayData) {
  return day.entries.map((entry) => ({
    workType: WBSO_WORK_TYPE[entry.category],
    description: wbsoDescription(entry),
    jiraIssue: entry.ticketKey ?? "",
    jiraEpic: entry.epicKey ?? "",
    hours: entry.hours,
  }));
}

function formatHours(h: number): string {
  return `${h % 1 === 0 ? h : h.toFixed(2).replace(/0$/, "")}h`;
}

function formatDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

let timer: ReturnType<typeof setTimeout>;
function copy(value: string) {
  navigator.clipboard.writeText(value);
  copied.value = value.length > 30 ? value.slice(0, 30) + "…" : value;
  clearTimeout(timer);
  timer = setTimeout(() => (copied.value = ""), 1500);
}
</script>
