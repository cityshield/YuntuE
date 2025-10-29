import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    redirect: '/login',
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
  },
  {
    path: '/main',
    name: 'Main',
    component: () => import('../views/Main.vue'),
    redirect: '/main/tasks',
    children: [
      {
        path: 'tasks',
        name: 'Tasks',
        component: () => import('../views/Tasks/TaskList.vue'),
      },
      {
        path: 'upload',
        name: 'Upload',
        component: () => import('../views/Upload/UploadArea.vue'),
      },
    ],
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

// 路由守卫
router.beforeEach((to, _from, next) => {
  // 检查登录状态
  const token = localStorage.getItem('token')

  if (to.path !== '/login' && !token) {
    // 未登录，跳转到登录页
    next('/login')
  } else if (to.path === '/login' && token) {
    // 已登录，跳转到主页
    next('/main/tasks')
  } else {
    next()
  }
})

export default router
