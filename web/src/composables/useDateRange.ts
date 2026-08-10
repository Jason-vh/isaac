import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { presetRange } from "../lib/dateRange";

/** A `since`/`until` range kept in sync with the URL query, seeded from a preset. */
export function useDateRange(defaultPreset: string) {
  const router = useRouter();
  const route = useRoute();
  const fallback = presetRange(defaultPreset);

  const since = ref((route.query.since as string) || fallback.since);
  const until = ref((route.query.until as string) || fallback.until);

  /** Whole-day bounds, as the API expects ISO timestamps. */
  const sinceDate = computed(() => new Date(`${since.value}T00:00:00`));
  const untilDate = computed(() => new Date(`${until.value}T23:59:59`));

  const queryParams = computed(() => {
    const params = new URLSearchParams();
    params.set("since", sinceDate.value.toISOString());
    params.set("until", untilDate.value.toISOString());
    return params.toString();
  });

  watch([since, until], () => {
    router.replace({ query: { ...route.query, since: since.value, until: until.value } });
  });

  return { since, until, sinceDate, untilDate, queryParams };
}
