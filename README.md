# 沉浸式太阳系互动探索

这是一个可直接静态托管的 Three.js 太阳系网页。它使用本地行星纹理、程序化太阳和大气着色器、分层星场、实例化小行星及 GSAP 镜头动画，重点呈现尺度、光照与空间纵深。

## 技术方案

- Three.js 0.180.0：场景、材质、OrbitControls、EffectComposer 和 UnrealBloomPass。
- GSAP 3.13.0：开场、镜头飞行、比例过渡与界面动效。
- 原生 ES Modules：无框架，Three.js 与 GSAP 固定版本并保存在 `vendor/`，运行时不访问 CDN。
- 无第三方构建依赖：`npm run build` 只使用 Node.js 内置模块生成确定性的 `dist/`。
- CC BY 4.0 的低、中、高三档行星纹理：本地加载，失败时自动保留程序化兼容材质。
- Node.js 内置测试：检查天体数据、页面节点、模块边界与资源文档。

## 目录结构

```text
.
├── index.html
├── style.css
├── main.js
├── src/
│   ├── data/celestialBodies.js
│   ├── core/
│   │   ├── scene.js
│   │   └── postprocessing.js
│   ├── systems/
│   │   ├── solarSystem.js
│   │   ├── starfield.js
│   │   ├── asteroidBelt.js
│   │   ├── timeSystem.js
│   │   ├── cameraDirector.js
│   │   ├── interaction.js
│   │   ├── presentationState.js
│   │   └── performance.js
│   └── ui/interface.js
├── assets/
│   ├── textures/
│   ├── audio/
│   └── icons/
├── tests/
└── docs/superpowers/
```

## 本地启动

ES Modules 与本地纹理需要通过静态服务器访问，不能直接双击 `index.html`。

### 最简单方式：电脑与手机同时打开

在 Finder 中双击项目根目录的 `start-web.command`。终端会显示两个地址：

- 电脑打开 `http://127.0.0.1:8080/`
- 手机打开终端显示的局域网地址，例如 `http://192.168.1.195:8080/`

手机与电脑必须连接同一 Wi-Fi，并保持启动网页的终端窗口开启。如果 macOS 防火墙询问是否允许 Python 接受传入连接，请选择允许。

停止网页时，在该终端窗口按 `Control + C`。

### 命令行方式

在项目目录运行：

```bash
python3 -m http.server 8080 --bind 0.0.0.0
```

然后打开：

```text
http://127.0.0.1:8080/
```

也可以使用：

```bash
npx serve .
```

Three.js、GSAP 与所有行星图片均从本地目录读取；首次运行不依赖 CDN。

## 构建与发布

建议使用 Node.js 20 或更新版本。在项目根目录运行：

```bash
npm run build
```

构建会先完整清理再重建 `dist/`，只复制发布白名单，并验证纹理清单、模块导入、Manifest 图标、Service Worker 资源、禁止的远程运行时 URL 与性能预算。结果记录在 `dist/build-report.json`；不要手工把 `tests/`、`docs/`、`.superpowers/` 或旧 ZIP 放进发布目录。

本项目的 GitHub 仓库是 <https://github.com/motalleo/solar-system>，Pages 目标地址是 <https://motalleo.github.io/solar-system/>。请按以下方式发布：

1. 打开仓库 `main` 分支的根目录，删除或覆盖旧的站点文件。
2. 解压项目根目录下的 `太阳系互动探索-GitHub-Pages最终版-20260712.zip`。
3. 把 ZIP **解压后的全部内容**上传到 `main` 分支根目录；上传后应直接看到 `index.html`、`manifest.webmanifest`、`sw.js`、`.nojekyll`、`assets/`、`src/` 和 `vendor/`。**不要只上传 ZIP，不要上传 `dist` 文件夹本身，也不要让路径变成 `dist/index.html`。**
4. 等待 `main` 分支上传完成后，进入 **Settings → Pages → Deploy from a branch**，Branch 选 **`main`**，Folder 选 **`/(root)`**，然后保存。
5. 等待 GitHub Pages 部署完成，再打开 HTTPS 地址 <https://motalleo.github.io/solar-system/>，并确认页面、Manifest 和 Service Worker 均能访问。

截至 2026-07-12 的阶段 0 HTTPS 探针：GitHub Pages 首页、`manifest.webmanifest` 和 `sw.js` 均返回 HTTP 200，说明当前 PWA 文件已部署到公开站点。真实浏览器中的安装提示、首次缓存、断网刷新及手机端体验仍待最终验收；在这些路径实测通过前，不应声称公网 PWA 离线体验已完成。

本地检查发布产物：

```bash
python3 -m http.server 8080 --directory dist
```

## PWA、更新与离线

- 首次在线打开后，Service Worker 会缓存应用核心、基础纹理和低档纹理；完成后页面会提示离线资源已就绪。
- 新版本安装完成后不会擅自刷新。页面显示“立即更新”后，由用户确认，再切换 Service Worker 并只重载一次。
- 手机低档首屏预缓存硬预算为 25 MB；中档完整核心硬预算为 65 MB。
- 高档纹理会复制到 `dist/assets/textures/high/`，但绝不预缓存；桌面高画质初始仍使用中档纹理，只有明确聚焦某颗行星后才按需请求该行星的高档纹理。
- 离线首次访问前必须至少成功在线打开一次。若部署后仍看到旧版，可点击页面更新提示，或在浏览器站点设置中清除该站点的缓存与 Service Worker 后重新打开。

## 操作

