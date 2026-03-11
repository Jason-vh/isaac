<template>
  <div v-if="mrs.length > 0" class="card overflow-hidden">
    <button
      @click="open = !open"
      class="flex w-full items-center justify-between border-b border-border px-4 py-3 text-left hover:bg-surface-1"
    >
      <div class="flex items-center gap-2">
        <ExclamationTriangleIcon class="h-4 w-4 text-amber-500" />
        <span class="text-xs font-semibold uppercase tracking-wider text-ink-faint">
          Unlinked MRs
        </span>
        <span
          class="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
        >
          {{ mrs.length }}
        </span>
      </div>
      <ChevronDownIcon
        class="h-4 w-4 text-ink-faint transition-transform"
        :class="{ 'rotate-180': open }"
      />
    </button>
    <div v-if="open" class="divide-y divide-border">
      <div
        v-for="mr in mrs"
        :key="mr.id"
        class="px-4 py-2.5 text-sm"
      >
        <div class="flex items-center justify-between">
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium text-ink">
              !{{ mr.gitlabIid }} {{ mr.title }}
            </p>
            <p class="truncate text-xs text-ink-faint">
              {{ mr.branchName }}
              <span class="ml-2">
                {{ mr.commitCount }} commits, {{ mr.changesCount }} changes
              </span>
            </p>
          </div>
          <button
            @click="toggleSearch(mr.id)"
            class="flex-shrink-0 rounded px-2 py-1 text-xs font-medium text-sky-600 hover:bg-sky-50"
          >
            {{ activeMrId === mr.id ? 'Cancel' : 'Link' }}
          </button>
        </div>
        <!-- Inline search -->
        <div v-if="activeMrId === mr.id" class="relative mt-2">
          <input
            ref="searchInputs"
            v-model="searchQuery"
            type="text"
            placeholder="Search tickets..."
            class="w-full rounded border border-border bg-surface-1 px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
            @input="onSearchInput"
            @keydown.down.prevent="highlightNext"
            @keydown.up.prevent="highlightPrev"
            @keydown.enter.prevent="selectHighlighted"
            @keydown.escape="toggleSearch(null)"
          />
          <div v-if="searchLoading" class="absolute right-2 top-2">
            <div class="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
          </div>
          <div
            v-if="searchResults.length > 0"
            class="absolute left-0 right-0 top-full z-10 mt-1 max-h-[240px] overflow-y-auto rounded border border-border bg-surface-0 shadow-lg"
          >
            <button
              v-for="(result, i) in searchResults"
              :key="result.key"
              class="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors"
              :class="i === highlightIndex ? 'bg-sky-50 text-ink' : 'text-ink-muted hover:bg-surface-1'"
              @click="selectResult(result.key)"
              @mouseenter="highlightIndex = i"
            >
              <span class="flex-shrink-0 text-ink-faint">{{ result.key }}</span>
              <span
                v-if="result.epicTitle"
                class="max-w-[120px] flex-shrink-0 truncate rounded bg-fuchsia-100 px-1 py-0.5 text-xs font-medium text-fuchsia-700"
              >{{ result.epicTitle }}</span>
              <span v-if="result.issueType !== 'epic'" class="truncate">{{ result.title }}</span>
              <span v-else class="truncate rounded bg-fuchsia-100 px-1 py-0.5 text-xs font-medium text-fuchsia-700">{{ result.title }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from "vue";
import type { WbsoUnlinkedMR } from "@isaac/shared";
import { api } from "../../api/client";
import {
  ExclamationTriangleIcon,
  ChevronDownIcon,
} from "@heroicons/vue/20/solid";

defineProps<{ mrs: WbsoUnlinkedMR[] }>();

const emit = defineEmits<{
  link: [mrId: number, ticketKey: string];
}>();

const open = ref(false);

// Search state
const activeMrId = ref<number | null>(null);
const searchQuery = ref("");
const searchResults = ref<{ key: string; title: string; issueType: string; epicKey: string | null; epicTitle: string | null }[]>([]);
const searchLoading = ref(false);
const highlightIndex = ref(-1);
const searchInputs = ref<HTMLInputElement[]>([]);
let searchTimer: ReturnType<typeof setTimeout> | null = null;

function toggleSearch(mrId: number | null) {
  if (activeMrId.value === mrId) {
    activeMrId.value = null;
  } else {
    activeMrId.value = mrId;
    searchQuery.value = "";
    searchResults.value = [];
    highlightIndex.value = -1;
    nextTick(() => searchInputs.value[0]?.focus());
  }
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  const q = searchQuery.value.trim();
  if (q.length < 2) {
    searchResults.value = [];
    return;
  }
  searchLoading.value = true;
  searchTimer = setTimeout(() => doSearch(q), 200);
}

async function doSearch(q: string) {
  try {
    searchResults.value = await api.get(`/wbso/tickets/search?q=${encodeURIComponent(q)}`);
    highlightIndex.value = searchResults.value.length > 0 ? 0 : -1;
  } catch {
    searchResults.value = [];
  } finally {
    searchLoading.value = false;
  }
}

function highlightNext() {
  if (searchResults.value.length === 0) return;
  highlightIndex.value = (highlightIndex.value + 1) % searchResults.value.length;
}

function highlightPrev() {
  if (searchResults.value.length === 0) return;
  highlightIndex.value = (highlightIndex.value - 1 + searchResults.value.length) % searchResults.value.length;
}

function selectHighlighted() {
  if (highlightIndex.value >= 0 && highlightIndex.value < searchResults.value.length) {
    selectResult(searchResults.value[highlightIndex.value].key);
  }
}

function selectResult(ticketKey: string) {
  if (!activeMrId.value) return;
  emit("link", activeMrId.value, ticketKey);
  activeMrId.value = null;
  searchQuery.value = "";
  searchResults.value = [];
}
</script>
