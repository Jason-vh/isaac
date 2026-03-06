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
        class="flex items-center justify-between px-4 py-2.5 text-sm"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium text-ink">
            !{{ mr.gitlabIid }} {{ mr.title }}
          </p>
          <p class="truncate text-xs text-ink-faint">
            {{ mr.branchName }}
            <span class="ml-2">
              {{ mr.commitCount }} commits, +{{ mr.additions }}/-{{ mr.deletions }}
            </span>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { WbsoUnlinkedMR } from "@isaac/shared";
import {
  ExclamationTriangleIcon,
  ChevronDownIcon,
} from "@heroicons/vue/20/solid";

defineProps<{ mrs: WbsoUnlinkedMR[] }>();

const open = ref(false);
</script>
