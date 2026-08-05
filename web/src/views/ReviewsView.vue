<template>
  <div>
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-ink">Reviews</h1>
        <p class="mt-1 text-sm text-ink-muted">
          How long merge requests wait for review, and how much review they get.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-for="days in presetDays"
          :key="days"
          class="rounded-lg border px-2.5 py-1 text-sm transition-colors"
          :class="isActivePreset(days)
            ? 'border-accent bg-accent-light text-accent'
            : 'border-border bg-surface-0 text-ink-muted hover:bg-surface-2 hover:text-ink'"
          @click="applyPreset(days)"
        >
          {{ days }}d
        </button>
        <input
          v-model="since"
          type="date"
          class="rounded-lg border border-border bg-surface-0 px-3 py-1 text-sm text-ink"
        />
        <span class="text-sm text-ink-faint">to</span>
        <input
          v-model="until"
          type="date"
          class="rounded-lg border border-border bg-surface-0 px-3 py-1 text-sm text-ink"
        />
      </div>
    </div>

    <p v-if="error" class="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </p>

    <div class="mt-6">
      <ReviewTotals :summary="overview?.summary ?? null" />
    </div>

    <div class="mt-6">
      <ReviewTrendChart :points="overview?.trend ?? []" />
    </div>

    <div class="mt-6">
      <ReviewQuality :summary="overview?.summary ?? null" />
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-2">
      <ReviewDistributions :summary="overview?.summary ?? null" />
      <ReviewerTable :report="reviewers" />
    </div>

    <div class="mt-6">
      <AuthorWaitTable :authors="overview?.authors ?? []" />
    </div>

    <div class="mt-6">
      <ReviewSizeScatter :mrs="overview?.mrs ?? []" />
    </div>

    <div class="mt-6">
      <MrReviewTable
        :mrs="overview?.mrs ?? []"
        :people="overview?.people ?? []"
      />
    </div>

    <p class="mt-4 text-xs text-ink-faint">
      Scoped to MRs merged in the period. The review window starts when the MR
      first went in front of reviewers — the earliest of the first marked-ready,
      review requested, or first comment — since a third of MRs have reviewers
      requested while still a draft. First comment is the first comment or
      approval by another person; bots such as Bugbot and the security scanner
      don't count. Durations exclude weekends.
    </p>
  </div>
</template>

<script setup lang="ts">
import { useReviews } from "../composables/useReviews";
import AuthorWaitTable from "../components/reviews/AuthorWaitTable.vue";
import ReviewDistributions from "../components/reviews/ReviewDistributions.vue";
import ReviewQuality from "../components/reviews/ReviewQuality.vue";
import ReviewSizeScatter from "../components/reviews/ReviewSizeScatter.vue";
import ReviewTotals from "../components/reviews/ReviewTotals.vue";
import ReviewTrendChart from "../components/reviews/ReviewTrendChart.vue";
import ReviewerTable from "../components/reviews/ReviewerTable.vue";
import MrReviewTable from "../components/reviews/MrReviewTable.vue";

const {
  since,
  until,
  overview,
  reviewers,
  error,
  presetDays,
  applyPreset,
  isActivePreset,
} = useReviews();
</script>
