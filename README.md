# Koyoi

<p align="center">
  <b>打开一本书，走进一个世界。</b>
</p>

<p align="center">
  <a href="https://github.com/gucheng910/koyoi/stargazers"><img src="https://img.shields.io/github/stars/gucheng910/koyoi?style=flat&logo=github&color=fbbf24&labelColor=1e293b" alt="Stars"></a>
  <a href="https://github.com/gucheng910/koyoi/releases/latest"><img src="https://img.shields.io/github/v/release/gucheng910/koyoi?style=flat&color=059669&labelColor=1e293b" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat&labelColor=1e293b" alt="MIT"></a>
</p>

<p align="center">
  ⭐ 如果这个项目对你有帮助，请点个 Star 支持一下！
</p>

**Koyoi** 是一款 AI 驱动的互动小说移动端app。上传你喜欢的 txt 小说，AI 会自动分析角色关系、提取剧情时间线、学习写作风格，然后让你**穿越到故事中**——以角色的身份介入剧情，改变命运。

说实话，本来只是想搭建一个架构，以满足我那奇妙的不可言说的想法，却意外的发现这个架构对小说作品的演绎效果不错，于是干脆去掉了我的那些不合时宜的想法，把它上传到github，希望能得到各位大佬的指点和建议。该架构说到底也就是力大砖飞，感谢deepseek的低廉价格使它得以有实际的意义。梁圣万岁。

## ✨ 核心体验

你不再是一个旁观者。你走进小说的世界，和角色对话、影响他们的选择、甚至改变故事的走向。AI 不只是生成文字——它在维护一个**活的世界**：角色有自己的日程和情绪，关系会随时间漂移，背景事件在你看不见的地方继续发生。

**它不是 ChatBot。它是一个会呼吸的故事引擎。**

## 🎯 功能

### 同人穿越（核心）
- 上传 txt 小说 → 自动分章 → AI 逐章分析角色/事件/文风
- 支持 GBK/UTF-8/Big5 等编码，基于 ICU chardet 自动识别
- 魂穿（占据角色身体）或身穿（本体降临）两种模式
- 从特定章节/时间点进入，AI 会根据穿越设定构建不同的世界开局

### 知识库引擎
- 逐块分析小说，提取角色网络、关系变化、关键事件、说话风格
- 全局时间线合成 + 角色弧线推断
- 流水线式并发分析，自适应限流

### 世界推演
- 角色有独立人格（表面性格 + 深层性格 + 防御机制 + 矛盾点）
- 情绪惯性系统：角色情绪跨轮次累积，未表达的情绪可能在不适当时刻爆发
- 记忆闪回：每次对话前检索相关记忆注入 prompt
- 角色自主互动：NPC 之间会自发产生对话和冲突
- 世界呼吸：背景事件在玩家视线之外继续发生
- 叙事导演（Director Model）：每 5 轮自动评估叙事节奏，推进剧情或建议转场
- 谣言传播系统：玩家行为可能被目击并沿社交网络传播

### 写作质量
- 多种 AI 提供商支持（任意 OpenAI 兼容 API）（主要兼容deepseek v4）
- 流式输出 + 可选自动润色（去 AI 味，对齐原著风格）
- 章节原文注入：AI 始终知道"当前场景在原著哪一段"

### 分析体验
- 分析进度可视化 + 角色台词卡片 + 剧情时间线逐步浮现
- 分析完成后自动提取 53+ 角色和 90+ 剧情事件

### 体验
- 分组列表式 UI（卡片交错宽度、呼吸灯）
- 深色/浅色双主题
- 纯本地存储，仅 API 调用联网
- 用量追踪（token + 费用）
- 网络状态检测：断网时自动提示
- 上下文持久化：退出重进后世界状态完整保留

## 🛠️ 技术栈

| 层 | 技术 |
|---|---|
| 框架 | React Native + Expo SDK 56 |
| 语言 | TypeScript |
| AI | DeepSeek V4 / 兼容 OpenAI API |
| 状态 | Zustand |
| 存储 | AsyncStorage + expo-file-system + expo-secure-store |
| 编码 | 基于 ICU chardet 的 `char-encoding-detector` + 自研 GBK 解码表 |
| 动画 | react-native-reanimated + moti |
| 导航 | @react-navigation/native + native-stack + bottom-tabs |
| 构建 | Gradle（arm64-v8a / x86_64）|

## 📱 安装

### 📥 直接下载 APK

前往 [Releases 页面](https://github.com/gucheng910/koyoi/releases/latest) 下载最新版本，选择对应你设备的 APK：

| 设备类型 | 下载文件 | 大小 |
|---------|------|------|
| 主流 Android 手机（2020+） | `koyoi-v2.17.0-arm64-v8a.apk` | ~67 MB |
| Android 模拟器 | `koyoi-v2.17.0-x86_64.apk` | ~66 MB |

> 💡 **怎么判断？** 骁龙/天玑/麒麟/Exynos 处理器 → 选 arm64-v8a。电脑上跑模拟器 → 选 x86_64。

> ⚠️ 安装时如果提示「未知来源」，在设置里允许「安装未知应用」即可。

### 🛠️ 从源码构建

```bash
git clone https://github.com/gucheng910/koyoi.git
cd koyoi
npm install
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

## ⚙️ 配置

1. [获取 DeepSeek API Key](https://platform.deepseek.com/api_keys)（或其他 OpenAI 兼容 API）
2. 打开 App → 设置 → API 配置 → 填入 Key 和模型名
3. 新建世界或上传小说开始

## 🏗️ 项目结构

```
src/
├── api/              DeepSeek API 封装（流式/同步/抛光/用量追踪）
├── screens/          页面组件
├── services/         核心服务（分章/分析/知识库/角色推演/编码/存储）
├── prompts/          AI 提示词模板
├── components/       通用 UI 组件
├── store/            Zustand 状态管理
└── types/            TypeScript 类型定义
```

## 📖 工作流

```
上传小说 → 分章 → 逐块 AI 分析 → 知识库合成 → 时间线重构
                                              ↓
用户选穿越方式/时间点 → AI 构建玩家视角世界 → 生成开场场景
                                              ↓
对话交互 ← 记忆闪回 ← 角色推演 ← 背景事件 ← 世界呼吸
```

## 🙏 致谢

本项目在开发过程中深度使用了 **DeepSeek** 的 API 服务，app的开发过程几乎全量使用deepseek，准确来说，只有思路不是deepseek的,就连这篇README也基本是deepseek写的，感谢deepseek，感谢梁圣，梁圣万岁。DeepSeek V4 的高质量中文理解和生成能力，以及极具诚意的缓存定价策略（命中 ¥0.02/1M tokens），使得 Koyoi 的大量 AI 调用场景（分章分析、角色推演、记忆提取等）在经济上可行。

特别感谢 DeepSeek 团队为中文 AI 生态做出的贡献。

## 📄 免责声明

本应用 AI 生成内容仅供娱乐。同人穿越功能旨在为创作者提供灵感，请勿上传无版权作品。
