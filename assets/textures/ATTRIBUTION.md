# 纹理来源、许可与派生说明

## Solar System Scope 行星纹理

- 作者/署名：Solar System Scope / INOVE
- 官方页面：https://www.solarsystemscope.com/textures/
- 下载根地址：https://www.solarsystemscope.com/textures/download/
- 许可：Creative Commons Attribution 4.0 International（CC BY 4.0）
- 许可文本：https://creativecommons.org/licenses/by/4.0/
- 获取日期：2026-07-11

Solar System Scope 说明这些等距柱状纹理基于 NASA 影像与高程资料制作，但未被完整测绘的区域可能包含风格匹配的人工补绘。因此，本项目把它们用于沉浸式可视化，不把纹理或本项目派生图当作科研分析产品。

### 本次获取的源文件

| 天体/通道 | 官方文件 | 实际像素 | 本地运行时用途 |
|---|---|---:|---|
| 水星 albedo | `8k_mercury.jpg` | 8192×4096 | albedo、派生 roughness/bump |
| 金星表面 albedo | `8k_venus_surface.jpg` | 8192×4096 | albedo、派生 roughness/bump |
| 地球昼面 | `8k_earth_daymap.jpg` | 8192×4096 | albedo、派生 bump |
| 地球夜面 | `8k_earth_nightmap.jpg` | 8192×4096 | night emission control |
| 地球云层 | `8k_earth_clouds.jpg` | 8192×4096 | cloud alpha/control |
| 地球法线 | `8k_earth_normal_map.tif` | 8192×4096 | terrain normal control |
| 地球高光 | `8k_earth_specular_map.tif` | 8192×4096 | ocean specular、派生 roughness |
| 火星 albedo | `8k_mars.jpg` | 8192×4096 | albedo、派生 roughness/bump |
| 木星 albedo | `8k_jupiter.jpg` | 4096×2048 | albedo；文件名虽为 8k，实际像素按 4k 记录 |
| 土星 albedo | `8k_saturn.jpg` | 4096×2048 | albedo；文件名虽为 8k，实际像素按 4k 记录 |
| 天王星 albedo | `2k_uranus.jpg` | 2048×1024 | albedo，2k 为最高档，不插值放大 |
| 海王星 albedo | `2k_neptune.jpg` | 2048×1024 | albedo，2k 为最高档，不插值放大 |

## 运行时分级文件

每颗行星都在 `low/medium/high` 中拥有独立的本地 albedo 路径：

- 标准档：low 512×256、medium 2048×1024、high 4096×2048。
- 天王星/海王星：low 512×256、medium 1024×512、high 2048×1024；最高档保持可信源图的 2k 上限。
- low/medium/high 均从对应最高可信源直接使用 Lanczos 重采样并导出，不逐级反复缩放。

颜色纹理（albedo、地球 night）在 Three.js 中使用 `SRGBColorSpace`；roughness、bump、normal、specular 与 cloud alpha 数据纹理使用 `NoColorSpace`。

## 派生 roughness / bump / 控制图方法

以下文件是为实时 PBR 展示而制作的派生控制图，不是原始科学数据，也不代表实测材料参数：

- 水星、金星、火星 bump：从对应 albedo 转灰度，执行 1% 自动对比度与 0.55px 轻微模糊，再按目标档位导出；仅作为视觉起伏代理。
- 水星、金星、火星 roughness：从对应 albedo 的反相亮度与中性粗糙度值 220 以 18% 权重混合；仅作为艺术化 PBR 代理。
- 地球 bump：从 `8k_earth_daymap.jpg` 以相同灰度/自动对比度/轻微模糊方法派生；仅作视觉起伏代理。
- 地球 roughness：从 `8k_earth_specular_map.tif` 转灰度并反相派生；用于让海洋区域更光滑，不是实测 roughness 产品。
- 地球 normal：从 `8k_earth_normal_map.tif` 直接缩放并以高质量 JPEG 导出。
- 地球 specular：从 `8k_earth_specular_map.tif` 转灰度、缩放后导出。
- 地球 clouds：从 `8k_earth_clouds.jpg` 转灰度、缩放后用作云层颜色/透明度控制。

逐文件的 `sourceUrl/sourceResolution/runtimeResolution/license/credit/derivedFrom` 元数据记录在 `src/data/textureManifest.js`。

## 原有兼容纹理

根目录中原有的 2K 太阳、月球、金星大气、土星环及旧版行星文件仍保留，用于太阳、月球、云壳/环或兼容回退。其来源同为上述 Solar System Scope CC BY 4.0 系列。行星主体现在优先使用分级清单；加载升级失败时保留上一档，不用随机图片冒充缺失资源。

## NASA / JPL 参考

- NASA Solar System Exploration：https://science.nasa.gov/solar-system/
- NASA/JPL Solar System Simulator Texture Maps：https://space.jpl.nasa.gov/tmaps/
- NASA Scientific Visualization Studio：https://svs.gsfc.nasa.gov/
- NASA Visible Earth Blue Marble：https://visibleearth.nasa.gov/images/73776/

