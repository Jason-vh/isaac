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
      path: "/admin",
      name: "admin",
      component: () => import("../views/AdminView.vue"),
    },
    {
      path: "/",
      redirect: "/dashboard",
    },
    {
      path: "/dashboard/:week?",
      name: "dashboard",
      component: DashboardView,
    },
    {
      path: "/wbso/:week?",
      name: "wbso",
      component: () => import("../views/WbsoView.vue"),
    },
    {
      path: "/objectives",
      children: [
        {
          path: "",
          redirect: "/objectives/feature-adoption",
        },
        {
          path: ":slug",
          name: "objective-detail",
          component: () => import("../views/ObjectiveDetailView.vue"),
        },
      ],
    },
{
      path: "/pipelines",
      children: [
        {
          path: "",
          name: "pipelines",
          component: () => import("../views/PipelinesView.vue"),
        },
        {
          path: "mr/:id",
          name: "mr-pipelines",
          component: () => import("../views/MrPipelinesView.vue"),
        },
        {
          path: ":id",
          name: "pipeline-detail",
          component: () => import("../views/PipelineDetailView.vue"),
        },
      ],
    },
  ],
});

router.beforeEach((to) => {
  if (!to.meta.public && !isAuthenticated.value) {
    return { name: "login" };
  }
});
