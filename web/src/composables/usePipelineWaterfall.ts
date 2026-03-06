import { ref } from "vue";
import type {
  PipelineListItem,
  PipelineDetail,
  MergeRequestListItem,
} from "@isaac/shared";
import { api, UnauthorizedError } from "../api/client";
import { useRouter } from "vue-router";

export function usePipelineWaterfall() {
  const router = useRouter();
  const pipelinesList = ref<PipelineListItem[]>([]);
  const mergeRequests = ref<MergeRequestListItem[]>([]);
  const loading = ref(false);
  const error = ref("");

  function handleError(e: unknown) {
    if (e instanceof UnauthorizedError) {
      router.push("/login");
      return;
    }
    error.value = (e as Error).message;
  }

  async function fetchPipelines(limit = 50, source?: string) {
    loading.value = true;
    error.value = "";
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (source) params.set("source", source);
      pipelinesList.value = await api.get<PipelineListItem[]>(
        `/pipelines/list?${params}`
      );
    } catch (e) {
      handleError(e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchPipelineDetail(id: number): Promise<PipelineDetail | null> {
    try {
      return await api.get<PipelineDetail>(`/pipelines/${id}/jobs`);
    } catch (e) {
      handleError(e);
      return null;
    }
  }

  async function fetchMergeRequests(limit = 30) {
    loading.value = true;
    error.value = "";
    try {
      mergeRequests.value = await api.get<MergeRequestListItem[]>(
        `/pipelines/merge-requests?limit=${limit}`
      );
    } catch (e) {
      handleError(e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchMrPipelines(mrId: number): Promise<PipelineListItem[]> {
    try {
      return await api.get<PipelineListItem[]>(
        `/pipelines/merge-requests/${mrId}/pipelines`
      );
    } catch (e) {
      handleError(e);
      return [];
    }
  }

  return {
    pipelinesList,
    mergeRequests,
    loading,
    error,
    fetchPipelines,
    fetchPipelineDetail,
    fetchMergeRequests,
    fetchMrPipelines,
  };
}
