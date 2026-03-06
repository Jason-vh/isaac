<template>
  <div v-if="epics.length > 0" class="card overflow-hidden">
    <h3
      class="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-faint"
    >
      Hours by Epic (WBSO)
    </h3>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-border bg-surface-1 text-xs text-ink-faint">
            <th class="px-4 py-2 text-left font-medium">Epic</th>
            <th class="px-3 py-2 text-right font-medium">Coding</th>
            <th class="px-3 py-2 text-right font-medium">Dev Meeting</th>
            <th class="px-3 py-2 text-right font-medium">Dev Misc</th>
            <th class="px-3 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="epic in epics" :key="epic.epicKey" class="hover:bg-surface-1">
            <td class="px-4 py-2">
              <span class="font-medium text-ink">{{ epic.epicKey }}</span>
              <span class="ml-1.5 text-ink-muted">{{ epic.epicTitle }}</span>
            </td>
            <td class="px-3 py-2 text-right font-mono tabular-nums text-ink-muted">
              {{ epic.categories.coding || '-' }}
            </td>
            <td class="px-3 py-2 text-right font-mono tabular-nums text-ink-muted">
              {{ epic.categories.devMeeting || '-' }}
            </td>
            <td class="px-3 py-2 text-right font-mono tabular-nums text-ink-muted">
              {{ epic.categories.devMisc || '-' }}
            </td>
            <td class="px-3 py-2 text-right font-mono font-medium tabular-nums text-ink">
              {{ epic.totalHours }}h
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WbsoEpicSummary } from "@isaac/shared";

defineProps<{ epics: WbsoEpicSummary[] }>();
</script>
