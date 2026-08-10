import { ref, watch, type Ref, type WatchSource } from "vue";
import { useRouter } from "vue-router";
import { UnauthorizedError } from "../api/client";

/**
 * Turns a failed request into a message, sending the viewer to login when the
 * token has expired. For imperative fetches that don't fit `useResource`.
 */
export function useErrorHandler(error: Ref<string>) {
  const router = useRouter();
  return (e: unknown): void => {
    if (e instanceof UnauthorizedError) {
      router.push("/login");
      return;
    }
    error.value = e instanceof Error ? e.message : String(e);
  };
}

export interface Resource<T> {
  data: Ref<T | null>;
  /** True while a fetch is in flight, including refetches. */
  loading: Ref<boolean>;
  /** True until the first fetch settles, for distinguishing empty from pending. */
  initialLoading: Ref<boolean>;
  error: Ref<string>;
  refresh: () => Promise<void>;
}

/**
 * Fetches on mount and whenever `watchSource` changes, with the loading and
 * error handling every page needs. An expired token sends the viewer to login
 * rather than surfacing as an error message.
 */
export function useResource<T>(
  fetcher: () => Promise<T>,
  watchSource?: WatchSource | WatchSource[],
): Resource<T> {
  const router = useRouter();

  const data = ref<T | null>(null) as Ref<T | null>;
  const loading = ref(false);
  const initialLoading = ref(true);
  const error = ref("");

  async function refresh(): Promise<void> {
    loading.value = true;
    error.value = "";
    try {
      data.value = await fetcher();
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
      initialLoading.value = false;
    }
  }

  if (watchSource) {
    watch(watchSource, () => refresh(), { immediate: true });
  } else {
    refresh();
  }

  return { data, loading, initialLoading, error, refresh };
}
