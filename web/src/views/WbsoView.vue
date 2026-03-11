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
            class="rounded-lg border border-border px-3 py-1 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            This week
          </button>
        </div>
      </div>

      <!-- Category cards -->
      <div class="mt-6">
        <WbsoCategoryCards :totals="data.totals" />
      </div>

      <!-- Week grid -->
      <div class="mt-6">
        <WbsoWeekGrid :days="data.days" :jira-browse-url="data.jiraBrowseUrl" @toggle-category="onToggleCategory" />
      </div>

      <!-- Epic summary -->
      <div class="mt-6">
        <WbsoEpicSummary :epics="data.byEpic" />
      </div>

      <!-- Unlinked MRs -->
      <div class="mt-6">
        <WbsoUnlinkedPanel :mrs="data.unlinkedMRs" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useWbso } from "../composables/useWbso";
import WeekPicker from "../components/dashboard/WeekPicker.vue";
import WbsoCategoryCards from "../components/wbso/WbsoCategoryCards.vue";
import WbsoWeekGrid from "../components/wbso/WbsoWeekGrid.vue";
import WbsoEpicSummary from "../components/wbso/WbsoEpicSummary.vue";
import WbsoUnlinkedPanel from "../components/wbso/WbsoUnlinkedPanel.vue";

const { data, loading, error, isCurrentWeek, prevWeek, nextWeek, goToday, updateMeetingCategory } =
  useWbso();

function onToggleCategory(meetingId: number) {
  // Find the current entry to determine new category
  if (!data.value) return;
  for (const day of data.value.days) {
    const entry = day.entries.find((e) => e.meetingId === meetingId);
    if (entry) {
      const newCategory = entry.category === "non_dev" ? "dev" : "non_dev";
      updateMeetingCategory(meetingId, newCategory);
      return;
    }
  }
}

function onKeydown(e: KeyboardEvent) {
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.key === "ArrowLeft") prevWeek();
  else if (e.key === "ArrowRight") nextWeek();
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>
