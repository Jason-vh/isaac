<template>
  <div class="min-h-screen bg-gray-50">
    <nav v-if="isAuthenticated" class="border-b border-gray-200 bg-white">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div class="flex h-14 items-center justify-between">
          <router-link to="/" class="text-lg font-semibold text-gray-900">
            Isaac
          </router-link>
          <div class="flex items-center gap-6">
            <router-link
              to="/"
              class="text-sm text-gray-600 hover:text-gray-900"
            >
              Dashboard
            </router-link>
            <router-link
              to="/wbso"
              class="text-sm text-gray-600 hover:text-gray-900"
            >
              WBSO
            </router-link>
            <router-link
              to="/objectives"
              class="text-sm text-gray-600 hover:text-gray-900"
            >
              Objectives
            </router-link>
            <button
              @click="logout"
              class="text-sm text-gray-400 hover:text-gray-600"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
    <main :class="isAuthenticated ? 'mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8' : ''">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import { useAuth } from "./composables/useAuth";

const router = useRouter();
const { isAuthenticated, logout: doLogout } = useAuth();

function logout() {
  doLogout();
  router.push("/login");
}
</script>
