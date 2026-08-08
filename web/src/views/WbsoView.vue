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
      <div class="flex flex-wrap items-center justify-between gap-3">
        <DayPicker
          :date="date"
          :disable-next="isToday"
          @prev="prevDay"
          @next="nextDay"
        />
        <div class="flex items-center gap-2 sm:gap-3">
          <div v-if="loading" class="text-sm text-ink-faint">Updating...</div>
          <button
            @click="worksheet = !worksheet"
            class="rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {{ worksheet ? "Overview" : "Worksheet" }}
          </button>
          <button
            v-if="!isToday"
            @click="goToday"
            class="rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Today
          </button>
        </div>
      </div>

      <!-- Worksheet -->
      <div v-if="worksheet" class="mt-6">
        <WbsoWorksheet
          v-if="selectedDay"
          :day="selectedDay"
          :link-error="linkError"
          @link="onLink"
          @mark="onMark"
        />
        <p v-else class="py-20 text-center text-ink-faint">
          Nothing recorded for this day.
        </p>
      </div>

      <template v-else>
        <!-- Category cards -->
        <div class="mt-6">
          <WbsoCategoryCards :totals="data.totals" />
        </div>

        <!-- Week grid -->
        <div class="mt-6">
          <WbsoWeekGrid
            :days="data.days"
            :jira-browse-url="data.jiraBrowseUrl"
            :epic-dates="data.epicDates"
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
      </template>

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
import DayPicker from "../components/wbso/DayPicker.vue";
import WbsoCategoryCards from "../components/wbso/WbsoCategoryCards.vue";
import WbsoWeekGrid from "../components/wbso/WbsoWeekGrid.vue";
import WbsoEpicSummary from "../components/wbso/WbsoEpicSummary.vue";
import WbsoUnlinkedPanel from "../components/wbso/WbsoUnlinkedPanel.vue";
import WbsoEntryDetail from "../components/wbso/WbsoEntryDetail.vue";
import WbsoWorksheet from "../components/wbso/WbsoWorksheet.vue";
import type { WbsoLinkTarget } from "../components/wbso/linkTarget";

const worksheet = ref(true);
const linkError = ref("");

const {
  date,
  data,
  selectedDay,
  loading,
  error,
  isToday,
  prevDay,
  nextDay,
  goToday,
  updateMeetingCategory,
  updateMrTicket,
  setMark,
} = useWbso();

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

async function onMark(date: string, rowKey: string, marked: boolean) {
  linkError.value = "";
  try {
    await setMark(date, rowKey, marked);
  } catch (e: any) {
    linkError.value = `Could not save: ${e.message}`;
  }
}

async function onLink(target: WbsoLinkTarget, ticketKey: string) {
  linkError.value = "";
  try {
    if (target.type === "meeting") {
      await updateMeetingCategory(target.id, undefined, undefined, ticketKey);
    } else {
      await updateMrTicket(target.id, ticketKey);
    }
  } catch (e: any) {
    linkError.value = `Could not link ${ticketKey}: ${e.message}`;
  }
}

function onKeydown(e: KeyboardEvent) {
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  // Don't navigate weeks while panel is open
  if (selectedEntry.value) return;
  if (e.key === "ArrowLeft") prevDay();
  else if (e.key === "ArrowRight") nextDay();
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>
