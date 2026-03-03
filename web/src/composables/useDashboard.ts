import { ref, watch } from "vue";
import type { WeekData } from "@isaac/shared";
import { api, UnauthorizedError } from "../api/client";
import { useRouter } from "vue-router";

export function useDashboard() {
  const router = useRouter();
  const date = ref(todayStr());
  const data = ref<WeekData | null>(null);
  const loading = ref(false);
  const error = ref("");

  function todayStr(): string {
    const d = new Date();
    return d.toISOString().split("T")[0];
  }

  async function fetchWeek() {
    loading.value = true;
    error.value = "";
    try {
      data.value = await api.get<WeekData>(
        `/dashboard/week/${date.value}`
      );
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

  return { date, data, loading, error, prevWeek, nextWeek, goToday };
}
