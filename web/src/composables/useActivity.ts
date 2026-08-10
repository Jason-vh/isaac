import { ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { api } from "../api/client";
import { useResource } from "./useResource";
import type { ActivityData } from "@isaac/shared";

const DEFAULT_DAYS = 30;

export function useActivity() {
  const router = useRouter();
  const route = useRoute();

  const days = ref(Number(route.query.days) || DEFAULT_DAYS);

  const { data, loading, error } = useResource(
    () => api.get<ActivityData>(`/activity?days=${days.value}`),
    days,
  );

  function setDays(n: number) {
    days.value = n;
    router.replace({
      query: { ...route.query, days: n === DEFAULT_DAYS ? undefined : String(n) },
    });
  }

  return { data, loading, error, days, setDays };
}
