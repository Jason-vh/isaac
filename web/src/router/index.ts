import { createRouter, createWebHistory } from "vue-router";
import { isAuthenticated } from "../composables/useAuth";
import DashboardView from "../views/DashboardView.vue";
import LoginView from "../views/LoginView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "login",
      component: LoginView,
      meta: { public: true },
    },
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

router.beforeEach((to) => {
  if (!to.meta.public && !isAuthenticated.value) {
    return { name: "login" };
  }
});
