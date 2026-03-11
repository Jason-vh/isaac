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
            <th class="px-3 py-2 text-right font-medium text-emerald-600">Coding</th>
            <th class="px-3 py-2 text-right font-medium text-violet-600">Review</th>
            <th class="px-3 py-2 text-right font-medium text-fuchsia-600">Dev Meeting</th>
            <th class="px-3 py-2 text-right font-medium text-fuchsia-600">Dev Misc</th>
            <th class="px-3 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="epic in epics" :key="epic.epicKey" class="hover:bg-surface-1">
            <td class="px-4 py-2">
              <a
                :href="`${jiraBrowseUrl}/${epic.epicKey}`"
                target="_blank"
                class="font-medium text-ink hover:underline"
              >
                {{ epic.epicTitle }}
              </a>
            </td>
            <td class="px-3 py-2 text-right font-mono tabular-nums text-emerald-600">
              {{ epic.categories.coding || '-' }}
            </td>
            <td class="px-3 py-2 text-right font-mono tabular-nums text-violet-600">
              {{ epic.categories.codeReview || '-' }}
            </td>
            <td class="px-3 py-2 text-right font-mono tabular-nums text-fuchsia-600">
              {{ epic.categories.devMeeting || '-' }}
            </td>
            <td class="px-3 py-2 text-right font-mono tabular-nums text-fuchsia-600">
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

defineProps<{ epics: WbsoEpicSummary[]; jiraBrowseUrl: string }>();
</script>
