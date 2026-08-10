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
      <DateRangePicker v-model:since="since" v-model:until="until" />
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
import DateRangePicker from "../components/common/DateRangePicker.vue";

const { since, until, productivity, trend, initialLoading, error } = useTeam();
</script>
