import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'

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
      {
        path: 'downloads',
        name: 'Downloads',
        component: () => import('../views/Downloads/DownloadArea.vue'),
      },
    ],
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

// 路由守卫 - 验证登录状态
router.beforeEach(async (to, _from, next) => {
  const userStore = useUserStore()
  const token = localStorage.getItem('token')

  // 访问非登录页
  if (to.path !== '/login') {
    // 检查 token 是否存在
    if (!token) {
      // 没有 token,重定向到登录页
      console.log('[Router] 未登录,重定向到登录页')
      next('/login')
      return
    }

    // 有 token 但 store 未登录,尝试恢复 session
    if (!userStore.isLoggedIn) {
      console.log('[Router] Token 存在但 store 未登录,尝试恢复 session')
      const restored = await userStore.restoreSession()

      if (!restored) {
        // 恢复失败（restoreSession 已经调用了 performLogout 清理数据）
        console.log('[Router] Session 恢复失败,重定向到登录页')
        next('/login')
        return
      }

      console.log('[Router] Session 恢复成功:', userStore.user?.username)
    }

    // token 存在且 store 已登录,允许访问
    next()
  }
  // 访问登录页
  else {
    // 如果已登录,重定向到主页
    if (token && userStore.isLoggedIn) {
      console.log('[Router] 已登录,重定向到主页')
      next('/main/tasks')
    } else {
      // 未登录,允许访问登录页
      next()
    }
  }
})

export default router
