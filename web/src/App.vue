<template>
  <div class="min-h-screen bg-surface-1">
    <nav v-if="isAuthenticated" class="sticky top-0 z-30 border-b border-border bg-surface-0/80 backdrop-blur-md">
      <div class="mx-auto max-w-[1400px] px-6">
        <div class="flex h-14 items-center justify-between">
          <router-link to="/" class="text-lg font-bold tracking-tight text-ink">
            Isaac
          </router-link>
          <div class="flex items-center gap-1">
            <router-link
              v-for="link in navLinks"
              :key="link.to"
              :to="link.to"
              class="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              active-class="!bg-surface-2 !text-ink"
            >
              {{ link.label }}
            </router-link>
            <div class="ml-3 h-5 w-px bg-border" />
            <template v-if="isShareMode">
              <span class="ml-2 text-xs text-ink-faint">Shared view</span>
            </template>
            <template v-else>
              <button
                @click="share"
                class="ml-2 rounded-lg px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {{ shareButtonText }}
              </button>
              <button
                @click="logout"
                class="rounded-lg px-3 py-1.5 text-sm text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink-muted"
              >
                Logout
              </button>
            </template>
          </div>
        </div>
      </div>
    </nav>
    <main :class="isAuthenticated ? 'mx-auto max-w-[1400px] px-6 py-8' : ''">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, provide } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "./composables/useAuth";
import { api } from "./api/client";

const router = useRouter();
const { isAuthenticated, isShareMode, logout: doLogout } = useAuth();

provide("isShareMode", isShareMode);

const navLinks = [
  { to: "/", label: "Dashboard" },
  { to: "/wbso", label: "WBSO" },
  { to: "/objectives", label: "Objectives" },
  { to: "/pipelines", label: "Pipelines" },
];

const shareButtonText = ref("Share");

async function share() {
  try {
    const { url } = await api.post<{ url: string; expiresAt: string }>("/share", {});
    await navigator.clipboard.writeText(url);
    shareButtonText.value = "Copied!";
    setTimeout(() => (shareButtonText.value = "Share"), 2000);
  } catch {
    shareButtonText.value = "Failed";
    setTimeout(() => (shareButtonText.value = "Share"), 2000);
  }
}

function logout() {
  doLogout();
  router.push("/login");
}
</script>
