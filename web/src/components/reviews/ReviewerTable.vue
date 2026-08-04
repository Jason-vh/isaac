<template>
  <div class="card overflow-hidden">
    <div class="flex items-center justify-between border-b border-border px-5 py-4">
      <div>
        <h2 class="text-lg font-semibold text-ink">Reviewer load</h2>
        <p class="mt-0.5 text-sm text-ink-muted">
          Reviews on MRs merged in this period.
        </p>
      </div>
      <p v-if="report" class="text-sm text-ink-muted">
        top 2 reviewers do
        <span class="font-mono text-ink">{{ report.top2Share }}%</span>
      </p>
    </div>

    <div v-if="!report" class="px-5 py-16 text-center text-sm text-ink-faint">
      Loading…
    </div>
    <div
      v-else-if="!report.reviewers.length"
      class="px-5 py-16 text-center text-sm text-ink-faint"
    >
      No reviews in this period.
    </div>

    <table v-else class="w-full text-sm">
      <thead>
        <tr class="border-b border-border text-left text-xs uppercase tracking-wider text-ink-faint">
          <th class="px-5 py-2.5 font-medium">Reviewer</th>
          <th class="px-3 py-2.5 text-right font-medium">MRs</th>
          <th class="px-3 py-2.5 text-right font-medium">Approvals</th>
          <th class="px-3 py-2.5 text-right font-medium">Comments</th>
          <th class="px-5 py-2.5 text-right font-medium">Share</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="r in report.reviewers"
          :key="r.person.id"
          class="border-b border-border/60 last:border-0 transition-colors hover:bg-surface-1"
        >
          <td class="px-5 py-3">
            <span class="font-medium text-ink">{{ r.person.displayName }}</span>
            <span
              v-if="r.person.isMe"
              class="ml-2 rounded bg-accent-light px-1.5 py-0.5 text-xs font-medium text-accent"
            >
              you
            </span>
          </td>
          <td class="px-3 py-3 text-right font-mono tabular-nums text-ink">
            {{ r.mrsReviewed }}
          </td>
          <td class="px-3 py-3 text-right font-mono tabular-nums text-ink">
            {{ r.approvals }}
          </td>
          <td class="px-3 py-3 text-right font-mono tabular-nums text-ink">
            {{ r.comments }}
          </td>
          <td class="px-5 py-3 text-right font-mono tabular-nums text-ink-muted">
            {{ r.share }}%
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { ReviewerReport } from "@isaac/shared";

defineProps<{ report: ReviewerReport | null }>();
</script>
