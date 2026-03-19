<template>
  <div>
    <div v-if="loading && !data" class="py-20 text-center text-ink-faint">
      Loading...
    </div>
    <div v-else-if="error" class="py-20 text-center text-red-500">
      {{ error }}
    </div>
    <template v-else-if="data">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-ink">Activity</h1>
          <p class="mt-1 text-sm text-ink-faint">
            {{ data.total }} notification{{ data.total === 1 ? "" : "s" }} in the last {{ days }} days
          </p>
        </div>
        <div class="flex items-center gap-2">
          <div v-if="loading" class="text-sm text-ink-faint">Updating...</div>
          <div class="flex rounded-lg border border-border bg-surface-0">
            <button
              v-for="preset in [7, 14, 30, 60]"
              :key="preset"
              @click="setDays(preset)"
              :class="[
                'px-3 py-1.5 text-sm font-medium transition-colors first:rounded-l-lg last:rounded-r-lg',
                days === preset
                  ? 'bg-surface-2 text-ink'
                  : 'text-ink-muted hover:bg-surface-1 hover:text-ink',
              ]"
            >
              {{ preset }}d
            </button>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-if="data.days.length === 0"
        class="mt-12 py-20 text-center text-ink-faint"
      >
        No activity items yet. Notifications will appear here once
        isaac-notify starts processing emails.
      </div>

      <!-- Day groups -->
      <div v-else class="mt-6 space-y-6">
        <div
          v-for="day in data.days"
          :key="day.date"
          class="overflow-hidden rounded-xl border border-border bg-surface-0"
        >
          <!-- Day header -->
          <div class="border-b border-border/50 bg-surface-1/50 px-5 py-2.5">
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold text-ink">
                {{ formatDayHeader(day.date) }}
              </h2>
              <span class="text-xs text-ink-faint">
                {{ day.items.length }} item{{ day.items.length === 1 ? "" : "s" }}
              </span>
            </div>
          </div>

          <!-- Items -->
          <ul class="divide-y divide-border/50">
            <li
              v-for="item in day.items"
              :key="item.id"
              class="flex items-start gap-3 px-5 py-3"
            >
              <!-- Icon -->
              <div
                class="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                :class="iconBg(item.sourceType)"
              >
                <span class="text-sm">{{ emoji(item.sourceType) }}</span>
              </div>

              <!-- Content -->
              <div class="min-w-0 flex-1">
                <p class="text-sm text-ink">
                  <span v-if="item.actor" class="font-medium">{{ item.actor }}</span>
                  <span v-if="item.actor" class="text-ink-muted">
                    {{ ' ' + verb(item.sourceType) + ' ' }}
                  </span>
                  <span v-else class="text-ink-muted">
                    {{ verbNoActor(item.sourceType) + ' ' }}
                  </span>
                  <a
                    :href="item.externalUrl"
                    target="_blank"
                    rel="noopener"
                    class="font-medium hover:text-accent hover:underline"
                  >
                    {{ item.title }}
                  </a>
                  <template v-if="item.ticketKey">
                    <span class="text-ink-muted"> · </span>
                    <a
                      :href="`${data.jiraBrowseUrl}/${item.ticketKey}`"
                      target="_blank"
                      rel="noopener"
                      class="text-ink-muted hover:text-accent hover:underline"
                    >
                      {{ item.ticketKey }}
                    </a>
                    <span
                      v-if="item.epicName"
                      class="text-ink-faint"
                    >
                      ({{ item.epicName }})
                    </span>
                  </template>
                </p>
                <!-- Comment body -->
                <p
                  v-if="item.body && (item.sourceType === 'gitlab_comment' || item.sourceType === 'mentioned')"
                  class="mt-1 border-l-2 border-border pl-3 text-xs text-ink-muted line-clamp-2"
                >
                  {{ item.body }}
                </p>
              </div>

              <!-- Time -->
              <time class="mt-0.5 flex-shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
                {{ formatTime(item.occurredAt) }}
              </time>
            </li>
          </ul>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useActivity } from "../composables/useActivity";
import type { ActivitySourceType } from "@isaac/shared";

const { data, loading, error, days, setDays } = useActivity();

function emoji(type: ActivitySourceType): string {
  switch (type) {
    case "gitlab_comment":
    case "mentioned":
      return "💬";
    case "gitlab_approval":
      return "🥓";
    case "gitlab_merge":
      return "🔀";
    case "pipeline_success":
      return "🎉";
    case "pipeline_failure":
      return "🔥";
    case "review_request":
      return "👀";
    case "commits_pushed":
      return "📦";
    case "marked_ready":
      return "✅";
  }
}

function iconBg(type: ActivitySourceType): string {
  switch (type) {
    case "gitlab_comment":
    case "mentioned":
      return "bg-gray-100";
    case "gitlab_approval":
      return "bg-emerald-50";
    case "gitlab_merge":
      return "bg-violet-50";
    case "pipeline_success":
      return "bg-green-50";
    case "pipeline_failure":
      return "bg-red-50";
    case "review_request":
      return "bg-blue-50";
    case "commits_pushed":
      return "bg-amber-50";
    case "marked_ready":
      return "bg-green-50";
  }
}

function verb(type: ActivitySourceType): string {
  switch (type) {
    case "gitlab_comment":
      return "commented on";
    case "gitlab_approval":
      return "approved";
    case "gitlab_merge":
      return "merged";
    case "pipeline_success":
      return "";
    case "pipeline_failure":
      return "";
    case "review_request":
      return "requested review on";
    case "commits_pushed":
      return "pushed commits to";
    case "mentioned":
      return "mentioned you on";
    case "marked_ready":
      return "marked as ready";
  }
}

function verbNoActor(type: ActivitySourceType): string {
  switch (type) {
    case "pipeline_success":
      return "Pipeline passed for";
    case "pipeline_failure":
      return "Pipeline failed for";
    default:
      return verb(type);
  }
}

function formatDayHeader(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateStr === today.toISOString().slice(0, 10)) return "Today";
  if (dateStr === yesterday.toISOString().slice(0, 10)) return "Yesterday";

  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
</script>