- 鼠标左键拖动：旋转视角。
- 滚轮：缩放。
- 鼠标右键拖动：平移。
- 触屏单指：旋转；双指：缩放和平移。
- 点击行星或左侧导航：平滑聚焦。
- 全景：返回太阳系总览。
- 时间控制：暂停、0.5×、1×、5×、20×、100×、1000×、10000× 与重置。
- 设置：轨道、小行星、标签、展示比例、真实比例近似视图及三档画质。
- 自动巡航：依次访问太阳和八大行星。任何手动镜头操作都会结束巡航。

## 展示比例与真实比例

默认的展示比例压缩行星距离，并放大岩石行星，适合总览和交互。真实比例模式加强真实体积与距离差异，并用克制的发光定位标记保证小行星仍可点击，因此它是浏览友好的近似视图，不是科研级星历模拟。

## 替换高清纹理

纹理应使用 2:1 等距柱状投影。运行时清单位于 `src/data/textureManifest.js`，每颗行星都必须提供 `low/medium/high` 独立资源；构建会拒绝任何缺失项，包括八大行星的高档 albedo。移动端优先低档或中档，高档纹理只按需加载。

| 文件名 | 用途 |
|---|---|
| `sun.jpg` | 太阳表面基础层 |
| `mercury.jpg` | 水星 |
| `venus.jpg` | 金星表面 |
| `venus_atmosphere.jpg` | 金星云层 |
| `earth_day.jpg` | 地球昼面 |
| `earth_night.jpg` | 地球城市灯光 |
| `earth_clouds.jpg` | 地球云层遮罩 |
| `moon.jpg` | 月球 |
| `mars.jpg` | 火星 |
| `jupiter.jpg` | 木星 |
| `saturn.jpg` | 土星 |
| `saturn_ring.png` | 土星环透明纹理 |
| `uranus.jpg` | 天王星 |
| `neptune.jpg` | 海王星 |
| `stars.jpg` | 可选背景贴图，当前默认使用三层程序化星场 |

替换步骤：

1. 保持文件名不变并覆盖 `assets/textures/` 中的对应文件。
2. 普通颜色纹理使用 sRGB；云层遮罩和土星环应保留透明度或灰度信息。
3. 新增此前未打包的文件时，在 `src/systems/solarSystem.js` 的 `PACKAGED_TEXTURES` 中加入文件名。
4. 刷新浏览器。若浏览器缓存旧纹理，可执行硬刷新。

星空由体积粒子系统生成，不依赖背景图片。纹理的来源、派生方式、分辨率与许可信息必须同步维护在清单和署名文件中。

## 空间音频

当前背景音乐使用本地的用户提供原创文件 `assets/audio/deep-space-original.mp3`；低频合成环境层与选择/飞行提示则由 Web Audio 实时生成。默认保持静音，只有用户主动点击“声音”后才会创建 AudioContext 并开始播放。音乐经过空间化、低通与动态限幅链路，默认响度更有包围感但会控制峰值；行星选择和镜头飞行提示使用 PannerNode 跟随当前聚焦位置。页面隐藏时会暂停已授权的 context，恢复时不会自动创建新 context。PWA 首次安装不预下载音乐以控制移动端流量；第一次开启声音后会缓存该文件，之后可离线重播。

音频权利信息见 [docs/AUDIO_LICENSES.md](docs/AUDIO_LICENSES.md)。替换音乐时必须使用原创或拥有公开发布授权的文件。

## 性能策略

- 小行星使用 `InstancedMesh`，低、中、高画质分别使用 650、1400、2600 个实例。
- 移动端像素比上限 1.25，桌面端按画质限制为 1、1.5、2。
- 星点数量、球体细分、Bloom 分辨率和小行星数量会随画质变化。
- 页面隐藏时停止渲染，恢复时重新启动时钟，避免异常时间步长。
- 自动模式会在持续低帧率时降低画质。
- Raycaster 只检测主要天体及真实比例定位标记，并对鼠标移动进行逐帧合并。

## 测试

```bash
node --test tests/*.test.mjs
```

## 已完成功能

- 太阳、八大行星、月球、椭圆倾斜轨道与公转/自转。
- 动态太阳表面、日冕、中心点光源与克制 Bloom。
- 地球昼夜混合、城市灯光、云层、海洋高光、大气层与月球。
- 土星透明径向星环，木星真实条带纹理，冰巨星大气边缘。
- 三层体积星空、程序化银河尘埃和镜头视差。
- 非均匀实例化小行星带。
- 行星悬停、点击聚焦、目标跟随、返回全景与自动巡航。
- 时间倍率、轨道/标签/小行星开关、比例模式、画质、全屏与音频接口。
- 5 秒以上开场镜头、加载进度、错误界面、移动端布局与 reduced-motion 支持。

## 可继续升级

- 接入 JPL Horizons 或 VSOP87，按真实日期计算行星位置。
- 使用 GPU 体积噪声提升日冕、太阳耀斑和星云。
- 增加伽利略卫星、土卫六、海卫一等主要卫星。
- 增加选择性景深、镜头污渍与更精细的曝光适配。
- 增加中文语音导览、WebXR 和更精细的 PWA 离线包管理。

## 资源许可

纹理署名、派生说明和 CC BY 4.0 许可见 [`assets/textures/ATTRIBUTION.md`](assets/textures/ATTRIBUTION.md)；本地 Three.js/GSAP 的版本、MIT/Standard License 说明与来源校验见 [`vendor/ATTRIBUTION.md`](vendor/ATTRIBUTION.md)。发布 `dist/` 时必须保留这两份署名文件及对应许可信息。天体事实说明参考 NASA Science 与 JPL 公开页面；行星轨道是视觉近似，不用于科研分析。
