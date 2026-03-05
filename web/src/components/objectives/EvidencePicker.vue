<template>
  <div class="relative">
    <div class="flex items-center gap-2">
      <input
        v-model="query"
        @input="search"
        @focus="showResults = true"
        type="text"
        placeholder="Search epics to link..."
        class="w-full rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </div>
    <div
      v-if="showResults && results.length"
      class="absolute z-10 mt-1 w-full rounded-lg border border-border bg-surface-0 py-1 shadow-card-hover"
    >
      <button
        v-for="epic in results"
        :key="epic.key"
        @click="select(epic)"
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2 transition-colors"
      >
        <span class="font-mono text-xs text-activity-ticket">{{ epic.key }}</span>
        <span class="truncate text-ink">{{ epic.title }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
  searchFn: (q: string) => Promise<{ key: string; title: string }[]>;
}>();

const emit = defineEmits<{
  select: [epic: { key: string; title: string }];
}>();

const query = ref("");
const results = ref<{ key: string; title: string }[]>([]);
const showResults = ref(false);
let debounceTimer: ReturnType<typeof setTimeout>;

function search() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    if (query.value.length < 2) {
      results.value = [];
      return;
    }
    results.value = await props.searchFn(query.value);
    showResults.value = true;
  }, 300);
}

function select(epic: { key: string; title: string }) {
  emit("select", epic);
  query.value = "";
  results.value = [];
  showResults.value = false;
}
</script>
