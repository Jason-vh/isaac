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
          :disable-next="isCurrentWeek"
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
        <WbsoWeekGrid
          :days="data.days"
          :jira-browse-url="data.jiraBrowseUrl"
          @entry-click="onEntryClick"
        />
      </div>

      <!-- Epic summary -->
      <div class="mt-6">
        <WbsoEpicSummary :epics="data.byEpic" :jira-browse-url="data.jiraBrowseUrl" />
      </div>

      <!-- Unlinked MRs -->
      <div class="mt-6">
        <WbsoUnlinkedPanel :mrs="data.unlinkedMRs" @link="onLinkMr" />
      </div>

      <!-- Entry detail panel -->
      <WbsoEntryDetail
        :entry="selectedEntry"
        :day-label="selectedDayLabel"
        :date="selectedDate"
        :jira-browse-url="data.jiraBrowseUrl"
        :gitlab-base-url="data.gitlabBaseUrl"
        @close="closeDetail"
        @update-meeting="onUpdateMeeting"
        @update-mr="onUpdateMr"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import type { WbsoEntry } from "@isaac/shared";
import { useWbso } from "../composables/useWbso";
import WeekPicker from "../components/dashboard/WeekPicker.vue";
import WbsoCategoryCards from "../components/wbso/WbsoCategoryCards.vue";
import WbsoWeekGrid from "../components/wbso/WbsoWeekGrid.vue";
import WbsoEpicSummary from "../components/wbso/WbsoEpicSummary.vue";
import WbsoUnlinkedPanel from "../components/wbso/WbsoUnlinkedPanel.vue";
import WbsoEntryDetail from "../components/wbso/WbsoEntryDetail.vue";

const { data, loading, error, isCurrentWeek, prevWeek, nextWeek, goToday, updateMeetingCategory, updateMrTicket } =
  useWbso();

// Detail panel state
const selectedEntry = ref<WbsoEntry | null>(null);
const selectedDayLabel = ref("");
const selectedDate = ref("");

function onEntryClick(entry: WbsoEntry, dayLabel: string, date: string) {
  selectedEntry.value = entry;
  selectedDayLabel.value = dayLabel;
  selectedDate.value = date;
}

function closeDetail() {
  selectedEntry.value = null;
}

// Re-find entry after data refresh
watch(data, (newData) => {
  if (!selectedEntry.value || !newData) return;
  const prev = selectedEntry.value;

  for (const day of newData.days) {
    for (const entry of day.entries) {
      // Match by meetingId for meetings
      if (prev.meetingId && entry.meetingId === prev.meetingId) {
        selectedEntry.value = entry;
        selectedDayLabel.value = day.dayLabel;
        selectedDate.value = day.date;
        return;
      }
      // Match by MR id for coding/review
      if (
        !prev.meetingId &&
        prev.reasoning.mergeRequests?.[0]?.id &&
        entry.reasoning.mergeRequests?.[0]?.id === prev.reasoning.mergeRequests[0].id
      ) {
        selectedEntry.value = entry;
        selectedDayLabel.value = day.dayLabel;
        selectedDate.value = day.date;
        return;
      }
    }
  }

  // Not found — close panel
  closeDetail();
});

async function onUpdateMeeting(meetingId: number, payload: { ticketKey?: string; category?: string; epicKey?: string }) {
  await updateMeetingCategory(
    meetingId,
    payload.category as "dev" | "non_dev" | undefined,
    payload.epicKey,
    payload.ticketKey
  );
}

async function onUpdateMr(mrId: number, payload: { ticketKey: string }) {
  await updateMrTicket(mrId, payload.ticketKey);
}

async function onLinkMr(mrId: number, ticketKey: string) {
  await updateMrTicket(mrId, ticketKey);
}

function onKeydown(e: KeyboardEvent) {
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  // Don't navigate weeks while panel is open
  if (selectedEntry.value) return;
  if (e.key === "ArrowLeft") prevWeek();
  else if (e.key === "ArrowRight" && !isCurrentWeek.value) nextWeek();
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>
