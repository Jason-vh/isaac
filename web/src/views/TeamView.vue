<template>
  <div>
    <!-- Header -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-xl font-bold text-ink sm:text-2xl">Team</h1>
        <p class="mt-1 text-sm text-ink-muted">
          Code merged, code reviewed and tickets closed per engineer.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="days in presetDays"
          :key="days"
          class="rounded-lg border px-2.5 py-1.5 text-sm transition-colors"
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
          class="min-w-0 flex-1 rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm text-ink sm:flex-none"
        />
        <span class="text-sm text-ink-faint">to</span>
        <input
          v-model="until"
          type="date"
          class="min-w-0 flex-1 rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm text-ink sm:flex-none"
        />
      </div>
    </div>

    <p v-if="error" class="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </p>

    <div class="mt-6">
      <TeamTotals :members="productivity?.members ?? []" />
    </div>

    <div class="mt-6">
      <TeamTrendChart :trend="trend" :loading="initialLoading" />
    </div>

    <div class="mt-6">
      <TeamTable
        :members="productivity?.members ?? []"
        :loading="initialLoading"
      />
    </div>

    <p class="mt-4 text-xs text-ink-faint">
      Lines of code is a volume signal, not a measure of value — read it
      alongside MR and ticket counts.
    </p>
  </div>
</template>

<script setup lang="ts">
import { useTeam } from "../composables/useTeam";
import TeamTable from "../components/team/TeamTable.vue";
import TeamTotals from "../components/team/TeamTotals.vue";
import TeamTrendChart from "../components/team/TeamTrendChart.vue";

const {
  since,
  until,
  productivity,
  trend,
  initialLoading,
  error,
  presetDays,
  applyPreset,
  isActivePreset,
} = useTeam();
</script>
