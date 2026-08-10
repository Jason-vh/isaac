import { computed } from "vue";
import type { ReviewOverview, ReviewerReport } from "@isaac/shared";
import { api } from "../api/client";
import { useDateRange } from "./useDateRange";
import { useResource } from "./useResource";

export function useReviews() {
  const { since, until, queryParams } = useDateRange("30d");

  const { data, initialLoading, error } = useResource(
    async () => {
      const [overview, reviewers] = await Promise.all([
        api.get<ReviewOverview>(`/reviews/overview?${queryParams.value}`),
        api.get<ReviewerReport>(`/reviews/reviewers?${queryParams.value}`),
      ]);
      return { overview, reviewers };
    },
    queryParams,
  );

  return {
    since,
    until,
    overview: computed(() => data.value?.overview ?? null),
    reviewers: computed(() => data.value?.reviewers ?? null),
    initialLoading,
    error,
  };
}
