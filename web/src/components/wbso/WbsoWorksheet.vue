<template>
  <section>
    <!-- Day header, mirroring the form's own -->
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pb-2">
      <div class="text-sm">
        <span v-if="linkError" class="text-red-500">{{ linkError }}</span>
        <span v-else-if="copied" class="text-emerald-500">Copied “{{ copied }}”</span>
      </div>
      <div class="flex flex-1 items-center gap-3 sm:flex-none">
        <span class="whitespace-nowrap text-sm" :class="day.needsInput ? 'text-amber-500' : 'text-ink-muted'">
          {{ formatWbsoHours(day.totalHours) }} out of {{ formatWbsoHours(HOURS_PER_DAY) }}
        </span>
        <div class="h-2 flex-1 overflow-hidden rounded-full border border-border sm:w-40 sm:flex-none">
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

      <!-- Phones: one card per row. The table's six columns don't survive a
           375px viewport, and the ticket search needs room to drop down. -->
      <template v-else>
        <ul class="divide-y divide-border md:hidden">
          <li
            v-for="(row, i) in rowsFor(day)"
            :key="i"
            class="px-4 py-3"
            :class="{ 'opacity-45': row.marked }"
          >
            <div class="flex items-start gap-3">
              <input
                type="checkbox"
                :checked="row.marked"
                title="Added to the WBSO form"
                class="mt-1 h-5 w-5 flex-shrink-0 cursor-pointer rounded border-border text-accent focus:ring-accent"
                @change="$emit('mark', day.date, row.rowKey, ($event.target as HTMLInputElement).checked)"
              />
              <div class="min-w-0 flex-1 space-y-2">
                <div class="flex items-center gap-2">
                  <span class="text-xs uppercase tracking-wide text-ink-faint">{{ row.workType.short }}</span>
                  <span class="ml-auto flex items-center gap-1.5 font-mono text-sm font-medium text-ink">
                    {{ formatWbsoHours(row.hours) }}
                    <span
                      v-if="row.drift"
                      class="text-amber-500"
                      :title="`Filed as ${row.drift}, now estimated ${formatWbsoHours(row.hours)}`"
                      >●</span
                    >
                  </span>
                </div>
                <Cell :value="row.description" @copy="copy" />
                <Cell v-if="row.jiraIssue" :value="row.jiraIssue" mono @copy="copy" />
                <TicketSearch
                  v-else-if="row.link"
                  @select="$emit('link', row.link, $event.key)"
                />
                <!-- The form derives the epic from the issue, so it's reference only -->
                <p v-if="row.jiraEpic" class="truncate font-mono text-xs text-ink-faint">
                  {{ row.jiraEpic }}
                </p>
              </div>
            </div>
          </li>
        </ul>

        <table class="hidden w-full table-fixed text-sm md:table">
          <colgroup>
            <col style="width: 44px" />
            <col style="width: 17%" />
            <col style="width: 28%" />
            <col style="width: 22%" />
            <col style="width: 19%" />
            <col style="width: 13%" />
          </colgroup>
          <thead>
            <tr class="text-left text-xs uppercase tracking-wide text-ink-muted [&>th]:border-b [&>th]:border-border [&>th]:bg-surface-1 [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
              <th class="rounded-tl-xl"><span class="sr-only">Filed</span></th>
              <th>Work Type</th>
              <th>Work Description</th>
              <th>Jira Issue</th>
              <th>Jira Epic</th>
              <th class="rounded-tr-xl">Hours</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in rowsFor(day)" :key="i" :class="{ 'opacity-45': row.marked }">
              <td class="px-3 py-2 text-center">
                <input
                  type="checkbox"
                  :checked="row.marked"
                  title="Added to the WBSO form"
                  class="h-4 w-4 cursor-pointer rounded border-border text-accent focus:ring-accent"
                  @change="$emit('mark', day.date, row.rowKey, ($event.target as HTMLInputElement).checked)"
                />
              </td>
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
                <div class="flex items-center gap-1.5">
                  <Cell :value="formatWbsoHours(row.hours)" mono @copy="copy" />
                <!-- Filed hours and the estimate have since diverged -->
                <span
                  v-if="row.drift"
                  class="flex-shrink-0 text-amber-500"
                  :title="`Filed as ${row.drift}, now estimated ${formatWbsoHours(row.hours)}`"
                    >●</span
                  >
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { WBSO_WORK_TYPE, formatWbsoHours, wbsoDescription } from "@isaac/shared";
import type { WbsoDayData } from "@isaac/shared";
import type { WbsoLinkTarget } from "./linkTarget";
import { linkTargetFor } from "./linkTarget";
import Cell from "./WbsoWorksheetCell.vue";
import TicketSearch from "./TicketSearch.vue";

defineProps<{ day: WbsoDayData; linkError?: string }>();

defineEmits<{
  link: [target: WbsoLinkTarget, ticketKey: string];
  mark: [date: string, rowKey: string, marked: boolean];
}>();

const HOURS_PER_DAY = 8;

const copied = ref("");

function rowsFor(day: WbsoDayData) {
  return day.entries.map((entry) => ({
    rowKey: entry.rowKey,
    marked: entry.marked,
    drift:
      entry.marked &&
      entry.markedHours !== null &&
      entry.markedHours !== entry.hours
        ? formatWbsoHours(entry.markedHours)
        : null,
    workType: WBSO_WORK_TYPE[entry.category],
    description: wbsoDescription(entry),
    jiraIssue: entry.ticketKey ?? "",
    jiraEpic: entry.epicKey ?? "",
    hours: entry.hours,
    link: linkTargetFor(entry),
  }));
}

let timer: ReturnType<typeof setTimeout>;
function copy(value: string) {
  navigator.clipboard.writeText(value);
  copied.value = value.length > 30 ? value.slice(0, 30) + "…" : value;
  clearTimeout(timer);
  timer = setTimeout(() => (copied.value = ""), 1500);
}
</script>
