<template>
  <div class="min-h-screen bg-surface-1">
    <nav v-if="isAuthenticated" class="sticky top-0 z-30 border-b border-border bg-surface-0/80 backdrop-blur-md">
      <div class="mx-auto max-w-[1400px] px-4 sm:px-6">
        <div class="flex h-14 items-center justify-between gap-2">
          <router-link :to="isShareMode && shareSection ? `/${shareSection}` : '/'" class="text-lg font-bold tracking-tight text-ink">
            Isaac
          </router-link>

          <!-- Desktop nav -->
          <div class="hidden items-center gap-1 lg:flex">
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

          <!-- Mobile menu toggle -->
          <button
            class="-mr-2 flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink lg:hidden"
            :aria-expanded="menuOpen"
            aria-label="Toggle navigation"
            @click="menuOpen = !menuOpen"
          >
            <XMarkIcon v-if="menuOpen" class="h-6 w-6" />
            <Bars3Icon v-else class="h-6 w-6" />
          </button>
        </div>
      </div>

      <!-- Mobile menu -->
      <div v-if="menuOpen" class="border-t border-border bg-surface-0 lg:hidden">
        <div class="mx-auto max-w-[1400px] space-y-1 px-4 py-3 sm:px-6">
          <router-link
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="block rounded-lg px-3 py-2.5 text-base font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
            active-class="!bg-surface-2 !text-ink"
          >
            {{ link.label }}
          </router-link>
          <div class="!mt-3 border-t border-border pt-3">
            <span v-if="isShareMode" class="block px-3 py-2 text-sm text-ink-faint">Shared view</span>
            <template v-else>
              <button
                @click="share"
                class="block w-full rounded-lg px-3 py-2.5 text-left text-base text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {{ shareButtonText }}
              </button>
              <button
                @click="logout"
                class="block w-full rounded-lg px-3 py-2.5 text-left text-base text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink-muted"
              >
                Logout
              </button>
            </template>
          </div>
        </div>
      </div>
    </nav>
    <main :class="isAuthenticated ? 'mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8' : ''">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, provide, watch } from "vue";
import { useRouter } from "vue-router";
import { Bars3Icon, XMarkIcon } from "@heroicons/vue/24/outline";
import { useAuth } from "./composables/useAuth";
import { api } from "./api/client";

const router = useRouter();
const { isAuthenticated, isShareMode, shareSection, logout: doLogout } = useAuth();

provide("isShareMode", isShareMode);

const allNavLinks = [
  { to: "/wbso", label: "WBSO", section: "wbso" },
  { to: "/objectives", label: "Objectives", section: "objectives" },
  { to: "/team", label: "Team", section: "team" },
  { to: "/reviews", label: "Reviews", section: "reviews" },
  { to: "/pipelines", label: "Pipelines", section: "pipelines" },
];

const navLinks = computed(() => {
  if (isShareMode.value && shareSection.value) {
    return allNavLinks.filter((l) => l.section === shareSection.value);
  }
  return allNavLinks;
});

const menuOpen = ref(false);

// Close the mobile menu on navigation
watch(() => router.currentRoute.value.fullPath, () => (menuOpen.value = false));

const shareButtonText = ref("Share");

async function share() {
  try {
    const { token } = await api.post<{ token: string; expiresAt: string }>("/share", { path: router.currentRoute.value.fullPath });
    const shareUrl = new URL(window.location.origin + router.currentRoute.value.fullPath);
    shareUrl.searchParams.set("s", token);
    await navigator.clipboard.writeText(shareUrl.toString());
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
