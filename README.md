# maimai-transition demo

一个基于 **React 19 + Vite 8 + TypeScript + GSAP + Motion** 的舞萌风格开场 / 页面转场 Demo。

原版是 **gfdfdxc** 的 [https://github.com/gfdfdxc/maimai-transition](https://github.com/gfdfdxc/maimai-transition)

这个项目目前包含两部分内容：

- **Demo 站**：用于展示根路由 `/` 与 `/music` 之间的页面切换转场效果。
- **通用组件**：将舞萌开场动画封装成可移植的 `MaimaiOpening` 组件，方便迁移到其他 React 项目。

## 项目介绍

这个仓库最初来自一个静态 HTML/SVG 原型，后续重构为工程化前端项目，目标是：

- 保留原始舞萌风格开场的视觉语言
- 将 SVG 素材与动画逻辑拆分为可维护的模块
- 提供可复用的开场组件，而不是只能跑在单个页面里的 demo 脚本
- 演示真实页面路由切换，而不仅仅是背景图轮播

当前项目已经实现：

- 基于 GSAP 的 SVG 开场动画时间轴
- 前后场景切换（`sceneSwapAt` 时机）
- `/` 和 `/music` 的路由切换 Demo
- 自动扫描 `public/assets/background/` 的背景图清单
- 工程化样式拆分与平滑圆角系统

## Demo 站说明

当前 Demo 站用于展示“页面切换时如何盖上一层开场动画，并在中途真正切换路由”。

### 当前演示路由

- `/`
	- 首页场景
	- 使用主背景图
- `/music`
	- 模拟另一页内容场景
	- 每次进入该路由时随机选择一张背景图

### Demo 的转场逻辑

1. 用户点击页面里的切换按钮
2. 页面不会立即跳转
3. 顶层挂载 `MaimaiOpening` 作为转场遮罩
4. 动画在安全遮挡点触发 `onSceneSwap`
5. Demo 宿主层再执行真正的路由切换
6. 动画后半段揭示新页面

### Demo 层文件

- `src/App.tsx`
	- 页面转场宿主
	- 管理路由切换时机与开场遮罩的挂载
- `src/features/demo/RouteShowcasePage.tsx`
	- Demo 页面内容
- `src/features/demo/routeScenes.ts`
	- Demo 路由与背景图映射

这些文件属于**演示层**，不是通用组件本体。

## 通用组件说明

项目中的通用组件入口位于：

- `src/features/transition/index.ts`

当前导出内容：

- `MaimaiOpening`
- `MaimaiOpeningHandle`
- `MaimaiOpeningProps`
- `MaimaiOpeningFitMode`
- `MaimaiOpeningLayoutMode`
- `TransitionStatus`

### 组件职责

`MaimaiOpening` 负责：

- 加载 `public/maimai-transition.svg`
- 创建 GSAP 时间轴
- 播放入场 / 退场动画
- 在 `sceneSwapAt` 时机触发场景切换回调
- 暴露 `replay()` 供宿主页面手动重播

### 适合移植的内容

如果你要把这套效果迁移到别的 React 项目，最核心的是：

- `src/features/transition/**`
- `public/maimai-transition.svg`
- `public/assets/svg-extracted/**`

### 常用 props

`MaimaiOpening` 支持以下关键能力：

- `fitMode`
	- `'contain' | 'cover'`
- `layoutMode`
	- `'frame' | 'fullscreen'`
- `initialStageBackgroundColor`
- `initialStageBackgroundImage`
- `stageBackgroundColor`
- `stageBackgroundImage`
- `sceneSwapAt`
- `onSceneSwap`
- `onStatusChange`
- `svgPath`

这意味着组件不仅能做“单次开场动画”，也能做：

- 前场景 → 后场景 的转场
- 页面遮罩式切换
- 自定义背景图或背景色切换

### 最小使用示例

```tsx
import { useRef } from 'react'

import {
	MaimaiOpening,
	type MaimaiOpeningHandle,
	type TransitionStatus,
} from './features/transition'

export function Example() {
	const openingRef = useRef<MaimaiOpeningHandle>(null)

	const handleStatusChange = (status: TransitionStatus) => {
		if (status === 'finished') {
			console.log('开场动画播放完成')
		}
	}

	return (
		<MaimaiOpening
			ref={openingRef}
			layoutMode="fullscreen"
			fitMode="cover"
			initialStageBackgroundColor="#ffffff"
			stageBackgroundImage="/assets/background/maimai-2025-bg.png"
			stageBackgroundPosition="center center"
			stageBackgroundSize="cover"
			onStatusChange={handleStatusChange}
		/>
	)
}
```

## 背景图与素材说明

### 背景图目录

Demo 使用的背景图统一放在：

- `public/assets/background/`

项目会在开发和构建前自动扫描该目录，并生成：

- `src/generated/backgroundManifest.ts`

对应脚本为：

- `scripts/generate-background-manifest.mjs`

支持的图片格式包括：

- `.png`
- `.jpg`
- `.jpeg`
- `.webp`
- `.avif`
- `.gif`

### SVG 素材

开场动画 SVG 位于：

- `public/maimai-transition.svg`

其依赖的外链图片资源位于：

- `public/assets/svg-extracted/`

迁移时这两部分需要一起带走。

## 运行方式

### 安装依赖

```bash
pnpm install
```

### 启动开发环境

```bash
pnpm dev
```

### 生产构建

```bash
pnpm build
```

### 代码检查

```bash
pnpm lint
```

## 项目结构

```text
maimai-transition/
├─ public/
│  ├─ assets/
│  │  ├─ background/
│  │  └─ svg-extracted/
│  └─ maimai-transition.svg
├─ scripts/
│  └─ generate-background-manifest.mjs
├─ src/
│  ├─ features/
│  │  ├─ demo/
│  │  └─ transition/
│  ├─ generated/
│  ├─ hooks/
│  ├─ styles/
│  ├─ App.tsx
│  └─ main.tsx
├─ package.json
└─ README.md
```

## 技术栈

- React 19
- Vite 8
- TypeScript 6
- GSAP 3
- Motion 12
- React Router 7

其中：

- **GSAP** 负责 SVG 主动画时间轴
- **Motion** 主要用于 Demo 层轻量交互动画
- **React Router** 用于展示真实页面切换场景

## 当前状态

目前这套项目更适合作为：

- 舞萌开场组件的展示站
- 页面转场方案的验证 Demo
- 后续迁移到 VuePress / 其他 SPA 项目时的参考实现

如果后续继续演进，推荐方向是：

- 把 Demo 路由切换封装成更通用的页面转场 provider
- 继续收敛 Demo 层与通用组件层的边界
- 补充更完整的组件 API 文档与迁移说明
