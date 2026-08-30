import fs from 'node:fs';
import { buildTheme, themeRoot } from './build-theme.mjs';

const watchedFiles = new Map();
let timer;

function closeWatchers() {
  for (const [file, listener] of watchedFiles) {
    fs.unwatchFile(file, listener);
  }
  watchedFiles.clear();
}

function scheduleBuild() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    void rebuild();
  }, 150);
}

function watchDependencies(dependencies) {
  closeWatchers();
  for (const file of dependencies) {
    const listener = (current, previous) => {
      if (current.mtimeMs !== previous.mtimeMs || current.size !== previous.size) {
        scheduleBuild();
      }
    };
    fs.watchFile(file, { interval: 500, persistent: true }, listener);
    watchedFiles.set(file, listener);
  }
  console.log(`已使用低频轮询监听 ${watchedFiles.size} 个 Less 依赖，避免 macOS 文件描述符耗尽。`);
}

async function rebuild() {
  try {
    const result = await buildTheme();
    watchDependencies(result.dependencies);
  } catch (error) {
    console.error(`主题构建失败，已保留上一份成功 CSS：${error instanceof Error ? error.message : String(error)}`);
  }
}

function shutdown() {
  clearTimeout(timer);
  closeWatchers();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`正在监听主题目录：${themeRoot}`);
await rebuild();
