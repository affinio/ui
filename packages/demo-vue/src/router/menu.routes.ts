import type { RouteRecordRaw } from "vue-router"

export const menuRoutes: RouteRecordRaw[] = [
  {
    path: "/menu",
    component: () => import("@/pages/menu/MenuPage.vue"),
    children: [
      {
        path: "",
        redirect: { name: "menu.simple" },
      },
      {
        path: "simple",
        name: "menu.simple",
        component: () => import("@/pages/menu/SimpleMenu.vue"),
      },
      {
        path: "nested",
        name: "menu.nested",
        component: () => import("@/pages/menu/NestedMenu.vue"),
      },
      {
        path: "context",
        name: "menu.context",
        component: () => import("@/pages/menu/ContextMenu.vue"),
      },
      {
        path: "command",
        name: "menu.command",
        component: () => import("@/pages/menu/CommandMenu.vue"),
      },
      {
        path: "stress",
        name: "menu.stress",
        component: () => import("@/pages/menu/StressTestMenu.vue"),
      },
    ],
  },
]
