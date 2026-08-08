<template>
  <div class="card overflow-hidden">
    <div class="border-b border-border px-4 py-4 sm:px-5">
      <h2 class="text-lg font-semibold text-ink">Wait per author</h2>
      <p class="mt-0.5 text-sm text-ink-muted">
        How long each engineer's own MRs waited before someone commented.
      </p>
    </div>

    <div v-if="!authors.length" class="px-5 py-16 text-center text-sm text-ink-faint">
      Nothing to show.
    </div>

    <div v-else class="table-scroll">
      <table class="w-full min-w-[760px] text-sm">
        <thead>
          <tr class="border-b border-border text-left text-xs uppercase tracking-wider text-ink-faint">
            <th class="px-4 py-2.5 font-medium sm:px-5">Author</th>
            <th class="px-3 py-2.5 text-right font-medium">MRs</th>
            <th class="px-3 py-2.5 text-right font-medium">→ comment p50</th>
            <th class="px-3 py-2.5 text-right font-medium">→ comment p90</th>
            <th class="px-3 py-2.5 text-right font-medium">→ comment p99</th>
            <th class="px-3 py-2.5 text-right font-medium">→ approval p50</th>
            <th class="px-4 py-2.5 text-right font-medium sm:px-5">→ merge p50</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="a in authors"
            :key="a.person.id"
            class="border-b border-border/60 last:border-0 transition-colors hover:bg-surface-1"
          >
            <td class="whitespace-nowrap px-4 py-3 sm:px-5">
              <span class="font-medium text-ink">{{ a.person.displayName }}</span>
              <span
                v-if="a.person.isMe"
                class="ml-2 rounded bg-accent-light px-1.5 py-0.5 text-xs font-medium text-accent"
              >
                you
              </span>
            </td>
            <td class="px-3 py-3 text-right font-mono tabular-nums text-ink-muted">
              {{ a.mrs }}
            </td>
            <td
              v-for="(value, i) in [
                a.toFirstReview.p50,
                a.toFirstReview.p90,
                a.toFirstReview.p99,
                a.toFirstApproval.p50,
                a.toMerge.p50,
              ]"
              :key="i"
              class="py-3 text-right font-mono tabular-nums text-ink"
              :class="i === 4 ? 'px-4 sm:px-5' : 'px-3'"
            >
              {{ formatHours(value) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AuthorWait } from "@isaac/shared";
import { formatHours } from "../../lib/duration";

defineProps<{ authors: AuthorWait[] }>();
</script>
