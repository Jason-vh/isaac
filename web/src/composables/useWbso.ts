import { ref, computed, watch } from "vue";
import type { WbsoWeekData } from "@isaac/shared";
import { api, UnauthorizedError } from "../api/client";
import { useRoute, useRouter } from "vue-router";

// Local calendar date. toISOString() would render in UTC and, from a timezone
// ahead of it, silently shift local midnight back to the previous day.
function iso(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Saturday and Sunday fall back to the preceding Friday — WBSO is weekdays. */
function toWeekday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  if (day === 6) d.setDate(d.getDate() - 1);
  else if (day === 0) d.setDate(d.getDate() - 2);
  return iso(d);
}

function weekStartOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return iso(d);
}

function shiftWeekday(dateStr: string, direction: 1 | -1): string {
  const d = new Date(dateStr + "T00:00:00");
  do {
    d.setDate(d.getDate() + direction);
  } while (d.getDay() === 0 || d.getDay() === 6);
  return iso(d);
}

export function useWbso() {
  const route = useRoute();
  const router = useRouter();

  const today = toWeekday(iso(new Date()));
  const date = ref(toWeekday((route.params.date as string) || today));
  const data = ref<WbsoWeekData | null>(null);
  const loading = ref(false);
  const error = ref("");

  /** The day on screen. Undefined only if it falls outside the fetched week. */
  const selectedDay = computed(() =>
    data.value?.days.find((d) => d.date === date.value)
  );

  const isToday = computed(() => date.value === today);

  async function fetchWeek() {
    loading.value = true;
    error.value = "";
    try {
      data.value = await api.get<WbsoWeekData>(`/wbso/week/${date.value}`);
    } catch (e: any) {
      if (e instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function updateMeetingCategory(
    meetingId: number,
    category?: "dev" | "non_dev",
    epicKey?: string,
    ticketKey?: string
  ) {
    const payload: Record<string, string | undefined> = {};
    if (category) payload.category = category;
    if (epicKey !== undefined) payload.epicKey = epicKey;
    if (ticketKey !== undefined) payload.ticketKey = ticketKey;
    await api.patch(`/wbso/meetings/${meetingId}`, payload);
    await fetchWeek();
  }

  // Optimistic: the row flips immediately, and reverts if the write fails.
  async function setMark(date: string, rowKey: string, marked: boolean) {
    const day = data.value?.days.find((d) => d.date === date);
    const entry = day?.entries.find((e) => e.rowKey === rowKey);
    if (!entry) return;

    const previous = { marked: entry.marked, markedHours: entry.markedHours };
    entry.marked = marked;
    entry.markedHours = marked ? entry.hours : null;

    try {
      await api.put(`/wbso/marks`, {
        date,
        rowKey,
        hours: entry.hours,
        marked,
      });
    } catch (e) {
      Object.assign(entry, previous);
      throw e;
    }
  }

  async function updateMrTicket(mrId: number, ticketKey: string) {
    await api.patch(`/wbso/merge-requests/${mrId}`, { ticketKey });
    await fetchWeek();
  }

  // Sync date → URL
  watch(date, (val) => {
    if (route.params.date !== val) {
      router.replace({ params: { date: val } });
    }
  });

  // Sync URL → date (browser back/forward)
  watch(
    () => route.params.date as string | undefined,
    (param) => {
      const day = toWeekday(param || today);
      if (date.value !== day) date.value = day;
    }
  );

  // Only refetch when the day moves into a different week
  watch(
    date,
    (val, previous) => {
      if (previous && weekStartOf(val) === weekStartOf(previous)) return;
      fetchWeek();
    },
    { immediate: true }
  );

  function prevDay() {
    date.value = shiftWeekday(date.value, -1);
  }

  function nextDay() {
    if (isToday.value) return;
    date.value = shiftWeekday(date.value, 1);
  }

  function goToday() {
    date.value = today;
  }

  return {
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
    fetchWeek,
  };
}
