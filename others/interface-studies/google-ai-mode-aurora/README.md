# Google AI 模式按钮局部发光分析

> 这是一个独立的界面实现研究，与 Google 没有隶属或授权关系。仓库仅保留原创复刻与分析，不包含 Google 原始页面快照或运行时 bundle。

## 使用

直接打开 `index.html` 即可体验无外部依赖的复刻。将鼠标移入按钮并沿按钮边缘移动，可以观察局部 Aurora 光斑的弹性跟随和颜色拖尾。

## 结论

这个效果不是单个 `box-shadow`，也不是只有按钮背景上的 `blur(2px)`。

Google 把它拆成两个独立效果：

1. `.bvUkz` 是普通胶囊背景；hover 时整体 `blur(2px)`。
2. `.CcxW7b` 是独立 Aurora 特效层；它用两层彩色 `conic-gradient`、两组旋转遮罩、不同模糊半径和 JavaScript 鼠标跟踪，生成局部边缘亮斑。

本报告基于 2026-07-12 无界面 HTTP 下载的 `https://www.google.com/?hl=zh-CN`。原始 HTML 命中了用户片段中的完整类名、DOM 和控制器：

- `plR5qb`
- `CcxW7b`
- `fZhNMe`
- `eruMcc`
- `tgPjse`
- `jNZDL`

## 分层结构

```text
button.plR5qb
├─ div.CcxW7b.BznTFe                 Aurora 宿主，整体 opacity 0.6
│  └─ div.fZhNMe                     可见性与两个角度变量
│     └─ div.WkMYIb
│        ├─ div.eruMcc               4px 柔光层
│        │  └─ div.Tdahud            较宽的局部锥形遮罩
│        │     └─ div.tgPjse         彩色锥形渐变圆盘
│        └─ div.eruMcc.eOuHwe        1px 清晰核心层
│           └─ div.Tdahud            较窄的局部锥形遮罩
│              └─ div.tgPjse         同一套彩色锥形渐变
├─ div.bvUkz                         普通胶囊背景
└─ div.u4Uk3c                        图标和文字，z-index: 1
```

内容层盖在背景和 Aurora 之上。Aurora 层设置了 `pointer-events: none`，不会影响按钮交互。

## CSS 如何生成局部光斑

### 1. 彩色光源

`.tgPjse` 是一个圆形的 `conic-gradient`。颜色沿圆周依次经过蓝、紫、粉、红、橙、黄、绿、青，再回到蓝色。

它本身不是局部光斑，而是一整张可旋转的彩色圆盘：

```css
.aurora-gradient {
  background: conic-gradient(/* 蓝 → 紫 → 红 → 黄 → 绿 → 青 → 蓝 */);
  rotate: var(--aurora-gradient-angle);
}
```

### 2. 双重锥形遮罩

`.Tdahud` 给彩色圆盘叠加两张同角度的 `conic-gradient` 遮罩，并用 `mask-composite: intersect` 取交集。结果只显示圆周上的一小段弧形窗口。

普通柔光层的主窗口大致经过：

```text
transparent 50% → black 68% → black 75% → transparent 89%
```

清晰核心层使用更窄的窗口：

```text
transparent 62% → black 82% → transparent 89%
```

因此两个视觉层不是重复元素：

- 宽窗口加 `blur(4px)`，负责外部柔光。
- 窄窗口加 `blur(1px)`，负责明亮、锐利的边缘核心。

### 3. 把圆形模型拉伸成胶囊模型

遮罩层使用：

```css
scale: 4 1.5;
```

这会把围绕圆心旋转的锥形窗口横向拉长，使其更贴近胶囊按钮。JavaScript 计算鼠标方向时使用相同的 `scaleX = 4`、`scaleY = 1.5`，所以视觉位置和鼠标方位能够对应。

### 4. 两个角度分别控制遮罩和颜色

下载代码中的语义名与页面混淆变量对应如下：

| 语义                    | 页面变量   | 作用                              |
| ----------------------- | ---------- | --------------------------------- |
| `aurora-border-radius`  | `--BgHDjb` | Aurora 圆角，按钮设置为 `100px`   |
| `aurora-blur`           | `--bFlrOb` | 柔光层模糊，按钮设置为 `4px`      |
| `aurora-inset`          | `--HM63Tc` | 特效层边缘偏移，按钮设置为 `-1px` |
| `aurora-scale-x`        | `--sjdAce` | 横向遮罩缩放，按钮设置为 `4`      |
| `aurora-scale-y`        | `--mWus4b` | 纵向遮罩缩放，按钮设置为 `1.5`    |
| `aurora-mask-angle`     | `--q9niGe` | 局部可见窗口的方向                |
| `aurora-gradient-angle` | `--cqcjz`  | 彩色圆盘自身的方向                |

遮罩角和渐变角不能合并。遮罩决定“哪一段可见”，渐变角决定“这一段里显示什么颜色”。两者采用不同的跟随曲线，才会出现颜色拖尾和弹性。

## JavaScript 如何跟随鼠标

### 事件生命周期

页面声明的事件入口是：

```text
mouseenter:vG60uf
mouseleave:NS5Xl
```

`jsaction` 中没有静态 `mousemove`，但 `mouseenter` 处理器会动态执行以下工作：

1. 缓存按钮的 `getBoundingClientRect()`。
2. 让 `.fZhNMe` 在 `350ms` 内淡入。
3. 给按钮绑定 `mousemove`。
4. 启动 `requestAnimationFrame` 循环。

