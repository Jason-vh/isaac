<template>
  <TransitionRoot :show="!!entry" as="template">
    <Dialog @close="$emit('close')" class="relative z-50">
      <!-- Backdrop -->
      <TransitionChild
        as="div"
        class="fixed inset-0 bg-black/20"
        enter="transition-opacity duration-150 ease-out"
        enter-from="opacity-0"
        enter-to="opacity-100"
        leave="transition-opacity duration-100 ease-in"
        leave-from="opacity-100"
        leave-to="opacity-0"
      />

      <!-- Panel -->
      <div class="fixed inset-y-0 right-0 w-[480px]">
        <TransitionChild
          as="div"
          class="h-full"
          enter="transition-transform duration-150 ease-out"
          enter-from="translate-x-full"
          enter-to="translate-x-0"
          leave="transition-transform duration-100 ease-in"
          leave-from="translate-x-0"
          leave-to="translate-x-full"
        >
          <DialogPanel
            class="h-full overflow-y-auto border-l border-border bg-surface-0 shadow-xl"
          >
          <div v-if="entry" class="p-6">
            <!-- Header -->
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-2">
                <component
                  :is="icon"
                  class="h-5 w-5 flex-shrink-0"
                  :class="iconColor"
                />
                <div>
                  <span class="text-sm font-semibold uppercase tracking-wider" :class="iconColor">
                    {{ categoryLabel }}
                  </span>
                </div>
              </div>
              <button
                @click="$emit('close')"
                class="rounded p-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                <XMarkIcon class="h-5 w-5" />
              </button>
            </div>

            <div class="mt-3 flex items-baseline gap-3">
              <span class="font-mono text-2xl font-semibold tabular-nums text-ink">
                {{ entry.hours }}h
              </span>
              <span class="text-sm text-ink-muted">
                {{ dayLabel }} &middot; {{ formatDate(date) }}
              </span>
            </div>

            <!-- Ticket & Epic info -->
            <div
              v-if="entryType !== 'leave'"
              class="mt-5 rounded-lg border border-border p-3"
            >
              <div v-if="entry.epicKey" class="flex items-center gap-2 text-sm">
                <span class="font-medium text-ink-muted">Epic</span>
                <a
                  :href="`${jiraBrowseUrl}/${entry.epicKey}`"
                  target="_blank"
                  class="font-medium text-ink hover:underline"
                  @click.stop
                >
                  {{ entry.epicKey }}
                </a>
                <span v-if="entry.epicTitle" class="min-w-0 truncate text-ink-muted">
                  {{ entry.epicTitle }}
                </span>
                <button
                  v-if="entryType === 'meeting'"
                  @click="unlinkMeeting"
                  class="ml-auto flex-shrink-0 rounded p-0.5 text-ink-faint hover:bg-surface-2 hover:text-ink-muted"
                  title="Unlink"
                >
                  <XMarkIcon class="h-3.5 w-3.5" />
                </button>
              </div>
              <div
                v-if="entry.ticketKey"
                class="flex min-w-0 items-center gap-2 text-sm"
                :class="{ 'mt-1.5': entry.epicKey }"
              >
                <span class="flex-shrink-0 font-medium text-ink-muted">Ticket</span>
                <a
                  :href="`${jiraBrowseUrl}/${entry.ticketKey}`"
                  target="_blank"
                  class="flex-shrink-0 font-medium text-ink hover:underline"
                  @click.stop
                >
                  {{ entry.ticketKey }}
                </a>
                <span v-if="entry.ticketTitle" class="min-w-0 truncate text-ink-muted">
                  {{ entry.ticketTitle }}
                </span>
              </div>

              <!-- No epic indicator -->
              <div
                v-if="entry.ticketKey && !entry.epicKey"
                class="mt-1.5 text-xs text-ink-faint"
              >
                No epic linked to this ticket
              </div>

              <!-- Ticket search + link -->
              <div v-if="showLinkEditor && !linkSubmitted" class="relative mt-2">
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Search tickets..."
                  class="w-full rounded border border-border bg-surface-1 px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                  @input="onSearchInput"
                  @keydown.down.prevent="highlightNext"
                  @keydown.up.prevent="highlightPrev"
                  @keydown.enter.prevent="selectHighlighted"
                  @keydown.escape="searchResults = []"
                />
                <div v-if="searchLoading" class="absolute right-2 top-2">
                  <div class="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
                </div>
                <!-- Results dropdown -->
                <div
                  v-if="searchResults.length > 0"
                  class="absolute left-0 right-0 top-full z-10 mt-1 max-h-[240px] overflow-y-auto rounded border border-border bg-surface-0 shadow-lg"
                >
                  <button
                    v-for="(result, i) in searchResults"
                    :key="result.key"
                    class="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors"
                    :class="i === highlightIndex ? 'bg-sky-50 text-ink' : 'text-ink-muted hover:bg-surface-1'"
                    @click="selectResult(result)"
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
                <p v-if="linkError" class="mt-1 text-xs text-red-500">
                  {{ linkError }}
                </p>
              </div>
            </div>

            <!-- Merge Requests -->
            <div
              v-if="entry.reasoning.mergeRequests?.length"
              class="mt-5"
            >
              <h3 class="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Merge Requests
              </h3>
              <div class="mt-2 space-y-2">
                <a
                  v-for="mr in entry.reasoning.mergeRequests"
                  :key="mr.id"
                  :href="mrUrl(mr)"
                  target="_blank"
                  class="block rounded-lg border border-border p-3 transition-colors hover:bg-surface-1"
                  @click.stop
                >
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-ink">
                      !{{ mr.gitlabIid }}
                    </span>
                    <span
                      class="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
                      :class="mrStatusClass(mr.status)"
                    >
                      {{ mr.status === 'opened' ? 'open' : mr.status }}
                    </span>
                  </div>
                  <p class="mt-1 truncate text-sm text-ink-muted">
                    {{ mr.title }}
                  </p>
                  <div class="mt-1.5 flex items-center gap-3 text-xs text-ink-faint">
                    <span>{{ mr.changesCount }} changes</span>
                    <span class="truncate font-mono">{{ mr.branchName }}</span>
                  </div>
                </a>
              </div>
            </div>

            <!-- Commits -->
            <div
              v-if="entry.reasoning.commits?.length"
              class="mt-5"
            >
              <h3 class="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Commits ({{ entry.reasoning.commits.length }})
              </h3>
              <div class="mt-2 space-y-1">
                <div
                  v-for="commit in entry.reasoning.commits"
                  :key="commit.sha"
                  class="flex items-baseline gap-2 rounded px-2 py-1.5 text-sm"
                >
                  <span class="flex-shrink-0 font-mono text-xs text-ink-faint">
                    {{ commit.sha.slice(0, 7) }}
                  </span>
                  <span class="truncate text-ink-muted">
                    {{ commit.title }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Meeting info -->
            <div
              v-if="entry.reasoning.meeting"
              class="mt-5"
            >
              <h3 class="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Meeting
              </h3>
              <div class="mt-2 rounded-lg border border-border p-3">
                <p class="text-sm font-medium text-ink">
                  {{ entry.reasoning.meeting.title }}
                </p>
                <div class="mt-1.5 flex items-center gap-3 text-xs text-ink-faint">
                  <span>
                    {{ formatTime(entry.reasoning.meeting.startsAt) }}
                    &ndash;
                    {{ formatTime(entry.reasoning.meeting.endsAt) }}
                  </span>
                  <span>{{ entry.reasoning.meeting.durationMinutes }} min</span>
                </div>
              </div>
            </div>

            <!-- Code stats summary -->
            <div
              v-if="entry.reasoning.totalChanges !== undefined"
              class="mt-5 flex items-center gap-4 text-sm text-ink-muted"
            >
              <span>{{ entry.reasoning.commitCount }} commits</span>
              <span>{{ entry.reasoning.totalChanges }} changes</span>
            </div>
          </div>
        </DialogPanel>
        </TransitionChild>
      </div>
    </Dialog>
  </TransitionRoot>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { WbsoEntry } from "@isaac/shared";
import { api } from "../../api/client";
import {
  Dialog,
  DialogPanel,
  TransitionRoot,
  TransitionChild,
} from "@headlessui/vue";
import {
  XMarkIcon,
  CodeBracketIcon,
  ChatBubbleLeftEllipsisIcon,
  CalendarIcon,
  CalendarDateRangeIcon,
  BellSlashIcon,
} from "@heroicons/vue/24/outline";

const props = defineProps<{
  entry: WbsoEntry | null;
  dayLabel: string;
  date: string;
  jiraBrowseUrl: string;
  gitlabBaseUrl: string;
}>();

const emit = defineEmits<{
  close: [];
  "update-meeting": [meetingId: number, payload: { ticketKey?: string; category?: string; epicKey?: string }];
  "update-mr": [mrId: number, payload: { ticketKey: string }];
}>();

type EntryType = "coding" | "review" | "meeting" | "leave";

const entryType = computed((): EntryType => {
  if (!props.entry) return "coding";
  if (props.entry.category === "leave") return "leave";
  if (props.entry.meetingId) return "meeting";
  if (props.entry.category === "code_review") return "review";
  return "coding";
});

const categoryLabel = computed(() => {
  switch (props.entry?.category) {
    case "coding": return "Coding";
    case "code_review": return "Code Review";
    case "dev_meeting": return "Dev Meeting";
    case "dev_misc": return "Dev Misc";
    case "non_dev": return "Non-dev";
    case "leave": return "Leave";
    default: return "";
  }
});

const icon = computed(() => {
  switch (entryType.value) {
    case "coding": return CodeBracketIcon;
    case "review": return ChatBubbleLeftEllipsisIcon;
    case "meeting":
      return props.entry?.category === "non_dev" ? CalendarIcon : CalendarDateRangeIcon;
    case "leave": return BellSlashIcon;
  }
});

const iconColor = computed(() => {
  switch (props.entry?.category) {
    case "coding": return "text-emerald-500";
    case "code_review": return "text-violet-500";
    case "dev_meeting": return "text-fuchsia-500";
    case "dev_misc": return "text-fuchsia-500";
    case "non_dev": return "text-amber-500";
    case "leave": return "text-gray-400";
    default: return "";
  }
});

// Link editor
const showLinkEditor = computed(() => {
  if (!props.entry) return false;
  // Coding/review entry with unlinked MR
  if ((entryType.value === "coding" || entryType.value === "review") && !props.entry.ticketKey) return true;
  // Meeting with no epic
  if (entryType.value === "meeting" && !props.entry.epicKey) return true;
  return false;
});

// Ticket search + link
const searchQuery = ref("");
const searchResults = ref<{ key: string; title: string; issueType: string; epicKey: string | null; epicTitle: string | null }[]>([]);
const searchLoading = ref(false);
const highlightIndex = ref(-1);
const linkError = ref("");
const linkSubmitted = ref(false);

let searchTimer: ReturnType<typeof setTimeout> | null = null;

// Reset state when entry changes
watch(() => props.entry, () => {
  searchQuery.value = "";
  searchResults.value = [];
  searchLoading.value = false;
  highlightIndex.value = -1;
  linkError.value = "";
  linkSubmitted.value = false;
});

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
    selectResult(searchResults.value[highlightIndex.value]);
  }
}

function selectResult(result: { key: string }) {
  searchResults.value = [];
  searchQuery.value = "";
  linkError.value = "";

  if (!props.entry) return;

  if (entryType.value === "meeting" && props.entry.meetingId) {
    emit("update-meeting", props.entry.meetingId, { ticketKey: result.key });
  } else if ((entryType.value === "coding" || entryType.value === "review") && props.entry.reasoning.mergeRequests?.[0]) {
    emit("update-mr", props.entry.reasoning.mergeRequests[0].id, { ticketKey: result.key });
  }
  linkSubmitted.value = true;
}

function unlinkMeeting() {
  if (!props.entry?.meetingId) return;
  emit("update-meeting", props.entry.meetingId, { epicKey: "" });
}

function mrUrl(mr: { projectPath: string; gitlabIid: number }): string {
  return `${props.gitlabBaseUrl}/${mr.projectPath}/-/merge_requests/${mr.gitlabIid}`;
}

function mrStatusClass(status: string): string {
  switch (status) {
    case "merged": return "bg-violet-100 text-violet-700";
    case "opened": return "bg-emerald-100 text-emerald-700";
    case "closed": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}
</script>
