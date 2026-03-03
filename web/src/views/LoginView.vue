<template>
  <div class="flex min-h-screen items-center justify-center bg-gray-50">
    <div class="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
      <!-- Setup mode -->
      <template v-if="needsSetup">
        <h1 class="text-xl font-semibold text-gray-900">Welcome to Isaac</h1>
        <p class="mt-2 text-sm text-gray-600">
          Register a passkey to get started.
        </p>
        <div class="mt-6">
          <label for="label" class="block text-sm font-medium text-gray-700">
            Passkey name
          </label>
          <input
            id="label"
            v-model="label"
            type="text"
            placeholder="e.g. MacBook Touch ID"
            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <button
          @click="handleRegister"
          :disabled="loading || !label.trim()"
          class="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {{ loading ? "Registering..." : "Register Passkey" }}
        </button>
      </template>

      <!-- Login mode -->
      <template v-else>
        <h1 class="text-xl font-semibold text-gray-900">Sign in to Isaac</h1>
        <p class="mt-2 text-sm text-gray-600">
          Authenticate with your passkey.
        </p>
        <button
          @click="handleAuthenticate"
          :disabled="loading"
          class="mt-6 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {{ loading ? "Authenticating..." : "Authenticate with Passkey" }}
        </button>
      </template>

      <p v-if="error" class="mt-3 text-sm text-red-600">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";

const router = useRouter();
const { needsSetup, isAuthenticated, checkStatus, register, authenticate } =
  useAuth();

const label = ref("MacBook Touch ID");
const loading = ref(false);
const error = ref("");

onMounted(async () => {
  if (isAuthenticated.value) {
    router.replace("/");
    return;
  }
  try {
    await checkStatus();
  } catch (e: any) {
    error.value = e.message;
  }
});

async function handleRegister() {
  loading.value = true;
  error.value = "";
  try {
    await register(label.value.trim());
    router.replace("/");
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function handleAuthenticate() {
  loading.value = true;
  error.value = "";
  try {
    await authenticate();
    router.replace("/");
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>
