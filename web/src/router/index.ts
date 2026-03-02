import { createRouter, createWebHistory } from "vue-router";
import DashboardView from "../views/DashboardView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "dashboard",
      component: DashboardView,
    },
    {
      path: "/wbso",
      name: "wbso",
      component: () => import("../views/WbsoView.vue"),
    },
    {
      path: "/objectives",
      name: "objectives",
      component: () => import("../views/ObjectivesView.vue"),
    },
  ],
});
