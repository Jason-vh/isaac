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
            <p class="flex items-center gap-1.5 truncate font-medium text-ink">
              <CodeBracketIcon v-if="mr.role === 'authored'" class="h-3.5 w-3.5 flex-shrink-0 text-sky-500" />
              <ChatBubbleLeftEllipsisIcon v-else class="h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
              <span class="truncate">!{{ mr.gitlabIid }} {{ mr.title }}</span>
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
        <TicketSearch
          v-if="activeMrId === mr.id"
          class="mt-2"
          placeholder="Search tickets..."
          autofocus
          @select="selectResult(mr.id, $event.key)"
          @cancel="activeMrId = null"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { WbsoUnlinkedMR } from "@isaac/shared";
import TicketSearch from "./TicketSearch.vue";
import {
  ExclamationTriangleIcon,
  ChevronDownIcon,
  CodeBracketIcon,
  ChatBubbleLeftEllipsisIcon,
} from "@heroicons/vue/20/solid";

defineProps<{ mrs: WbsoUnlinkedMR[] }>();

const emit = defineEmits<{
  link: [mrId: number, ticketKey: string];
}>();

const open = ref(false);
const activeMrId = ref<number | null>(null);

function toggleSearch(mrId: number) {
  activeMrId.value = activeMrId.value === mrId ? null : mrId;
}

function selectResult(mrId: number, ticketKey: string) {
  emit("link", mrId, ticketKey);
  activeMrId.value = null;
}
</script>
