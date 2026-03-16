<template>
  <div>
    <h1 class="text-2xl font-bold text-ink">Admin</h1>
    <p class="mt-1 text-sm text-ink-muted">Trigger syncs and view sync history.</p>

    <p v-if="error" class="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </p>

    <!-- Sync trigger -->
    <div class="mt-6 rounded-lg border border-border bg-surface p-5">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-ink">Trigger Sync</h2>
        <div class="flex gap-2">
          <button
            @click="triggerSync(selectedSources)"
            :disabled="syncing || selectedSources.length === 0"
            class="rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            Sync Selected
          </button>
          <button
            @click="triggerSync()"
            :disabled="syncing"
            class="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            Sync All
          </button>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <label
          v-for="source in sources"
          :key="source"
          class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors"
          :class="[
            selectedSources.includes(source)
              ? 'border-accent/40 bg-accent/5 text-ink'
              : 'border-border text-ink-muted hover:border-border-strong',
            syncing ? 'opacity-50 cursor-not-allowed' : '',
          ]"
        >
          <input
            type="checkbox"
            v-model="selectedSources"
            :value="source"
            :disabled="syncing"
            class="sr-only"
          />
          <span
            class="flex h-4 w-4 items-center justify-center rounded border text-white transition-colors"
            :class="selectedSources.includes(source) ? 'border-accent bg-accent' : 'border-border'"
          >
            <svg v-if="selectedSources.includes(source)" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
          {{ source }}
        </label>
      </div>

      <!-- Options row -->
      <div class="mt-4 flex items-center gap-4">
        <div class="flex items-center gap-2">
          <label class="text-xs text-ink-muted">Since</label>
          <input
            v-model="sinceDate"
            type="date"
            class="rounded border border-border bg-surface-0 px-2 py-1 text-sm text-ink"
          />
          <button
            v-if="sinceDate"
            class="text-xs text-ink-faint hover:text-ink transition-colors"
            @click="sinceDate = ''"
          >
            clear
          </button>
        </div>
        <label
          class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors"
          :class="force
            ? 'border-amber-400 bg-amber-50 text-amber-700'
            : 'border-border text-ink-muted hover:border-border-strong'"
        >
          <input type="checkbox" v-model="force" class="sr-only" />
          <span
            class="flex h-4 w-4 items-center justify-center rounded border text-white transition-colors"
            :class="force ? 'border-amber-500 bg-amber-500' : 'border-border'"
          >
            <svg v-if="force" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
          Force re-sync
        </label>
      </div>

      <div v-if="syncing" class="mt-4 flex items-center gap-2 text-sm text-ink-muted">
        <div class="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent" />
        Syncing... this may take several minutes.
      </div>

      <div v-if="syncResult" class="mt-4 rounded-md border border-border bg-surface-alt p-3">
        <p class="text-xs font-medium uppercase tracking-wide text-ink-muted">
          Results
          <span class="font-normal">(since: {{ syncResult.since }})</span>
          <span v-if="syncResult.force" class="ml-1 font-normal text-amber-600">(force)</span>
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <span
            v-for="(status, source) in syncResult.results"
            :key="source"
            class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm"
            :class="status === 'ok' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'"
          >
            <span class="font-medium">{{ source }}</span>
            {{ status }}
          </span>
        </div>
      </div>
    </div>

    <!-- Sync log -->
    <div class="mt-6">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-ink">Sync Log</h2>
        <button
          v-if="hasStaleRunning"
          @click="cleanup"
          class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
        >
          Clean up stale jobs
        </button>
      </div>

      <div v-if="logLoading && !logEntries.length" class="mt-4 flex justify-center">
        <div class="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
      </div>

      <div v-else-if="!logEntries.length" class="mt-4 text-sm text-ink-faint">No sync log entries.</div>

      <div v-else class="mt-3 overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-border text-ink-muted">
              <th class="pb-2 pr-4 font-medium">Source</th>
              <th class="pb-2 pr-4 font-medium">Status</th>
              <th class="pb-2 pr-4 font-medium">Started</th>
              <th class="pb-2 pr-4 font-medium">Duration</th>
              <th class="pb-2 pr-4 font-medium">Items</th>
              <th class="pb-2 font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in logEntries" :key="entry.id" class="border-b border-border/50">
              <td class="py-2 pr-4 font-medium text-ink">{{ entry.source }}</td>
              <td class="py-2 pr-4">
                <span
                  :class="{
                    'text-green-600': entry.status === 'success',
                    'text-red-600': entry.status === 'error',
                    'text-amber-600': entry.status === 'running',
                  }"
                >{{ entry.status }}</span>
              </td>
              <td class="py-2 pr-4 text-ink-muted">{{ formatTime(entry.startedAt) }}</td>
              <td class="py-2 pr-4 text-ink-muted">{{ formatDuration(entry.startedAt, entry.finishedAt) }}</td>
              <td class="py-2 pr-4 text-ink-muted">{{ entry.itemsSynced ?? '—' }}</td>
              <td class="py-2 max-w-xs truncate text-red-600">{{ entry.error ?? '' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { api } from "../api/client";

const sources = ["jira", "gitlab", "confluence", "calendar", "gitlab-pipelines"];
const selectedSources = ref<string[]>([]);
const sinceDate = ref("");
const force = ref(false);
const syncing = ref(false);
const error = ref("");
const syncResult = ref<{ results: Record<string, string>; since: string; force?: boolean } | null>(null);

interface SyncLogEntry {
  id: number;
  source: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  itemsSynced: number | null;
  error: string | null;
}

const logEntries = ref<SyncLogEntry[]>([]);
const logLoading = ref(false);

const hasStaleRunning = computed(() =>
  logEntries.value.some(
    (e) => e.status === "running" && Date.now() - new Date(e.startedAt).getTime() > 10 * 60 * 1000,
  ),
);

async function cleanup() {
  try {
    await api.post<{ cleaned: number }>("/sync/cleanup", {});
    fetchLog();
  } catch (e: any) {
    error.value = e.message;
  }
}

async function fetchLog() {
  logLoading.value = true;
  try {
    logEntries.value = await api.get<SyncLogEntry[]>("/sync/log");
  } catch (e: any) {
    error.value = e.message;
  } finally {
    logLoading.value = false;
  }
}

async function triggerSync(selected?: string[]) {
  syncing.value = true;
  error.value = "";
  syncResult.value = null;
  try {
    const body: { sources?: string[]; since?: string; force?: boolean } = {};
    if (selected?.length) body.sources = selected;
    if (sinceDate.value) body.since = sinceDate.value;
    if (force.value) body.force = true;
    const res = await api.post<{ results: Record<string, string>; since: string } | { error: string }>(
      "/sync/trigger",
      body,
    );
    if ("error" in res) {
      error.value = res.error;
    } else {
      syncResult.value = { ...res, force: force.value };
    }
  } catch (e: any) {
    error.value = e.message;
  } finally {
    syncing.value = false;
    fetchLog();
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return "...";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

onMounted(fetchLog);
</script>
