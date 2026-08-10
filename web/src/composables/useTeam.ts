import { computed } from "vue";
import type { TeamProductivity, TeamTrend } from "@isaac/shared";
import { api } from "../api/client";
import { useDateRange } from "./useDateRange";
import { useResource } from "./useResource";

export function useTeam() {
  const { since, until, queryParams } = useDateRange("30d");

  const { data, loading, initialLoading, error } = useResource(
    async () => {
      const [productivity, trend] = await Promise.all([
        api.get<TeamProductivity>(`/team/productivity?${queryParams.value}`),
        api.get<TeamTrend>(`/team/trend?${queryParams.value}`),
      ]);
      return { productivity, trend };
    },
    queryParams,
  );

  return {
    since,
    until,
    productivity: computed(() => data.value?.productivity ?? null),
    trend: computed(() => data.value?.trend ?? null),
    loading,
    initialLoading,
    error,
  };
}
