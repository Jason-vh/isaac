<template>
  <div class="min-h-screen bg-gray-50">
    <nav class="border-b border-gray-200 bg-white">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div class="flex h-14 items-center justify-between">
          <router-link to="/" class="text-lg font-semibold text-gray-900">
            Isaac
          </router-link>
          <div class="flex gap-6">
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
          </div>
        </div>
      </div>
    </nav>
    <main class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <router-view />
    </main>
  </div>
</template>
