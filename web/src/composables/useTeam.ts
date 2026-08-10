import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import type { TeamProductivity, TeamTrend } from "@isaac/shared";
import { api, UnauthorizedError } from "../api/client";
import { useDateRange } from "./useDateRange";

export function useTeam() {
  const router = useRouter();
  const { since, until, queryParams } = useDateRange("30d");

  const productivity = ref<TeamProductivity | null>(null);
  const trend = ref<TeamTrend | null>(null);
  const loading = ref(false);
  const initialLoading = ref(true);
  const error = ref("");

  async function fetchAll() {
    loading.value = true;
    error.value = "";
    try {
      const [prod, tr] = await Promise.all([
        api.get<TeamProductivity>(`/team/productivity?${queryParams.value}`),
        api.get<TeamTrend>(`/team/trend?${queryParams.value}`),
      ]);
      productivity.value = prod;
      trend.value = tr;
    } catch (e: any) {
      if (e instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      error.value = e.message;
    } finally {
      loading.value = false;
      initialLoading.value = false;
    }
  }

  watch(queryParams, () => fetchAll(), { immediate: true });

  return {
    since,
    until,
    productivity,
    trend,
    loading,
    initialLoading,
    error,
  };
}
