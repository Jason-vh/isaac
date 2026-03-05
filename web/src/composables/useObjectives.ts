import { ref } from "vue";
import type {
  ObjectiveWithSummary,
  ObjectiveWithKeyResults,
  KeyResult,
  EntityLink,
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

  async function fetchObjective(id: number) {
    error.value = "";
    try {
      selectedObjective.value = await api.get<ObjectiveWithKeyResults>(
        `/objectives/${id}`
      );
    } catch (e) {
      handleError(e);
    }
  }

  async function seed() {
    loading.value = true;
    error.value = "";
    try {
      objectives.value = await api.post<ObjectiveWithSummary[]>(
        "/objectives/seed",
        {}
      );
    } catch (e) {
      handleError(e);
    } finally {
      loading.value = false;
    }
  }

  async function updateObjective(
    id: number,
    data: { title?: string; description?: string; status?: string }
  ) {
    try {
      await api.patch(`/objectives/${id}`, data);
      await fetchObjectives();
      if (selectedObjective.value?.id === id) {
        await fetchObjective(id);
      }
    } catch (e) {
      handleError(e);
    }
  }

  async function updateKeyResult(
    id: number,
    data: { status?: string; currentValue?: number; title?: string }
  ) {
    try {
      await api.patch<KeyResult>(`/key-results/${id}`, data);
      await fetchObjectives();
      if (selectedObjective.value) {
        await fetchObjective(selectedObjective.value.id);
      }
    } catch (e) {
      handleError(e);
    }
  }

  async function addEvidence(
    krId: number,
    targetType: string,
    targetId: string
  ) {
    try {
      await api.post<EntityLink>(`/key-results/${krId}/evidence`, {
        targetType,
        targetId,
      });
      if (selectedObjective.value) {
        await fetchObjective(selectedObjective.value.id);
      }
      await fetchObjectives();
    } catch (e) {
      handleError(e);
    }
  }

  async function removeEvidence(krId: number, linkId: number) {
    try {
      await api.delete(`/key-results/${krId}/evidence/${linkId}`);
      if (selectedObjective.value) {
        await fetchObjective(selectedObjective.value.id);
      }
      await fetchObjectives();
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

  return {
    objectives,
    selectedObjective,
    loading,
    error,
    fetchObjectives,
    fetchObjective,
    seed,
    updateObjective,
    updateKeyResult,
    addEvidence,
    removeEvidence,
    searchEpics,
  };
}
