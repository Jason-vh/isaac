<template>
  <div class="space-y-6">
    <div class="flex items-baseline justify-between">
      <p class="text-sm text-ink-faint">
        Laid out like the WBSO form. Click any cell to copy it.
      </p>
      <span v-if="linkError" class="text-sm text-red-500">{{ linkError }}</span>
      <span v-else-if="copied" class="text-sm text-emerald-500">Copied “{{ copied }}”</span>
    </div>

    <section v-for="day in days" :key="day.date">
      <!-- Day header, mirroring the form's own -->
      <div class="flex items-center justify-between pb-2">
        <span class="text-sm text-ink">{{ formatDay(day.date) }}</span>
        <div class="flex items-center gap-3">
          <span class="text-sm" :class="day.needsInput ? 'text-amber-500' : 'text-ink-muted'">
            {{ formatWbsoHours(day.totalHours) }} out of {{ formatWbsoHours(HOURS_PER_DAY) }}
          </span>
          <div class="h-2 w-40 overflow-hidden rounded-full border border-border">
            <div
              class="h-full rounded-full bg-accent transition-all"
              :style="{ width: `${Math.min(100, (day.totalHours / HOURS_PER_DAY) * 100)}%` }"
            />
          </div>
        </div>
      </div>

      <!-- No overflow-hidden: the ticket search drops out of the table -->
      <div class="rounded-xl border border-border bg-surface-0">
        <p v-if="day.needsInput" class="px-4 py-3 text-sm text-amber-500">
          No commits, reviews or meetings found for this day. Fill it in from memory —
          or leave it if you weren't working.
        </p>

        <table v-else class="w-full table-fixed text-sm">
          <colgroup>
            <col style="width: 14%" />
            <col style="width: 23%" />
            <col style="width: 19%" />
            <col style="width: 16%" />
            <col style="width: 17%" />
            <col style="width: 11%" />
          </colgroup>
          <thead>
            <tr class="text-left text-xs uppercase tracking-wide text-ink-muted [&>th]:border-b [&>th]:border-border [&>th]:bg-surface-1 [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
              <th class="rounded-tl-xl">Work Type</th>
              <th>Work Description</th>
              <th>Jira Issue</th>
              <th>Jira Epic</th>
              <th>WBSO / IDS Project</th>
              <th class="rounded-tr-xl">Hours</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in rowsFor(day)" :key="i">
              <td class="px-3 py-2">
                <Cell :value="row.workType.short" :copy-value="row.workType.label" @copy="copy" />
              </td>
              <td class="px-3 py-2"><Cell :value="row.description" @copy="copy" /></td>
              <td class="px-3 py-2">
                <Cell v-if="row.jiraIssue" :value="row.jiraIssue" mono @copy="copy" />
                <TicketSearch
                  v-else-if="row.link"
                  @select="$emit('link', row.link, $event.key)"
                />
                <span v-else class="px-2 text-ink-faint">—</span>
              </td>
              <!-- The form derives the epic from the issue, so it's reference only -->
              <td class="truncate px-3 py-2 font-mono text-xs text-ink-faint" :title="row.jiraEpic">
                {{ row.jiraEpic || "—" }}
              </td>
              <td class="px-3 py-2">
                <input
                  v-model="projectByEpic[row.jiraEpic || '_none']"
                  placeholder="Select project"
                  class="w-full rounded-md border border-border bg-surface-0 px-2 py-1 text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
                />
              </td>
              <td class="px-3 py-2">
                <Cell :value="formatWbsoHours(row.hours)" mono @copy="copy" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { WBSO_WORK_TYPE, formatWbsoHours, wbsoDescription } from "@isaac/shared";
import type { WbsoDayData } from "@isaac/shared";
import type { WbsoLinkTarget } from "./linkTarget";
import { linkTargetFor } from "./linkTarget";
import Cell from "./WbsoWorksheetCell.vue";
import TicketSearch from "./TicketSearch.vue";

defineProps<{ days: WbsoDayData[]; linkError?: string }>();

defineEmits<{ link: [target: WbsoLinkTarget, ticketKey: string] }>();

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
    link: linkTargetFor(entry),
  }));
}

function formatDay(date: string): string {
  const d = new Date(date + "T00:00:00");
  const weekday = d.toLocaleDateString("en-GB", { weekday: "long" });
  const rest = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${weekday}, ${rest}`;
}

let timer: ReturnType<typeof setTimeout>;
function copy(value: string) {
  navigator.clipboard.writeText(value);
  copied.value = value.length > 30 ? value.slice(0, 30) + "…" : value;
  clearTimeout(timer);
  timer = setTimeout(() => (copied.value = ""), 1500);
}
</script>
