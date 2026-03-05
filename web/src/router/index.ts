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
      path: "/share/:token",
      name: "share",
      component: { template: "<div />" },
      meta: { public: true },
      beforeEnter(to) {
        const token = to.params.token as string;
        localStorage.setItem("share_token", token);
        return { name: "dashboard" };
      },
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
    {
      path: "/pipelines",
      name: "pipelines",
      component: () => import("../views/PipelinesView.vue"),
    },
  ],
});

router.beforeEach((to) => {
  if (!to.meta.public && !isAuthenticated.value) {
    return { name: "login" };
  }
});
