<template>
  <component :is="widget" v-if="widget" />
</template>

<script setup lang="ts">
import { computed, type Component } from "vue";
import PipelineDurationWidget from "./widgets/PipelineDurationWidget.vue";

const props = defineProps<{
  krSlug: string;
}>();

const widgetMap: Record<string, Component> = {
  "pipeline-duration": PipelineDurationWidget,
};

const widget = computed(() => widgetMap[props.krSlug] ?? null);
</script>
