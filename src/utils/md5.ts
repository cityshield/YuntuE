/**
 * MD5 计算工具
 */
import SparkMD5 from 'spark-md5'

/**
 * 计算文件 MD5
 * @param file 文件对象
 * @param onProgress 进度回调 (0-100)
 * @returns MD5 字符串
 */
export async function calculateFileMD5(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const blobSlice = File.prototype.slice
    const chunkSize = 2097152 // 2MB per chunk
    const chunks = Math.ceil(file.size / chunkSize)
    let currentChunk = 0
    const spark = new SparkMD5.ArrayBuffer()
    const fileReader = new FileReader()

    fileReader.onload = (e) => {
      try {
        spark.append(e.target?.result as ArrayBuffer)
        currentChunk++

        // 更新进度
        if (onProgress) {
          onProgress(Math.floor((currentChunk / chunks) * 100))
        }

        if (currentChunk < chunks) {
          loadNext()
        } else {
          const md5 = spark.end()
          console.log(`MD5 calculated for ${file.name}: ${md5}`)
          resolve(md5)
        }
      } catch (error) {
        reject(error)
      }
    }

    fileReader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    function loadNext() {
      const start = currentChunk * chunkSize
      const end = start + chunkSize >= file.size ? file.size : start + chunkSize
      fileReader.readAsArrayBuffer(blobSlice.call(file, start, end))
    }

    loadNext()
  })
}

/**
 * 批量计算文件 MD5
 * @param files 文件数组
 * @param onProgress 进度回调 (已完成数量, 总数量)
 * @returns MD5 数组
 */
export async function calculateBatchMD5(
  files: File[],
  onProgress?: (completed: number, total: number) => void
): Promise<{ file: File; md5: string }[]> {
  const results: { file: File; md5: string }[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const md5 = await calculateFileMD5(file)
    results.push({ file, md5 })

    if (onProgress) {
      onProgress(i + 1, files.length)
    }
  }

  return results
}

/**
 * 计算字符串 MD5
 * @param text 文本内容
 * @returns MD5 字符串
 */
export function calculateTextMD5(text: string): string {
  return SparkMD5.hash(text)
}
