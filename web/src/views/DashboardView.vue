<template>
  <div>
    <div v-if="loading && !data" class="py-12 text-center text-gray-400">
      Loading...
    </div>
    <div v-else-if="error" class="py-12 text-center text-red-500">
      {{ error }}
    </div>
    <template v-else-if="data">
      <div class="flex items-center justify-between">
        <WeekPicker
          :week-start="data.weekStart"
          @prev="prevWeek"
          @next="nextWeek"
          @today="goToday"
        />
        <div v-if="loading" class="text-sm text-gray-400">Updating...</div>
      </div>
      <div class="mt-6 space-y-6">
        <StatsCards :stats="data.stats" />
        <WeekGrid :days="data.days" />
        <ActivityFeed :feed="data.feed" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useDashboard } from "../composables/useDashboard";
import WeekPicker from "../components/dashboard/WeekPicker.vue";
import StatsCards from "../components/dashboard/StatsCards.vue";
import WeekGrid from "../components/dashboard/WeekGrid.vue";
import ActivityFeed from "../components/dashboard/ActivityFeed.vue";

const { data, loading, error, prevWeek, nextWeek, goToday } = useDashboard();
</script>
