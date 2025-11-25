#!/usr/bin/env node

/**
 * 使用 PyInstaller 将 Python 脚本打包为独立可执行文件
 * 包含 Python 解释器和所有依赖，不依赖外部环境
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function checkPyInstallerInstalled() {
  try {
    execSync('pyinstaller --version', { stdio: 'ignore' })
    return true
  } catch (error) {
    return false
  }
}

function installPyInstaller() {
  console.log('[Package Python] PyInstaller 未安装，正在安装...')
  try {
    execSync('pip install pyinstaller', {
      stdio: 'inherit',
      cwd: process.cwd(),
    })
    console.log('[Package Python] ✓ PyInstaller 安装完成')
    return true
  } catch (error) {
    console.error('[Package Python] ✗ PyInstaller 安装失败')
    console.error('[Package Python] 请手动安装: pip install pyinstaller')
    return false
  }
}

function packagePython() {
  console.log('[Package Python] 开始打包 Python 脚本为独立可执行文件...')
  
  // 检查并安装 PyInstaller
  if (!checkPyInstallerInstalled()) {
    if (!installPyInstaller()) {
      console.error('[Package Python] 无法继续，请先安装 PyInstaller')
      process.exit(1)
    }
  }

  const wrapperScript = path.join(process.cwd(), 'electron', 'scripts', 'maya_package_wrapper.py')
  const obfuscatedDir = path.join(process.cwd(), 'python', 'get_maya_plug4_obfuscated')
  // 使用专用目录，避免与前端构建的 dist 和 electron-builder 的 build 冲突
  const pythonDistDir = path.join(process.cwd(), 'python-dist')
  const pythonBuildDir = path.join(process.cwd(), 'python-build')
  // 目标目录：electron/scripts/dist
  const targetDir = path.join(process.cwd(), 'electron', 'scripts', 'dist')

  if (!fs.existsSync(wrapperScript)) {
    console.error(`[Package Python] 包装脚本不存在: ${wrapperScript}`)
    process.exit(1)
  }

  // 检查混淆后的代码是否存在
  if (!fs.existsSync(obfuscatedDir)) {
    console.warn(`[Package Python] 混淆后的代码目录不存在: ${obfuscatedDir}`)
    console.warn('[Package Python] 将使用原始代码（未混淆）')
  }

  try {
    // 清理之前的 PyInstaller 构建（使用专用目录，不影响前端构建）
    if (fs.existsSync(pythonDistDir)) {
      fs.rmSync(pythonDistDir, { recursive: true, force: true })
    }
    if (fs.existsSync(pythonBuildDir)) {
      fs.rmSync(pythonBuildDir, { recursive: true, force: true })
    }

    // 使用 PyInstaller 打包
    // --onefile: 打包为单个可执行文件
    // --name: 可执行文件名称
    // --hidden-import: 隐藏导入的模块
    // --add-data: 添加数据文件（混淆后的代码）
    // --paths: 添加 Python 路径
    const hiddenImports = [
      'core.processor',
      'core.logger',
      'parsers.scene_inspector',
      'parsers.file_path_extractor',
      'parsers.xgen_parser',
      'builders.package_builder',
      'utils.maya_version',
      'utils.path_utils',
      'xxhash'
    ]

    // Windows 使用分号，Linux/Mac 使用冒号
    const pathSeparator = process.platform === 'win32' ? ';' : ':'
    
    const addDataParts = []
    if (obfuscatedDir && fs.existsSync(obfuscatedDir)) {
      addDataParts.push(`"${obfuscatedDir}${pathSeparator}get_maya_plug4_obfuscated"`)
    }

    const paths = [
      path.join(process.cwd(), 'python', 'get_maya_plug4_obfuscated'),
      path.join(process.cwd(), 'python', 'get_maya_plug4')
    ].filter(p => fs.existsSync(p))

    // 确保目标目录存在
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    const commandParts = [
      'pyinstaller',
      '--onefile',
      '--name', 'maya_package_wrapper',
      '--distpath', `"${targetDir}"`,  // 指定输出目录
      '--workpath', `"${pythonBuildDir}"`,   // 指定工作目录（使用专用目录）
      '--clean',
      ...hiddenImports.map(m => `--hidden-import ${m}`),
      ...addDataParts.map(d => `--add-data ${d}`),
      ...paths.map(p => `--paths "${p}"`),
      `"${wrapperScript}"`
    ]

    const command = commandParts.join(' ')
    
    console.log(`[Package Python] 执行命令: ${command}`)
    execSync(command, {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8'
      }
    })
    
    const exePath = path.join(targetDir, 'maya_package_wrapper.exe')
    if (fs.existsSync(exePath)) {
      console.log(`[Package Python] ✓ 打包完成: ${exePath}`)
      console.log(`[Package Python] ✓ 可执行文件已生成在目标目录`)
    } else {
      console.error(`[Package Python] ✗ 可执行文件未生成: ${exePath}`)
      process.exit(1)
    }
  } catch (error) {
    console.error(`[Package Python] ✗ 打包失败`)
    console.error(error.message)
    process.exit(1)
  }
}

function main() {
  packagePython()
  console.log('[Package Python] 完成！')
}

main()

