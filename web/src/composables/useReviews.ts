import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { ReviewOverview, ReviewerReport } from "@isaac/shared";
import { api, UnauthorizedError } from "../api/client";

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  return toDateString(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

const DEFAULT_DAYS = 30;
const PRESET_DAYS = [7, 30, 90];

function derivePreset(sinceVal: string, untilVal: string): number | null {
  if (untilVal !== toDateString(new Date())) return null;
  return PRESET_DAYS.find((days) => sinceVal === daysAgo(days)) ?? null;
}

export function useReviews() {
  const router = useRouter();
  const route = useRoute();

  const since = ref((route.query.since as string) || daysAgo(DEFAULT_DAYS));
  const until = ref((route.query.until as string) || toDateString(new Date()));
  const activePreset = ref<number | null>(
    derivePreset(since.value, until.value)
  );

  const overview = ref<ReviewOverview | null>(null);
  const reviewers = ref<ReviewerReport | null>(null);
  const initialLoading = ref(true);
  const error = ref("");

  function applyPreset(days: number) {
    activePreset.value = days;
    since.value = daysAgo(days);
    until.value = toDateString(new Date());
  }

  function isActivePreset(days: number): boolean {
    return activePreset.value === days;
  }

  const queryParams = computed(() => {
    const params = new URLSearchParams();
    params.set("since", new Date(since.value).toISOString());
    params.set("until", new Date(until.value + "T23:59:59").toISOString());
    return params.toString();
  });

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

  watch([since, until], () => {
    if (activePreset.value !== null && !isActivePreset(activePreset.value)) {
      activePreset.value = derivePreset(since.value, until.value);
    }
    router.replace({ query: { since: since.value, until: until.value } });
  });

  watch(queryParams, () => fetchAll(), { immediate: true });

  return {
    since,
    until,
    overview,
    reviewers,
    initialLoading,
    error,
    presetDays: PRESET_DAYS,
    applyPreset,
    isActivePreset,
  };
}
