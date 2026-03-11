import { ref, computed, watch } from "vue";
import type { WbsoWeekData } from "@isaac/shared";
import { api, UnauthorizedError } from "../api/client";
import { useRoute, useRouter } from "vue-router";

export function useWbso() {
  const route = useRoute();
  const router = useRouter();

  function todayStr(): string {
    const d = new Date();
    return d.toISOString().split("T")[0];
  }

  const initialWeek = (route.params.week as string) || todayStr();
  const date = ref(initialWeek);
  const data = ref<WbsoWeekData | null>(null);
  const loading = ref(false);
  const error = ref("");

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
    category: "dev" | "non_dev",
    epicKey?: string
  ) {
    await api.patch(`/wbso/meetings/${meetingId}`, { category, epicKey });
    await fetchWeek();
  }

  // Sync date → URL
  watch(date, (val) => {
    if (route.params.week !== val) {
      router.replace({ params: { week: val } });
    }
  });

  // Sync URL → date (browser back/forward)
  watch(
    () => route.params.week as string | undefined,
    (paramWeek) => {
      const week = paramWeek || todayStr();
      if (date.value !== week) {
        date.value = week;
      }
    }
  );

  watch(date, () => fetchWeek(), { immediate: true });

  function prevWeek() {
    const d = new Date(date.value + "T00:00:00");
    d.setDate(d.getDate() - 7);
    date.value = d.toISOString().split("T")[0];
  }

  function nextWeek() {
    const d = new Date(date.value + "T00:00:00");
    d.setDate(d.getDate() + 7);
    date.value = d.toISOString().split("T")[0];
  }

  function goToday() {
    date.value = todayStr();
  }

  const isCurrentWeek = computed(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return data.value?.weekStart === monday.toISOString().split("T")[0];
  });

  return {
    date,
    data,
    loading,
    error,
    isCurrentWeek,
    prevWeek,
    nextWeek,
    goToday,
    updateMeetingCategory,
  };
}
