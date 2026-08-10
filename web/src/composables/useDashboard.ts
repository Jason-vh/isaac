import { computed, ref, watch } from "vue";
import type { WeekData, VelocityWeek } from "@isaac/shared";
import { api } from "../api/client";
import { useRoute, useRouter } from "vue-router";
import { useResource } from "./useResource";

const VELOCITY_WEEKS = 12;

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function mondayOf(d: Date): string {
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return monday.toISOString().split("T")[0];
}

export function useDashboard() {
  const route = useRoute();
  const router = useRouter();

  const date = ref((route.params.week as string) || todayStr());

  const { data: resource, loading, error } = useResource(
    async () => {
      const [week, velocity] = await Promise.all([
        api.get<WeekData>(`/dashboard/week/${date.value}`),
        api.get<VelocityWeek[]>(`/dashboard/velocity?weeks=${VELOCITY_WEEKS}`),
      ]);
      return { week, velocity };
    },
    date,
  );

  const data = computed(() => resource.value?.week ?? null);
  const velocity = computed(() => resource.value?.velocity ?? []);

  // Sync date → URL
  watch(date, (val) => {
    if (route.params.week !== val) router.replace({ params: { week: val } });
  });

  // Sync URL → date (browser back/forward)
  watch(
    () => route.params.week as string | undefined,
    (paramWeek) => {
      const week = paramWeek || todayStr();
      if (date.value !== week) date.value = week;
    }
  );

  function shiftWeek(days: number) {
    const d = new Date(`${date.value}T00:00:00`);
    d.setDate(d.getDate() + days);
    date.value = d.toISOString().split("T")[0];
  }

  const isCurrentWeek = computed(
    () => data.value?.weekStart === mondayOf(new Date())
  );

  return {
    date,
    data,
    velocity,
    loading,
    error,
    isCurrentWeek,
    prevWeek: () => shiftWeek(-7),
    nextWeek: () => shiftWeek(7),
    goToday: () => { date.value = todayStr(); },
  };
}
