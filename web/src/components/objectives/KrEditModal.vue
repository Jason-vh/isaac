<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="open" class="fixed inset-0 z-50 flex justify-end">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/20" @click="$emit('close')" />

        <!-- Drawer -->
        <div class="relative w-full max-w-md bg-surface-0 shadow-xl flex flex-col">
          <div class="flex items-center justify-between border-b border-border px-5 py-4">
            <h3 class="text-sm font-semibold text-ink">Edit Evidence</h3>
            <button @click="$emit('close')" class="text-ink-faint hover:text-ink transition-colors">
              <XMarkIcon class="h-5 w-5" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            <!-- Current evidence -->
            <EvidencePanel
              :evidence="evidence"
              :can-remove="true"
              @remove="(linkId) => $emit('removeEvidence', linkId)"
            />

            <!-- Add evidence -->
            <div>
              <p class="mb-2 text-xs font-medium uppercase tracking-wider text-ink-faint">
                Link evidence
              </p>

              <!-- Type selector -->
              <div class="mb-3 flex gap-1">
                <button
                  v-for="t in entityTypes"
                  :key="t.key"
                  @click="activeType = t.key"
                  class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                  :class="activeType === t.key
                    ? 'bg-surface-2 text-ink'
                    : 'text-ink-faint hover:text-ink-muted'"
                >
                  {{ t.label }}
                </button>
              </div>

              <!-- Epic search (existing) -->
              <div v-if="activeType === 'epic'">
                <EvidencePicker
                  :search-fn="searchEpics"
                  placeholder="Search epics..."
                  @select="(item) => $emit('addEvidence', 'ticket', item.key)"
                />
              </div>

              <!-- Ticket search -->
              <div v-else-if="activeType === 'ticket'">
                <SearchInput
                  placeholder="Search tickets..."
                  @search="searchTickets"
                  :results="ticketResults"
                  @select="(item) => $emit('addEvidence', 'ticket', item.id)"
                />
              </div>

              <!-- Document search -->
              <div v-else-if="activeType === 'document'">
                <SearchInput
                  placeholder="Search documents..."
                  @search="searchDocuments"
                  :results="documentResults"
                  @select="(item) => $emit('addEvidence', 'confluence_document', item.id)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { EvidenceItem } from "@isaac/shared";
import { XMarkIcon } from "@heroicons/vue/20/solid";
import EvidencePanel from "./EvidencePanel.vue";
import EvidencePicker from "./EvidencePicker.vue";
import SearchInput from "./SearchInput.vue";

const props = defineProps<{
  open: boolean;
  evidence: EvidenceItem[];
  searchEpics: (q: string) => Promise<{ key: string; title: string }[]>;
  searchEntities: (type: string, q: string) => Promise<{ id: string; title: string }[]>;
}>();

defineEmits<{
  close: [];
  addEvidence: [targetType: string, targetId: string];
  removeEvidence: [linkId: number];
}>();

const activeType = ref<"epic" | "ticket" | "document">("epic");

const entityTypes = [
  { key: "epic" as const, label: "Epics" },
  { key: "ticket" as const, label: "Tickets" },
  { key: "document" as const, label: "Documents" },
];

const ticketResults = ref<{ id: string; title: string }[]>([]);
const documentResults = ref<{ id: string; title: string }[]>([]);

async function searchTickets(q: string) {
  ticketResults.value = await props.searchEntities("ticket", q);
}

async function searchDocuments(q: string) {
  documentResults.value = await props.searchEntities("document", q);
}
</script>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: all 0.2s ease;
}
.drawer-enter-active > div:last-child,
.drawer-leave-active > div:last-child {
  transition: transform 0.2s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from > div:last-child,
.drawer-leave-to > div:last-child {
  transform: translateX(100%);
}
</style>
