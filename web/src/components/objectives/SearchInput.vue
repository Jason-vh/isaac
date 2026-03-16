<template>
  <div class="relative">
    <input
      v-model="query"
      @input="onInput"
      @focus="showResults = true"
      type="text"
      :placeholder="placeholder"
      class="w-full rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
    />
    <div
      v-if="showResults && results.length"
      class="absolute z-10 mt-1 w-full rounded-lg border border-border bg-surface-0 py-1 shadow-card-hover max-h-60 overflow-y-auto"
    >
      <button
        v-for="item in results"
        :key="item.id"
        @click="select(item)"
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2 transition-colors"
      >
        <span class="truncate text-ink">{{ item.title }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  placeholder?: string;
  results: { id: string; title: string }[];
}>();

const emit = defineEmits<{
  search: [q: string];
  select: [item: { id: string; title: string }];
}>();

const query = ref("");
const showResults = ref(false);
let debounceTimer: ReturnType<typeof setTimeout>;

function onInput() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (query.value.length < 2) {
      showResults.value = false;
      return;
    }
    emit("search", query.value);
    showResults.value = true;
  }, 300);
}

function select(item: { id: string; title: string }) {
  emit("select", item);
  query.value = "";
  showResults.value = false;
}
</script>
