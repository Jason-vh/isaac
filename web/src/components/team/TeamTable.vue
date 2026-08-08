<template>
  <div class="card overflow-hidden">
    <div class="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div>
        <h2 class="text-lg font-semibold text-ink">Per engineer</h2>
        <p class="mt-0.5 text-sm text-ink-muted">
          Excludes lockfiles and generated code. Every reviewer is credited the
          full diff, so reviewed lines exceed merged lines.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
        <span v-for="c in legend" :key="c.label" class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full" :class="c.color" />
          {{ c.label }}
        </span>
      </div>
    </div>

    <div v-if="loading" class="px-5 py-16 text-center text-sm text-ink-faint">
      Loading…
    </div>
    <div v-else-if="!members.length" class="px-5 py-16 text-center text-sm text-ink-faint">
      No activity in this period.
    </div>

    <div v-else class="table-scroll">
      <table class="w-full min-w-[720px] text-sm">
        <thead>
          <tr class="border-b border-border text-left text-xs uppercase tracking-wider text-ink-faint">
            <th class="px-4 py-2.5 font-medium sm:px-5">Engineer</th>
            <th
              v-for="col in columns"
              :key="col.key"
              class="cursor-pointer px-3 py-2.5 text-right font-medium transition-colors hover:text-ink"
              :class="sortKey === col.key ? 'text-ink' : ''"
              @click="setSort(col.key)"
            >
              {{ col.label }}
              <span v-if="sortKey === col.key">↓</span>
            </th>
            <th class="px-4 py-2.5 font-medium sm:px-5">Split</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="m in sortedMembers"
            :key="m.person.id"
            class="border-b border-border/60 last:border-0 transition-colors hover:bg-surface-1"
          >
            <td class="whitespace-nowrap px-4 py-3 sm:px-5">
              <span class="font-medium text-ink">{{ m.person.displayName }}</span>
              <span
                v-if="m.person.isMe"
                class="ml-2 rounded bg-accent-light px-1.5 py-0.5 text-xs font-medium text-accent"
              >
                you
              </span>
            </td>
            <td
              v-for="col in columns"
              :key="col.key"
              class="px-3 py-3 text-right font-mono tabular-nums text-ink"
            >
              {{ col.format(col.value(m)) }}
            </td>
            <td class="w-40 px-4 py-3 sm:px-5">
              <CategoryBar :by-category="m.merged.byCategory" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { TeamMemberProductivity } from "@isaac/shared";
import CategoryBar from "./CategoryBar.vue";

const props = defineProps<{
  members: TeamMemberProductivity[];
  loading: boolean;
}>();

const legend = [
  { label: "Frontend", color: "bg-activity-mr" },
  { label: "Backend", color: "bg-activity-ticket" },
  { label: "Other", color: "bg-ink-faint" },
];

const number = (n: number) => n.toLocaleString();

const columns = [
  {
    key: "mergedAdditions",
    label: "Lines merged",
    value: (m: TeamMemberProductivity) => m.merged.additions,
    format: number,
  },
  {
    key: "mergedMrs",
    label: "MRs",
    value: (m: TeamMemberProductivity) => m.merged.mrs,
    format: number,
  },
  {
    key: "reviewedAdditions",
    label: "Lines reviewed",
    value: (m: TeamMemberProductivity) => m.reviewed.additions,
    format: number,
  },
  {
    key: "reviewedMrs",
    label: "Reviews",
    value: (m: TeamMemberProductivity) => m.reviewed.mrs,
    format: number,
  },
  {
    key: "reviewComments",
    label: "Comments",
    value: (m: TeamMemberProductivity) => m.reviewed.comments,
    format: number,
  },
  {
    key: "ticketsClosed",
    label: "Tickets",
    value: (m: TeamMemberProductivity) => m.tickets.closed,
    format: number,
  },
  {
    key: "storyPoints",
    label: "Points",
    value: (m: TeamMemberProductivity) => m.tickets.storyPoints,
    format: (n: number) => (n ? String(n) : "—"),
  },
] as const;

const sortKey = ref<(typeof columns)[number]["key"]>("mergedAdditions");

function setSort(key: (typeof columns)[number]["key"]) {
  sortKey.value = key;
}

const sortedMembers = computed(() => {
  const col = columns.find((c) => c.key === sortKey.value)!;
  return [...props.members].sort((a, b) => col.value(b) - col.value(a));
});
</script>
