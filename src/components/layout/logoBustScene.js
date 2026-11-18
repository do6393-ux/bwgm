// 머리글 조각의 3D 장면 (three). LogoBust.jsx 가 늦게 불러오므로 이 파일과 three 는 넓은 PC 화면에서
// 로그인한 선생님에게만 내려받아진다.
//
// 모델(public/models/bust.glb)은 하나이고, 모양 9가지는 재질만 바꾼다.
// .glb 에 UV 가 없어서 대리석 결·얼룩은 그림 파일 대신 모델 좌표 3D 노이즈로 셰이더에서 그린다.
// 그리기는 움직일 때만 한다(마우스·모양 바꾸기). 멈추면 다음 움직임까지 쉰다.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { headAim } from "@/lib/logoBust";

const NOISE = /* glsl */ `
varying vec3 vModelPos;
float bHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float bNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bHash(i), bHash(i + vec3(1,0,0)), f.x), mix(bHash(i + vec3(0,1,0)), bHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(bHash(i + vec3(0,0,1)), bHash(i + vec3(1,0,1)), f.x), mix(bHash(i + vec3(0,1,1)), bHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float bFbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * bNoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
// 길게 흐르는 결: 한 방향의 띠를 노이즈로 휘게 한다 (노이즈 등고선으로 하면 얼굴에 동그라미가 생겼다)
float bVeins(vec3 p, vec3 dir, float turb, float width) {
  float t = dot(p, dir) + bFbm(p * 0.9) * turb;
  float d = abs(fract(t) - 0.5);
  float w = width * (0.35 + 1.3 * bNoise(p * 1.7 + 4.0));
  float aa = fwidth(t) * 1.2;
  return 1.0 - smoothstep(w, w + aa, d);
}
`;

// kind: "marble"(바탕 + 구름 + 결) | "mottle"(두 색 얼룩 + 거칠기 흔들기)
function patterned(params, pattern) {
  const mat = new THREE.MeshPhysicalMaterial(params);
  const uniforms = {
    uA: { value: new THREE.Color(pattern.a) },
    uB: { value: new THREE.Color(pattern.b) },
    uV: { value: new THREE.Color(pattern.v || pattern.a) },
    uScale: { value: pattern.scale || 2.2 },
    uVein: { value: pattern.vein ?? 0.85 },
    uRough: { value: pattern.rough ?? 0 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = "varying vec3 vModelPos;\n" + shader.vertexShader.replace(
      "#include <begin_vertex>", "#include <begin_vertex>\n vModelPos = position;");
    const head = NOISE + "uniform vec3 uA; uniform vec3 uB; uniform vec3 uV; uniform float uScale; uniform float uVein; uniform float uRough;\n";
    const body = pattern.kind === "marble"
      ? `{
          vec3 q = vModelPos * uScale;
          float cloud = bFbm(q * 0.7 + 11.0);
          vec3 col = mix(uA, uB, smoothstep(0.3, 0.75, cloud));
          float v1 = bVeins(q, vec3(0.42, 0.62, 0.2), 1.8, 0.011);
          float v2 = bVeins(q * 1.6 + 7.0, vec3(-0.5, 0.35, 0.3), 1.5, 0.006) * 0.35;
          col = mix(col, uV, clamp((v1 + v2) * uVein, 0.0, 1.0));
          diffuseColor.rgb = col;
        }`
      : `{
          vec3 q = vModelPos * uScale;
          diffuseColor.rgb = mix(uA, uB, smoothstep(0.35, 0.7, bFbm(q)));
        }`;
    shader.fragmentShader = head + shader.fragmentShader
      .replace("#include <color_fragment>", "#include <color_fragment>\n" + body)
      .replace("#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\n roughnessFactor = clamp(roughnessFactor + (bFbm(vModelPos * uScale * 3.0) - 0.5) * uRough, 0.02, 1.0);");
  };
  mat.customProgramCacheKey = () => "logo-bust-" + pattern.kind;
  return mat;
}

// 순서와 이름은 src/lib/logoBust.js 의 LOOKS. 여기는 재질만
const MAKE = {
  white: () => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.9, 0.9, 0.88), roughness: 0.18, clearcoat: 0.5, clearcoatRoughness: 0.2 }),
  marble: () => patterned({ roughness: 0.24, clearcoat: 0.6, clearcoatRoughness: 0.18 },
    { kind: "marble", a: "#f2f0ea", b: "#dedad2", v: "#7d7a76", scale: 2.4, vein: 0.85 }),
  black: () => patterned({ roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.08 },
    { kind: "marble", a: "#0f0f11", b: "#232327", v: "#cfcac0", scale: 2.4, vein: 0.85 }),
  bronze: () => patterned({ metalness: 1, roughness: 0.38 },
    { kind: "mottle", a: "#6e4526", b: "#a8774a", scale: 2.2, rough: 0.35 }),
  gold: () => new THREE.MeshPhysicalMaterial({ color: "#f0c25a", metalness: 1, roughness: 0.16 }),
  chrome: () => new THREE.MeshPhysicalMaterial({ color: "#e8e9ee", metalness: 1, roughness: 0.05 }),
  clay: () => patterned({ roughness: 0.9 }, { kind: "mottle", a: "#8f3f24", b: "#b0603c", scale: 6.0, rough: 0.1 }),
  orange: () => new THREE.MeshPhysicalMaterial({ color: "#ff5000", roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1 }),
  pink: () => new THREE.MeshPhysicalMaterial({ color: "#f6d4da", roughness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.15, sheen: 0.3, sheenColor: "#ffe9ee" }),
};

