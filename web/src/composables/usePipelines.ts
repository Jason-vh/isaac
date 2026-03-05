import { ref, watch } from "vue";
import type { WeeklyPipelineStats, SlowestJob, FlakyJob } from "@isaac/shared";
import { api, UnauthorizedError } from "../api/client";
import { useRouter } from "vue-router";

export function usePipelines() {
  const router = useRouter();
  const weeks = ref(12);
  const metrics = ref<WeeklyPipelineStats[]>([]);
  const slowestJobs = ref<SlowestJob[]>([]);
  const flakyJobs = ref<FlakyJob[]>([]);
  const loading = ref(false);
  const error = ref("");

  async function fetchAll() {
    loading.value = true;
    error.value = "";
    try {
      const [m, s, f] = await Promise.all([
        api.get<WeeklyPipelineStats[]>(`/pipelines/metrics?weeks=${weeks.value}`),
        api.get<SlowestJob[]>(`/pipelines/jobs/slowest?weeks=${weeks.value}`),
        api.get<FlakyJob[]>(`/pipelines/jobs/flaky?weeks=${weeks.value}`),
      ]);
      metrics.value = m;
      slowestJobs.value = s;
      flakyJobs.value = f;
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

  watch(weeks, () => fetchAll(), { immediate: true });

  return { weeks, metrics, slowestJobs, flakyJobs, loading, error };
}
