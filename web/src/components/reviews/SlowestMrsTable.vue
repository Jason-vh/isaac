<template>
  <div class="card overflow-hidden">
    <div class="border-b border-border px-5 py-4">
      <h2 class="text-lg font-semibold text-ink">Slowest reviews</h2>
      <p class="mt-0.5 text-sm text-ink-muted">
        Longest ready → merge windows in this period.
      </p>
    </div>

    <div v-if="!rows.length" class="px-5 py-16 text-center text-sm text-ink-faint">
      Nothing to show.
    </div>

    <table v-else class="w-full text-sm">
      <thead>
        <tr class="border-b border-border text-left text-xs uppercase tracking-wider text-ink-faint">
          <th class="px-5 py-2.5 font-medium">MR</th>
          <th class="px-3 py-2.5 text-right font-medium">Author</th>
          <th class="px-3 py-2.5 text-right font-medium">Lines</th>
          <th class="px-3 py-2.5 text-right font-medium">Comments</th>
          <th class="px-3 py-2.5 text-right font-medium">Rounds</th>
          <th class="px-3 py-2.5 text-right font-medium">→ approval</th>
          <th class="px-5 py-2.5 text-right font-medium">→ merge</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="mr in rows"
          :key="mr.id"
          class="border-b border-border/60 last:border-0 transition-colors hover:bg-surface-1"
        >
          <td class="max-w-md truncate px-5 py-3">
            <a :href="mr.webUrl" target="_blank" class="text-ink hover:text-accent">
              <span class="font-mono text-ink-faint">!{{ mr.iid }}</span>
              {{ mr.title }}
            </a>
          </td>
          <td class="px-3 py-3 text-right text-ink-muted">
            {{ authorName(mr.authorId) }}
          </td>
          <td class="px-3 py-3 text-right font-mono tabular-nums text-ink">
            {{ (mr.additions + mr.deletions).toLocaleString() }}
          </td>
          <td class="px-3 py-3 text-right font-mono tabular-nums text-ink">
            {{ mr.comments }}
          </td>
          <td class="px-3 py-3 text-right font-mono tabular-nums text-ink">
            {{ mr.reviewRounds }}
          </td>
          <td class="px-3 py-3 text-right font-mono tabular-nums text-ink">
            {{ formatHours(mr.readyToFirstApprovalHours) }}
          </td>
          <td class="px-5 py-3 text-right font-mono tabular-nums text-ink">
            {{ formatHours(mr.readyToMergeHours) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Person, ReviewMr } from "@isaac/shared";
import { formatHours } from "../../lib/duration";

const props = defineProps<{ mrs: ReviewMr[]; people: Person[]; limit?: number }>();

const rows = computed(() =>
  props.mrs
    .filter((m) => m.readyToMergeHours !== null)
    .sort((a, b) => b.readyToMergeHours! - a.readyToMergeHours!)
    .slice(0, props.limit ?? 15)
);

const peopleById = computed(
  () => new Map(props.people.map((p) => [p.id, p.displayName]))
);

function authorName(id: number | null): string {
  return (id !== null && peopleById.value.get(id)) || "—";
}
</script>
