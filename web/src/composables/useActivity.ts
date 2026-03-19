import { ref, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { api } from "../api/client";
import { UnauthorizedError } from "../api/client";
import type { ActivityData } from "@isaac/shared";

export function useActivity() {
  const router = useRouter();
  const route = useRoute();

  const data = ref<ActivityData | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const days = ref(Number(route.query.days) || 30);

  async function fetchActivity() {
    loading.value = true;
    error.value = null;
    try {
      data.value = await api.get<ActivityData>(
        `/activity?days=${days.value}`,
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

  function setDays(n: number) {
    days.value = n;
    router.replace({ query: { ...route.query, days: n === 30 ? undefined : String(n) } });
  }

  watch(days, () => fetchActivity(), { immediate: true });

  return { data, loading, error, days, setDays };
}
