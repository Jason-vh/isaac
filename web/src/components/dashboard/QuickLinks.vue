<template>
  <div class="card overflow-hidden">
    <h3 class="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
      Quick Links
    </h3>
    <div class="p-2">
      <template v-for="link in links" :key="link.label">
        <router-link
          v-if="link.internal"
          :to="link.url"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <span class="flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 text-[13px]">
            {{ link.icon }}
          </span>
          <span class="font-medium">{{ link.label }}</span>
        </router-link>
        <a
          v-else
          :href="link.url"
          target="_blank"
          rel="noopener"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <span class="flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 text-[13px]">
            {{ link.icon }}
          </span>
          <span class="font-medium">{{ link.label }}</span>
          <ArrowTopRightOnSquareIcon class="ml-auto h-3.5 w-3.5 text-ink-faint" />
        </a>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowTopRightOnSquareIcon } from "@heroicons/vue/20/solid";

const links = [
  {
    label: "Jira Board",
    url: "https://fareharbor.atlassian.net/jira/software/projects/DESK/boards",
    icon: "\u{1F4CB}",
    internal: false,
  },
  {
    label: "GitLab MRs",
    url: "https://gitlab.com/fareharbor-com/teams/desk/desk/-/merge_requests?author_username=jason.vanhattum",
    icon: "\u{1F500}",
    internal: false,
  },
  {
    label: "Confluence",
    url: "https://fareharbor.atlassian.net/wiki/spaces/DESK",
    icon: "\u{1F4C4}",
    internal: false,
  },
  {
    label: "WBSO Hours",
    url: "/wbso",
    icon: "\u{23F1}",
    internal: true,
  },
  {
    label: "Objectives",
    url: "/objectives",
    icon: "\u{1F3AF}",
    internal: true,
  },
];
</script>