`mouseleave` 会执行相反操作：

1. 让 Aurora 在 `350ms` 内淡出。
2. 移除 `mousemove`。
3. 清除缓存矩形。
4. 取消 `requestAnimationFrame`，避免后台空转。

所以这是鼠标方位跟随效果，不是固定沿边缘自动循环。

### 鼠标到目标角度

鼠标坐标先转换到以按钮中心为原点的椭圆坐标系：

```js
targetAngle =
  (Math.atan2((pointerY - centerY) / 1.5, (pointerX - centerX) / 4) * 180) /
  Math.PI;
```

方向约定：

- 右侧约为 `0deg`
- 下方约为 `90deg`
- 左侧约为 `180deg`
- 上方约为 `-90deg`

按钮矩形只在 `mouseenter` 时缓存一次。hover 期间如果按钮发生位移或尺寸变化，会暂时继续使用旧矩形，直到下一次重新进入。

### 遮罩角的弹簧跟随

每帧先计算跨越 `0deg / 360deg` 时的最短角差，然后更新角速度：

```js
velocity += shortestAngleDelta(maskAngle, targetAngle) * 0.05;
velocity *= 0.75;
maskAngle += velocity;
```

- `0.05` 是向目标方向的拉力。
- `0.75` 是速度保留率，即每帧耗散 25%。
- 最短角差避免从 `179deg` 移动到 `-179deg` 时绕完整一圈。

这段运算没有乘以帧间时间 `dt`，因此实际动力学会受到刷新率影响。

### 渐变角的非线性拖尾

彩色渐变不会立即锁定遮罩角，而是按角差使用三次方曲线追赶：

```js
followAmount = Math.min(Math.abs(angleError) / 90, 1) ** 3;
gradientAngle = lerpShortest(gradientAngle, maskAngle, followAmount);
```

角差小时跟随很慢，角差接近 `90deg` 时迅速追上：

|    角差 | 单帧插值比例 |
| ------: | -----------: |
| `10deg` | 约 `0.00137` |
| `45deg` |      `0.125` |
| `90deg` |          `1` |

最终写入 CSS 时还有固定相位校准：

```js
maskCssAngle = maskAngle - 167;
gradientCssAngle = gradientAngle - 142;
```

用户截图中的角度为：

```text
--q9niGe: -9864.0131deg
--cqcjz:  -9808.5702deg
```

数值达到数千度并非异常。控制器让累计角度持续增长，只在计算角差时使用 `% 360`，因此无需每圈把输出硬跳回零。

两者在截图时相差约 `55.44deg`。扣除固定的 `25deg` 相位差后，说明彩色渐变相对遮罩存在约 `30.44deg` 的动态滞后。

## 首次出现时的 1 秒扫光

初始化时，控制器还会播放一次与 hover 独立的 `1000ms` Web Animations 动画：

- Aurora opacity：`0 → 1 → 保持 → 0`
- 柔光层 blur：`1px → 5px → 3px → 5px → 1px`
- 渐变角：`170deg → 225deg`
- 遮罩角：`-90deg → 200deg`

这是一段首次展示扫光。首次真实 hover 会取消并清理这组动画，然后切换到鼠标跟踪模式。

代码会在支持时用 `CSS.registerProperty()` 把两个自定义属性注册为可插值的 `<angle>`。`prefers-reduced-motion: reduce` 会阻止这段首次扫光；下载到的 hover 跟踪辅助函数本身没有直接的 reduced-motion 判断。

## 与 `.bvUkz` 背景 blur 的区别

这条规则确实参与 hover：

```css
.plR5qb:not(.PHjFye):hover .bvUkz {
  filter: blur(2px);
}
```

但它只让整颗按钮底色变软。`.bvUkz::after` 继承背景并向四周扩展，为模糊边缘提供额外色面。

局部彩色亮斑来自另一棵 DOM：`.CcxW7b > .fZhNMe > .WkMYIb > .eruMcc ...`。分析时必须把这两种效果分别开关，不能把它们都归因于 `blur(2px)`。

## 在 DevTools 中验证

1. 给 `.CcxW7b` 临时设置 `display: none`：局部彩色亮斑应消失，普通背景仍存在。
2. 给 `.bvUkz` 临时设置 `display: none`：普通胶囊底色消失，可单独观察 Aurora。
3. 分别禁用两个 `.eruMcc`：确认 `4px` 柔光层和 `1px` 锐利核心层的贡献。
4. 选中 `.fZhNMe`，观察 `--q9niGe` 与 `--cqcjz`：移动鼠标时二者应持续更新。
5. 在 `.fZhNMe` 上选择 `Break on → Attribute modifications`：调试器会停在每帧写入 CSS 变量的位置。
6. 执行 `$0.getAnimations({ subtree: true })`：可查看进入、离开和首次扫光使用的 Web Animations。

## 实现与兼容性注意

- 核心依赖 `conic-gradient`、多重 `mask-image`、`mask-composite`、Web Animations API 和 `requestAnimationFrame`。
- 页面同时提供 `-webkit-mask-*` 与标准 `mask-*` 写法，目标明显以现代 Chromium 为主。
- 独立的 `scale`、`rotate`、`translate` 属性属于现代 CSS Transform 写法。
- `will-change` 只放在持续变动的 opacity 和角度层上；离开按钮时必须取消 rAF。
- 如果自行复刻，CSS 的 `scaleX / scaleY` 必须与 JavaScript 坐标归一化参数保持一致，否则亮斑会偏离鼠标方位。
