<template>
  <div class="card overflow-hidden">
    <div class="border-b border-border px-5 py-4">
      <h2 class="text-lg font-semibold text-ink">Distributions</h2>
      <p class="mt-0.5 text-sm text-ink-muted">
        Medians and tails per merged MR, timed from when it first went in front
        of reviewers. Durations exclude weekends.
      </p>
    </div>

    <div v-if="!summary" class="px-5 py-16 text-center text-sm text-ink-faint">
      Loading…
    </div>

    <table v-else class="w-full text-sm">
      <thead>
        <tr class="border-b border-border text-left text-xs uppercase tracking-wider text-ink-faint">
          <th class="px-5 py-2.5 font-medium">Metric</th>
          <th class="px-3 py-2.5 text-right font-medium">p50</th>
          <th class="px-3 py-2.5 text-right font-medium">p75</th>
          <th class="px-3 py-2.5 text-right font-medium">p90</th>
          <th class="px-5 py-2.5 text-right font-medium">MRs</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.label"
          class="border-b border-border/60 last:border-0 transition-colors hover:bg-surface-1"
        >
          <td class="px-5 py-3 text-ink">{{ row.label }}</td>
          <td
            v-for="(value, i) in [row.dist.p50, row.dist.p75, row.dist.p90]"
            :key="i"
            class="px-3 py-3 text-right font-mono tabular-nums text-ink"
          >
            {{ row.format(value) }}
          </td>
          <td class="px-5 py-3 text-right font-mono tabular-nums text-ink-muted">
            {{ row.dist.n }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Distribution, ReviewSummary } from "@isaac/shared";
import { formatHours } from "../../lib/duration";

const props = defineProps<{ summary: ReviewSummary | null }>();

const number = (v: number | null) => (v === null ? "—" : v.toLocaleString());

const rows = computed(() => {
  const s = props.summary;
  if (!s) return [];
  const row = (
    label: string,
    dist: Distribution,
    format: (v: number | null) => string = number
  ) => ({ label, dist, format });

  return [
    row("→ first approval", s.latency.toFirstApproval, formatHours),
    row("→ approval that held", s.latency.toHeldApproval, formatHours),
    row("→ merge", s.latency.toMerge, formatHours),
    row("Last approval → merge", s.latency.approvalToMerge, formatHours),
    row("Lines added", s.size.additions),
    row("Comments", s.engagement.commentsPerMr),
    row("Comments per 100 lines", s.engagement.commentsPer100Lines),
    row("Approval resets", s.engagement.approvalResets),
  ];
});
</script>
