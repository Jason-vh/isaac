import { ref } from "vue";
import type {
  ObjectiveWithSummary,
  ObjectiveWithKeyResults,
  EntityLink,
  TimelineEvent,
} from "@isaac/shared";
import { api, UnauthorizedError } from "../api/client";
import { useRouter } from "vue-router";

export function useObjectives() {
  const router = useRouter();
  const objectives = ref<ObjectiveWithSummary[]>([]);
  const selectedObjective = ref<ObjectiveWithKeyResults | null>(null);
  const loading = ref(false);
  const error = ref("");

  function handleError(e: unknown) {
    if (e instanceof UnauthorizedError) {
      router.push("/login");
      return;
    }
    error.value = (e as Error).message;
  }

  async function fetchObjectives() {
    loading.value = true;
    error.value = "";
    try {
      objectives.value = await api.get<ObjectiveWithSummary[]>("/objectives");
    } catch (e) {
      handleError(e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchObjective(slug: string) {
    loading.value = true;
    error.value = "";
    try {
      selectedObjective.value = await api.get<ObjectiveWithKeyResults>(
        `/objectives/${slug}`
      );
    } catch (e) {
      handleError(e);
    } finally {
      loading.value = false;
    }
  }

  async function addEvidence(
    krSlug: string,
    targetType: string,
    targetId: string
  ) {
    try {
      await api.post<EntityLink>(`/key-results/${krSlug}/evidence`, {
        targetType,
        targetId,
      });
      if (selectedObjective.value) {
        await fetchObjective(selectedObjective.value.slug);
      }
    } catch (e) {
      handleError(e);
    }
  }

  async function removeEvidence(krSlug: string, linkId: number) {
    try {
      await api.delete(`/key-results/${krSlug}/evidence/${linkId}`);
      if (selectedObjective.value) {
        await fetchObjective(selectedObjective.value.slug);
      }
    } catch (e) {
      handleError(e);
    }
  }

  async function searchEpics(q: string) {
    try {
      return await api.get<{ key: string; title: string }[]>(
        `/objectives/epics?q=${encodeURIComponent(q)}`
      );
    } catch (e) {
      handleError(e);
      return [];
    }
  }

  async function fetchTimeline(krSlug: string, since?: string, until?: string) {
    try {
      const params = new URLSearchParams();
      if (since) params.set("since", since);
      if (until) params.set("until", until);
      const qs = params.toString();
      return await api.get<TimelineEvent[]>(
        `/key-results/${krSlug}/timeline${qs ? `?${qs}` : ""}`
      );
    } catch (e) {
      handleError(e);
      return [];
    }
  }

  async function searchEntities(type: string, q: string) {
    try {
      return await api.get<{ id: string; title: string }[]>(
        `/objectives/search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`
      );
    } catch (e) {
      handleError(e);
      return [];
    }
  }

  return {
    objectives,
    selectedObjective,
    loading,
    error,
    fetchObjectives,
    fetchObjective,
    addEvidence,
    removeEvidence,
    searchEpics,
    fetchTimeline,
    searchEntities,
  };
}