/**
 * canvas 에 조각을 그린다. box 는 크기를 재고 마우스 방향을 계산할 상자(조각 단추).
 * 반환: { load(url): Promise, setLook(id, { hop }), dispose() }
 * WebGL 을 못 쓰면 throw 한다 → 부르는 쪽은 글자 로고를 그대로 둔다.
 */
export function createBustView(canvas, box) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.7;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b3ab, 0.35));
  const key = new THREE.DirectionalLight(0xfff4ea, 2.4);
  key.position.set(2.5, 4, 5);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 1.3);
  rim.position.set(-3.5, 2.5, -3);
  scene.add(key, rim);

  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
  const pivot = new THREE.Group(); // 목 높이에서 돈다
  scene.add(pivot);

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const materials = {};
  const material = (id) => (materials[id] ||= (MAKE[id] || MAKE.white)());
  let mesh = null;
  let geometry = null;
  let modelH = 1.9;
  let modelW = 1.8; // 돌아도 들어가게 가로·앞뒤 중 긴 쪽
  let lookId = "white";
  let disposed = false;

  // ---- 크기 ----
  const fit = () => {
    const w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max((modelH * 1.12) / 2 / t, (modelW * 1.08) / 2 / (t * camera.aspect));
    camera.position.set(0, modelH * 0.5 + dist * 0.05, dist);
    camera.lookAt(0, modelH * 0.47, 0);
    camera.updateProjectionMatrix();
    wake();
  };
  const resizeObserver = new ResizeObserver(fit);
  resizeObserver.observe(box);

  // ---- 마우스: 화면 전체가 조각이 둘러보는 방 ----
  let pointer = null;
  const onMove = (e) => { pointer = { x: e.clientX, y: e.clientY }; wake(); };
  const onLeave = () => { pointer = null; wake(); };
  window.addEventListener("pointermove", onMove, { passive: true });
  document.documentElement.addEventListener("mouseleave", onLeave);
  window.addEventListener("blur", onLeave);

  // ---- 움직일 때만 그리기 ----
  const look = { yaw: 0, pitch: 0 };
  let hop = 0; // 모양이 바뀔 때 살짝 눌렸다 펴짐
  let running = false, last = 0, onScreen = true, raf = 0;
  const intersection = new IntersectionObserver((entries) => {
    onScreen = entries[0].isIntersecting;
    if (onScreen) wake();
  });
  intersection.observe(box);
  const onVisible = () => { if (!document.hidden) wake(); };
  document.addEventListener("visibilitychange", onVisible);

  function wake() {
    if (running || !mesh || disposed) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const aim = headAim(pointer, box.getBoundingClientRect());
    const k = 1 - Math.exp(-dt * 6);
    look.yaw += (aim.yaw - look.yaw) * k;
    look.pitch += (aim.pitch - look.pitch) * k;
    pivot.rotation.set(look.pitch, look.yaw, 0, "YXZ");
    hop = Math.max(0, hop - dt * 4);
    const s = 1 - Math.sin(hop * Math.PI) * 0.06;
    pivot.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    renderer.render(scene, camera);
    const settled = Math.abs(aim.yaw - look.yaw) < 0.0005 && Math.abs(aim.pitch - look.pitch) < 0.0005 && hop === 0;
    if (!onScreen || document.hidden || settled) { running = false; return; }
    raf = requestAnimationFrame(frame);
  }

  return {
    async load(url) {
      const gltf = await new GLTFLoader().loadAsync(url);
      if (disposed) return;
      let src = null;
      gltf.scene.traverse((o) => { if (!src && o.isMesh) src = o; });
      if (!src) throw new Error("bust.glb 안에 모양이 없음");
      gltf.scene.updateMatrixWorld(true);
      geometry = src.geometry.clone().applyMatrix4(src.matrixWorld);
      src.geometry.dispose();
      if (Array.isArray(src.material)) src.material.forEach((m) => m.dispose()); else src.material?.dispose();
      geometry.computeBoundingBox();
      const bb = geometry.boundingBox;
      // 바닥을 y=0, 가운데를 x·z=0 으로. 도는 점은 목(아래에서 22%)
      geometry.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
      modelH = bb.max.y - bb.min.y;
      modelW = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
      const neckY = modelH * 0.22;
      pivot.position.set(0, neckY, 0);
      geometry.translate(0, -neckY, 0);
      mesh = new THREE.Mesh(geometry, material(lookId));
      pivot.add(mesh);
      fit();
    },
    setLook(id, { hop: bounce = false } = {}) {
      lookId = id;
      if (mesh) mesh.material = material(id);
      if (bounce && !reduceMotion?.matches) hop = 1;
      wake();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("blur", onLeave);
      document.removeEventListener("visibilitychange", onVisible);
      geometry?.dispose();
      Object.values(materials).forEach((m) => m.dispose());
      envTexture.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
