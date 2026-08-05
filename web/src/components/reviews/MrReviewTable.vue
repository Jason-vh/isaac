<template>
  <div class="card overflow-hidden">
    <div class="flex items-center justify-between border-b border-border px-5 py-4">
      <div>
        <h2 class="text-lg font-semibold text-ink">Merge requests</h2>
        <p class="mt-0.5 text-sm text-ink-muted">
          Every MR merged in this period. Click a column to sort.
        </p>
      </div>
      <p class="text-sm text-ink-muted">{{ sorted.length }} MRs</p>
    </div>

    <div v-if="!sorted.length" class="px-5 py-16 text-center text-sm text-ink-faint">
      Nothing to show.
    </div>

    <table v-else class="w-full text-sm">
      <thead>
        <tr class="border-b border-border text-left text-xs uppercase tracking-wider text-ink-faint">
          <th class="px-5 py-2.5 font-medium">MR</th>
          <th
            v-for="col in columns"
            :key="col.key"
            class="cursor-pointer select-none py-2.5 text-right font-medium transition-colors hover:text-ink"
            :class="[col.key === 'hoursToMerge' ? 'px-5' : 'px-3', sortKey === col.key && 'text-ink']"
            @click="toggleSort(col.key)"
          >
            {{ col.label }}
            <span v-if="sortKey === col.key">{{ descending ? "↓" : "↑" }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="mr in visible"
          :key="mr.id"
          class="border-b border-border/60 last:border-0 transition-colors hover:bg-surface-1"
        >
          <td class="max-w-md truncate px-5 py-3">
            <a :href="mr.webUrl" target="_blank" class="text-ink hover:text-accent">
              <span class="font-mono text-ink-faint">!{{ mr.iid }}</span>
              {{ mr.title }}
            </a>
            <span class="ml-2 text-ink-muted">{{ authorName(mr.authorId) }}</span>
          </td>
          <td
            v-for="col in columns"
            :key="col.key"
            class="py-3 text-right font-mono tabular-nums text-ink"
            :class="col.key === 'hoursToMerge' ? 'px-5' : 'px-3'"
          >
            {{ col.format(mr[col.key]) }}
          </td>
        </tr>
      </tbody>
    </table>

    <button
      v-if="sorted.length > visible.length"
      class="w-full border-t border-border px-5 py-3 text-sm text-ink-muted transition-colors hover:bg-surface-1 hover:text-ink"
      @click="expanded = true"
    >
      Show all {{ sorted.length }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { Person, ReviewMr } from "@isaac/shared";
import { formatHours } from "../../lib/duration";

const props = defineProps<{ mrs: ReviewMr[]; people: Person[] }>();

const PAGE = 25;

type SortKey =
  | "lines"
  | "comments"
  | "hoursToFirstReview"
  | "hoursToFirstApproval"
  | "hoursToMerge";

const number = (v: number | null) => (v === null ? "—" : v.toLocaleString());

const columns: { key: SortKey; label: string; format: (v: number | null) => string }[] = [
  { key: "lines", label: "Lines", format: number },
  { key: "comments", label: "Comments", format: number },
  { key: "hoursToFirstReview", label: "→ first review", format: formatHours },
  { key: "hoursToFirstApproval", label: "→ approval", format: formatHours },
  { key: "hoursToMerge", label: "→ merge", format: formatHours },
];

const sortKey = ref<SortKey>("hoursToFirstReview");
const descending = ref(true);
const expanded = ref(false);

function toggleSort(key: SortKey) {
  if (sortKey.value === key) descending.value = !descending.value;
  else {
    sortKey.value = key;
    descending.value = true;
  }
}

/** Rows carry `lines` so the sortable columns are all plain numbers. */
const rows = computed(() =>
  props.mrs.map((mr) => ({ ...mr, lines: mr.additions + mr.deletions }))
);

const sorted = computed(() =>
  [...rows.value].sort((a, b) => {
    const [x, y] = [a[sortKey.value], b[sortKey.value]];
    // MRs with no measurement sink to the bottom whichever way we sort.
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return descending.value ? y - x : x - y;
  })
);

const visible = computed(() =>
  expanded.value ? sorted.value : sorted.value.slice(0, PAGE)
);

const peopleById = computed(
  () => new Map(props.people.map((p) => [p.id, p.displayName]))
);

function authorName(id: number | null): string {
  return (id !== null && peopleById.value.get(id)) || "—";
}
</script>
