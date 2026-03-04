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
            <button
              @click="logout"
              class="ml-2 rounded-lg px-3 py-1.5 text-sm text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink-muted"
            >
              Logout
            </button>
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
import { useRouter } from "vue-router";
import { useAuth } from "./composables/useAuth";

const router = useRouter();
const { isAuthenticated, logout: doLogout } = useAuth();

const navLinks = [
  { to: "/", label: "Dashboard" },
  { to: "/wbso", label: "WBSO" },
  { to: "/objectives", label: "Objectives" },
];

function logout() {
  doLogout();
  router.push("/login");
}
</script>
