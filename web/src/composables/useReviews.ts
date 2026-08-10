import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import type { ReviewOverview, ReviewerReport } from "@isaac/shared";
import { api, UnauthorizedError } from "../api/client";
import { useDateRange } from "./useDateRange";

export function useReviews() {
  const router = useRouter();
  const { since, until, queryParams } = useDateRange("30d");

  const overview = ref<ReviewOverview | null>(null);
  const reviewers = ref<ReviewerReport | null>(null);
  const initialLoading = ref(true);
  const error = ref("");

  async function fetchAll() {
    error.value = "";
    try {
      const [ov, rv] = await Promise.all([
        api.get<ReviewOverview>(`/reviews/overview?${queryParams.value}`),
        api.get<ReviewerReport>(`/reviews/reviewers?${queryParams.value}`),
      ]);
      overview.value = ov;
      reviewers.value = rv;
    } catch (e: any) {
      if (e instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      error.value = e.message;
    } finally {
      initialLoading.value = false;
    }
  }

  watch(queryParams, () => fetchAll(), { immediate: true });

  return {
    since,
    until,
    overview,
    reviewers,
    initialLoading,
    error,
  };
}
