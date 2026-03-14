<template>
  <div>
    <div v-if="loading && !data" class="py-20 text-center text-ink-faint">
      Loading...
    </div>
    <div v-else-if="error" class="py-20 text-center text-red-500">
      {{ error }}
    </div>
    <template v-else-if="data">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <WeekPicker
          :week-start="data.weekStart"
          @prev="prevWeek"
          @next="nextWeek"
        />
        <div class="flex items-center gap-3">
          <div v-if="loading" class="text-sm text-ink-faint">Updating...</div>
          <button
            v-if="!isCurrentWeek"
            @click="goToday"
            class="rounded-lg border border-border bg-surface-0 px-3 py-1 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            This week
          </button>
        </div>
      </div>

      <!-- Stats -->
      <div class="mt-6">
        <StatsCards :stats="data.stats" />
      </div>

      <!-- Main content: two columns -->
      <div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <!-- Left column -->
        <div class="space-y-6">
          <WeekGrid :days="data.days" :feed="data.feed" />
          <ActivityFeed :feed="data.feed" :days="data.days" />
        </div>

        <!-- Right sidebar -->
        <div class="space-y-6">
          <VelocityChart :weeks="velocity" :active-week="data.weekStart" />
          <QuickLinks />
          <ProjectsPanel :feed="data.feed" />
          <WeekDistribution :days="data.days" />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useDashboard } from "../composables/useDashboard";
import WeekPicker from "../components/dashboard/WeekPicker.vue";
import StatsCards from "../components/dashboard/StatsCards.vue";
import WeekGrid from "../components/dashboard/WeekGrid.vue";
import ActivityFeed from "../components/dashboard/ActivityFeed.vue";
import QuickLinks from "../components/dashboard/QuickLinks.vue";
import ProjectsPanel from "../components/dashboard/ProjectsPanel.vue";
import WeekDistribution from "../components/dashboard/WeekDistribution.vue";
import VelocityChart from "../components/dashboard/VelocityChart.vue";

const { data, velocity, loading, error, isCurrentWeek, prevWeek, nextWeek, goToday } = useDashboard();

function onKeydown(e: KeyboardEvent) {
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.key === "ArrowLeft") prevWeek();
  else if (e.key === "ArrowRight") nextWeek();
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>
