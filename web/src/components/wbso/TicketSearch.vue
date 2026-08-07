<template>
  <div class="relative">
    <input
      ref="input"
      v-model="query"
      type="text"
      :placeholder="placeholder"
      class="w-full rounded-md border border-border bg-surface-0 px-2 py-1 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
      @input="onInput"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="chooseHighlighted"
      @keydown.escape="cancel"
      @blur="onBlur"
    />

    <div v-if="loading" class="absolute right-2 top-1.5">
      <div class="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>

    <div
      v-if="results.length"
      class="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 min-w-max overflow-y-auto rounded-md border border-border bg-surface-0 shadow-card-hover"
    >
      <button
        v-for="(result, i) in results"
        :key="result.key"
        type="button"
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
        :class="i === highlight ? 'bg-accent-light text-ink' : 'text-ink-muted hover:bg-surface-1'"
        @mousedown.prevent="choose(result)"
        @mouseenter="highlight = i"
      >
        <span class="flex-shrink-0 font-mono text-xs text-ink-faint">{{ result.key }}</span>
        <span
          v-if="result.epicTitle"
          class="max-w-[140px] flex-shrink-0 truncate rounded bg-accent-light px-1 py-0.5 text-xs font-medium text-accent"
        >{{ result.epicTitle }}</span>
        <span class="truncate">{{ result.title }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import type { WbsoTicketSearchResult } from "@isaac/shared";
import { api } from "../../api/client";

const props = withDefaults(
  defineProps<{ placeholder?: string; autofocus?: boolean }>(),
  { placeholder: "Search for Jira issues", autofocus: false }
);

const emit = defineEmits<{
  select: [ticket: WbsoTicketSearchResult];
  cancel: [];
}>();

const input = ref<HTMLInputElement>();
const query = ref("");
const results = ref<WbsoTicketSearchResult[]>([]);
const loading = ref(false);
const highlight = ref(-1);
let timer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  if (props.autofocus) input.value?.focus();
});

function onInput() {
  if (timer) clearTimeout(timer);
  const q = query.value.trim();
  if (q.length < 2) {
    results.value = [];
    loading.value = false;
    return;
  }
  loading.value = true;
  timer = setTimeout(() => search(q), 200);
}

async function search(q: string) {
  try {
    results.value = await api.get<WbsoTicketSearchResult[]>(
      `/wbso/tickets/search?q=${encodeURIComponent(q)}`
    );
    highlight.value = results.value.length ? 0 : -1;
  } catch {
    results.value = [];
  } finally {
    loading.value = false;
  }
}

function move(delta: number) {
  if (!results.value.length) return;
  const n = results.value.length;
  highlight.value = (highlight.value + delta + n) % n;
}

function chooseHighlighted() {
  const result = results.value[highlight.value];
  if (result) choose(result);
}

function choose(ticket: WbsoTicketSearchResult) {
  reset();
  emit("select", ticket);
}

function cancel() {
  reset();
  emit("cancel");
}

// Let a click on a result land first — mousedown selects, blur only tidies up.
function onBlur() {
  results.value = [];
}

function reset() {
  query.value = "";
  results.value = [];
  highlight.value = -1;
  loading.value = false;
}
</script>
