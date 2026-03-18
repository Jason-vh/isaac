import { createRouter, createWebHistory } from "vue-router";
import { isAuthenticated, isShareMode, shareSection, useAuth } from "../composables/useAuth";
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
  const shareTokenParam = to.query.s as string | undefined;
  if (shareTokenParam) {
    const auth = useAuth();
    auth.shareToken.value = shareTokenParam;
    localStorage.setItem("share_token", shareTokenParam);
    auth.setSharePath(to.path);
    const { s, ...rest } = to.query;
    return { path: to.path, query: rest, params: to.params };
  }

  if (!to.meta.public && !isAuthenticated.value) {
    return { name: "login" };
  }

  // Block cross-section navigation in share mode
  if (isShareMode.value && shareSection.value) {
    const targetSection = to.path.split("/").filter(Boolean)[0];
    if (targetSection && targetSection !== shareSection.value) {
      return false;
    }
  }
});
