# 极简计时器 · 静态 Web 技术方案

> 面向视频延迟对比与运动训练的垂直计时工具，纯前端实现，零后端，一键部署。

## 一、技术栈选型

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 标记/样式 | HTML5 + 原生 CSS + Tailwind CDN | 已有设计稿沿用，无需构建链 |
| 脚本 | 原生 JavaScript（ES2020+，无框架） | 体积小、加载快、可单文件部署 |
| 计时内核 | `performance.now()` + `requestAnimationFrame` | 毫秒级高精度、不漂移 |
| 音频 | Web Audio API（合成音） + HTMLAudioElement（自定义） | 铃声/叮咚/蜂鸣可代码合成，无需音频文件 |
| 持久化 | `localStorage`（~5KB） | 保存铃声、音量、自定义时长 |
| 部署 | 静态托管（GitHub Pages / Vercel / Netlify / 本地 `python -m http.server`） | 零服务器配置 |

**不依赖**：后端、数据库、Node 构建、npm 依赖、图片素材（全部代码合成）。

## 二、核心功能实现

### 1. 秒表（毫秒级）

```
状态机： idle → running → paused → running / idle
```

- 启动时记录 `startOffset = performance.now() - accumulatedMs`
- 每帧 `requestAnimationFrame` 回调计算 `elapsed = performance.now() - startOffset`
- 暂停时累加 `accumulatedMs`，停止 rAF 循环
- 显示：`MM:SS.mmm`，毫秒位降级配色
- 计次（Lap）：记录当前 `elapsed` 与上一圈差值

### 2. 倒计时（默认 25 分钟）

- 设定 `targetMs = duration * 60_000`
- `remaining = targetMs - elapsed`
- 到 `remaining <= 0` 触发铃声 + 屏幕闪烁
- 预设：5 / 15 / 25（默认激活）/ 45 分钟 + 自定义输入
- 进度条宽度 = `elapsed / targetMs * 100%`

### 3. 铃声系统（5 档）

| 选项 | 实现 | 资源 |
| --- | --- | --- |
| 铃声 | Web Audio 合成正弦波衰减包络 | 代码合成 |
| 叮咚 | 双音（高→低）短包络 | 代码合成 |
| 蜂鸣 | 方波持续 800ms | 代码合成 |
| 静音 | 仅触发屏幕闪烁（body 闪烁 `danger` 描边） | 无音频 |
| 自定义 | `FileReader` 读取本地音频 → `Audio` 播放；或粘贴 URL | 用户上传 |

- 音量：`GainNode` 控制总音量（0–100）
- 试听按钮：复用同一播放函数，时长 1.5 秒预览

### 4. 设置持久化

```json
// localStorage key: "timer-settings"
{
  "sound": "bell",
  "volume": 70,
  "customDuration": 25,
  "customSoundUrl": "" 
}
```

页面加载时回填；无配置时用默认值（铃声 / 70 / 25）。

## 三、页面与路由

保留现有 3 个 HTML 页面，用 `<a>` + `data-dom-id` 做跳转（已实现）：

```
index.html    秒表（默认）
countdown.html  倒计时
settings.html   铃声设置
```

导航：顶部 Tab 切换 + 倒计时页「铃声」按钮 → 设置弹层。

## 四、目录结构

```
stopwatch-timer/
├── stopwatch-timer.design      # 画布（已存在）
├── colors_and_type.css        # 设计令牌（已存在）
├── pages/
│   ├── index.html             # 秒表
│   ├── countdown.html         # 倒计时
│   └── settings.html          # 铃声设置
└── assets/
    └── app.js                 # 共享脚本（计时内核 + 音频 + 存储）
```

`app.js` 在三个页面共享，通过 `data-page="stopwatch|countdown|settings"` 属性区分初始化逻辑。

## 五、部署方案（极简）

### 方案 A：本地预览
```
cd stopwatch-timer && python -m http.server 8080
```

### 方案 B：GitHub Pages
1. 推到 `main` 分支
2. Settings → Pages → Source: `main` / root
3. 访问 `https://<user>.github.io/stopwatch-timer/`

### 方案 C：Vercel / Netlify
- 拖拽文件夹上传，或连接 Git 仓库
- 无构建命令，输出目录 `.`
- 自动 HTTPS + CDN

## 六、广告位预留

- 秒表/倒计时页底部预留 `.ad-slot` 容器（虚线占位已存在）
- 后续接入：Google AdSense 嵌入 `<ins>` 标签，或接入直接广告主 iframe
- 静态部署不影响广告 SDK 加载（AdSense 纯客户端脚本）

## 七、性能与精度保障

- `performance.now()` 精度可达微秒，不受系统时钟跳变影响
- rAF 在后台标签页会被节流（~1Hz），倒计时用 `setTimeout` 兜底校正
- 标签页恢复时按 `elapsed` 重算显示，不丢失进度
- 总 JS 体积目标 < 8KB（无第三方库）

## 八、兼容性

- Chrome / Edge / Safari / Firefox 现代版本（2022+）
- Web Audio API、localStorage、FileReader 均为稳定标准
- 移动端浏览器兼容（响应式已做 ~360px 起）

## 九、实施步骤

1. 在现有 3 个 HTML 页面底部引入 `assets/app.js`
2. 实现计时内核（秒表 + 倒计时共用 `TimerEngine` 类）
3. 实现音频引擎（`SoundEngine` 合成 + 播放）
4. 接入设置弹窗的试听/保存逻辑
5. 接入 localStorage 持久化
6. 本地验证三个页面交互 + 铃声触发
7. 推送静态托管
