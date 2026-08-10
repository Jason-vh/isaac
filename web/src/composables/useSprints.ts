import { ref } from "vue";
import type { Sprint } from "@isaac/shared";
import { api } from "../api/client";

// Sprints change rarely and every page's date picker wants them, so the list is
// fetched once per session and shared.
const sprints = ref<Sprint[]>([]);
let pending: Promise<void> | null = null;

export function useSprints() {
  pending ??= api
    .get<Sprint[]>("/sprints")
    .then((result) => {
      sprints.value = result;
    })
    .catch(() => {
      // The picker simply drops its sprint presets when these can't be loaded.
      pending = null;
    });

  return { sprints };
}
