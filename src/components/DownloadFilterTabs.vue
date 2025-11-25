<template>
  <div class="filter-tabs-container">
    <!-- 筛选标签栏 -->
    <div class="filter-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="['filter-tab', { active: currentFilter === tab.key }]"
        @click="handleFilterChange(tab.key)"
      >
        {{ tab.label }}
        <span class="badge">{{ counts[tab.key] }}</span>
      </button>
    </div>

    <!-- 清除已完成按钮 -->
    <button
      v-if="counts.completed > 0"
      class="clear-completed-btn"
      @click="handleClearCompleted"
    >
      <el-icon :size="14">
        <Delete />
      </el-icon>
      清除已完成
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Delete } from '@element-plus/icons-vue'
import { DownloadStatus } from '@/types/download'

// 筛选类型定义
export type FilterType = 'all' | DownloadStatus

interface Props {
  currentFilter: FilterType
  counts: Record<FilterType, number>
}

interface Emits {
  (e: 'filter-change', filter: FilterType): void
  (e: 'clear-completed'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 标签配置
const tabs = computed(() => [
  { key: 'all' as FilterType, label: '全部' },
  { key: DownloadStatus.DOWNLOADING as FilterType, label: '下载中' },
  { key: DownloadStatus.WAITING as FilterType, label: '等待中' },
  { key: DownloadStatus.SUCCESS as FilterType, label: '已完成' },
  { key: DownloadStatus.FAILED as FilterType, label: '失败' },
])

// 处理筛选变更
const handleFilterChange = (filter: FilterType) => {
  emit('filter-change', filter)
}

// 处理清除已完成
const handleClearCompleted = () => {
  emit('clear-completed')
}
</script>

<style scoped lang="scss">
@import '@/assets/styles/download.scss';
</style>
