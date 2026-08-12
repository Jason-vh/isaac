<template>
  <div class="card overflow-hidden">
    <div class="border-b border-border px-4 py-4 sm:px-5">
      <h2 class="text-lg font-semibold text-ink">Bugbot risk</h2>
      <p class="mt-0.5 text-sm text-ink-muted">
        What Bugbot called risky, against the review the MR actually got.
        Scored {{ report?.scored ?? 0 }} of {{ total }} merged MRs.
      </p>
    </div>

    <div v-if="!report || !report.cohorts.length" class="px-5 py-16 text-center text-sm text-ink-faint">
      Nothing to show.
    </div>

    <template v-else>
      <div class="table-scroll">
        <table class="w-full min-w-[720px] text-sm">
          <thead>
            <tr class="border-b border-border text-left text-xs uppercase tracking-wider text-ink-faint">
              <th class="px-4 py-2.5 font-medium sm:px-5">Risk</th>
              <th class="px-3 py-2.5 text-right font-medium">MRs</th>
              <th class="px-3 py-2.5 text-right font-medium">Lines p50</th>
              <th class="px-3 py-2.5 text-right font-medium">Comments p50</th>
              <th class="px-3 py-2.5 text-right font-medium">Comments p90</th>
              <th class="px-3 py-2.5 text-right font-medium">Approved, no comments</th>
              <th class="px-4 py-2.5 text-right font-medium sm:px-5">Approval reset</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="section in sections" :key="section.label">
              <tr v-if="section.label" class="border-b border-border/60 bg-surface-1">
                <td
                  colspan="7"
                  class="px-4 py-2 text-xs font-medium uppercase tracking-wider text-ink-faint sm:px-5"
                >
                  {{ section.label }}
                </td>
              </tr>
              <tr
                v-for="c in section.cohorts"
                :key="`${section.label}-${c.risk ?? 'none'}`"
                class="border-b border-border/60 last:border-0 transition-colors hover:bg-surface-1"
              >
                <td class="whitespace-nowrap px-4 py-3 sm:px-5">
                  <span class="font-medium text-ink">{{ riskLabel(c.risk) }}</span>
                </td>
                <td class="px-3 py-3 text-right font-mono tabular-nums text-ink-muted">
                  {{ c.mrs }}
                </td>
                <td class="px-3 py-3 text-right font-mono tabular-nums text-ink">
                  {{ c.lines.p50 ?? "—" }}
                </td>
                <td class="px-3 py-3 text-right font-mono tabular-nums text-ink">
                  {{ c.comments.p50 ?? "—" }}
                </td>
                <td class="px-3 py-3 text-right font-mono tabular-nums text-ink">
                  {{ c.comments.p90 ?? "—" }}
                </td>
                <td class="px-3 py-3 text-right font-mono tabular-nums text-ink">
                  {{ pct(c.approvedWithoutComments, c.mrs) }}
                </td>
                <td class="px-4 py-3 text-right font-mono tabular-nums text-ink sm:px-5">
                  {{ pct(c.withResetApproval, c.mrs) }}
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <div class="border-t border-border px-4 py-4 sm:px-5">
        <h3 class="text-sm font-semibold text-ink">Coverage per author</h3>
        <div class="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          <p
            v-for="c in report.coverage"
            :key="c.person.id"
            class="text-sm text-ink-muted"
          >
            {{ c.person.displayName }}
            <span class="ml-1 font-mono tabular-nums" :class="c.scored === 0 ? 'text-ink-faint' : 'text-ink'">
              {{ pct(c.scored, c.mrs) }}
            </span>
            <span class="ml-1 text-xs text-ink-faint">({{ c.scored }}/{{ c.mrs }})</span>
          </p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { BugbotReport, BugbotRisk } from "@isaac/shared";

const props = defineProps<{ report: BugbotReport | null; total: number }>();

/** The overall split first, then the same cohorts within each size band. */
const sections = computed(() => {
  const report = props.report;
  if (!report) return [];
  return [
    { label: "", cohorts: report.cohorts },
    ...report.bySize.map((band) => ({
      label: band.label,
      cohorts: band.cohorts,
    })),
  ];
});

function riskLabel(risk: BugbotRisk | null): string {
  if (!risk) return "Not scored";
  return risk[0].toUpperCase() + risk.slice(1);
}

function pct(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : "—";
}
</script>
