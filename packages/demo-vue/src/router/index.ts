import { createRouter, createWebHistory } from 'vue-router'
import { menuRoutes } from './menu.routes';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "home",
      component: () => import("@/pages/HomePage.vue"),
    },
    {
      path: "/combobox",
      name: "combobox-demo",
      component: () => import("@/pages/combobox/ComboboxPage.vue"),
    },
    {
      path: "/dialogs",
      name: "dialog-demo",
      component: () => import("@/pages/DialogPage.vue"),
    },
    {
      path: "/tooltips",
      name: "tooltip-demo",
      component: () => import("@/pages/tooltip/TooltipPage.vue"),
    },
    {
      path: "/popovers",
      name: "popover-demo",
      component: () => import("@/pages/popover/PopoverPage.vue"),
    },
    {
      path: "/disclosure",
      name: "disclosure-demo",
      component: () => import("@/pages/DisclosurePage.vue"),
    },
    {
      path: "/tabs",
      name: "tabs-demo",
      component: () => import("@/pages/TabsPage.vue"),
    },
    {
      path: "/workspace",
      component: () => import("@/pages/workspace/WorkspaceTabsPage.vue"),
      children: [
        { path: "", redirect: { name: "workspace-settings" } },
        {
          path: "settings",
          name: "workspace-settings",
          component: () => import("@/pages/workspace/WorkspaceSettingsContent.vue"),
        },
        {
          path: "documents/:documentId",
          name: "workspace-document",
          component: () => import("@/pages/workspace/WorkspaceDocumentContent.vue"),
        },
      ],
    },
    {
      path: "/treeview",
      name: "treeview-demo",
      component: () => import("@/pages/TreeviewPage.vue"),
    },
    {
      path: "/diagram/table",
      name: "diagram-table-workbench",
      component: () => import("@/pages/DiagramTablePage.vue"),
      meta: { layoutWidth: "full", fitViewport: true, lockMainScroll: true },
    },
    {
      path: "/diagram/connectors",
      name: "diagram-connector-workbench",
      component: () => import("@/pages/ConnectorWorkbench.vue"),
      meta: { layoutWidth: "full", fitViewport: true, lockMainScroll: true },
    },
    {
      path: "/diagram/grid",
      name: "diagram-grid-lab",
      component: () => import("@/pages/DiagramGridPage.vue"),
      meta: { layoutWidth: "full", fitViewport: true, lockMainScroll: true },
    },
    {
      path: "/diagram/canvas",
      name: "diagram-free-canvas",
      component: () => import("@/pages/DiagramCanvasPage.vue"),
      meta: { layoutWidth: "full", fitViewport: true, lockMainScroll: true },
    },
    {
      path: "/diagram",
      name: "diagram-demo",
      component: () => import("@/pages/DiagramPage.vue"),
      meta: { layoutWidth: "full", fitViewport: true, lockMainScroll: true },
    },
    ...menuRoutes,
  ],
})

export default router
