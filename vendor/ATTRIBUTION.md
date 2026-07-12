# Runtime dependency attribution

All files below are pinned local copies. They are loaded at runtime from `vendor/`; the application does not fetch JavaScript from a CDN.

## Three.js

- Version: `0.180.0` (`REVISION = '180'`)
- Package: `three@0.180.0`
- Source root: `https://cdn.jsdelivr.net/npm/three@0.180.0/`
- Upstream: `https://github.com/mrdoob/three.js`
- License: MIT, copyright Three.js Authors

| Local file | Original URL | SHA-256 |
| --- | --- | --- |
| `three/three.core.js` | `https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.core.js` | `eb077d2417f61d3e6d9264c317cabc4ea35769ed6b0ab533067292a550784c20` |
| `three/three.module.js` | `https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js` | `c8211c69345d2e9949dc7a8ac969380497aa0600a5a8ac6a459c8cd02dd9cb8a` |
| `three/addons/controls/OrbitControls.js` | `https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js` | `b97879c748170baadeb3fb84cea1ffdf4674e283dc06042f34e2acb95a76042c` |
| `three/addons/postprocessing/BokehPass.js` | `https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/BokehPass.js` | `5b9b0bc5cee6e24b2417da95f40eb2d178943c2ffbacbc4c2993a89d0597bfb3` |
| `three/addons/postprocessing/EffectComposer.js` | `https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/EffectComposer.js` | `4b8c855f28eed2570bed898adc0ab89c585a8a281ecb6d905c09d00697f9f50a` |
| `three/addons/postprocessing/MaskPass.js` | `https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/MaskPass.js` | `7cd08eee9d5d6f5578beaddbdcbe9c384f6873810af27f22ab7db3ceeb127aa3` |
| `three/addons/postprocessing/OutputPass.js` | `https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/OutputPass.js` | `f5b81c96e76b6b28b4b3ba8c41c4aeb982b1e03f3d82883242d951b2ab082fa2` |
| `three/addons/postprocessing/Pass.js` | `https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/Pass.js` | `444b409c235ead986893c472e720da1b779a56985c7d10b279c7944b52bd61c5` |
| `three/addons/postprocessing/RenderPass.js` | `https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/RenderPass.js` | `fd91229aacc5830e3984b0f2bdefcf566163ea028f4c1f1ab233fa6665a133ac` |
| `three/addons/postprocessing/ShaderPass.js` | `https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/ShaderPass.js` | `e2500a5913b26bbf5148ceaae644c6edcff06a18b01494ee37bf856353d2ab9d` |
| `three/addons/postprocessing/UnrealBloomPass.js` | `https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/UnrealBloomPass.js` | `d92742959879b461f25348b2abddc7ca0d48527e7718340bcfa29fa771e2799a` |
| `three/addons/shaders/BokehShader.js` | `https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/shaders/BokehShader.js` | `c47a17eae9f70405025a5149a68f1265de5d5dba5d61282927fb94b0bb3d0619` |
| `three/addons/shaders/CopyShader.js` | `https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/shaders/CopyShader.js` | `a33057d5ac91c43304c186ac0e8816e62bb2ed471d3a00ff3018dfd5c0389718` |
| `three/addons/shaders/LuminosityHighPassShader.js` | `https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/shaders/LuminosityHighPassShader.js` | `5044f780b6e6cf863947f64c36fe1587132f7fbe395ada863cd1e5f0388dcf1e` |
| `three/addons/shaders/OutputShader.js` | `https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/shaders/OutputShader.js` | `353479f77a8d7e2629d49ccac9fc2f5dbfdda5442e0adf867b00377a2fcb0cb2` |

`FullScreenQuad` is provided by the pinned `postprocessing/Pass.js`; it is not a separate upstream file in Three.js 0.180.0.

## GSAP

- Version: `3.13.0`
- Package: `gsap@3.13.0`
- Source: `https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js`
- Upstream: `https://gsap.com`
- License: GreenSock Standard License (`https://gsap.com/standard-license`), as embedded in the distributed file
- SHA-256: `96c01b81f44a3290e2b4532f55e2c9534b2adc43273a19f3756b2cb41f0fd0b6`
