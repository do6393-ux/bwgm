// 부원여중 본관 3D — 화면(three.js) 담당. React 와는 콜백/메서드로만 주고받음.
// 모델: public/school3d/buwon_floors.glb (노드 1F~4F, 애니메이션 'explode'), 실·자리·길찾기: rooms.json
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const COLOR = { route: 0x00e599, walker: 0xff5000 };
// three r155+ 는 조명 세기가 물리 단위라 예전(r147) 밝기와 맞추려면 π 를 곱함
const LIGHT = Number(THREE.REVISION) >= 155 ? Math.PI : 1;
const WING = { 북측동: "북측동", 남측동: "남측동", 연결동: "연결동", 동측계단: "동쪽", 북측돌출부: "북쪽 돌출부" };
const HOME_OFF = new THREE.Vector3(-82, 88, 128);
const lift = (e) => 4 + 26 * e;
const easeOf = (p) => p * p * (3 - 2 * p);

export function createSchool3D({ stage, labels, glbUrl, roomsUrl, onProgress, onReady, onError, onExplode, onSelect }) {
  // 포털 PC·교실 컴퓨터는 Windows 애니메이션 효과가 꺼져 있어도(reduced-motion) 분해·확대 움직임을 보여 준다
  const reduce = false;
  const state = { target: 0, p: 0, sel: null, pick: null, route: null, from: null, to: null, zoomGoal: null };
  let floors = [], mixer = null, clip = null, rooms = [], seats = [], nav = null, raf = 0, disposed = false;
  const roomLabels = [], floorLabels = [], seatLabels = [];
  const size = () => ({ w: stage.clientWidth || 1, h: stage.clientHeight || 1 });

  // ---------------------------------------------------------------- 장면
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // r18x 에서 PCFSoftShadowMap 이 없어져 경고만 나서 바로 이것을 씀
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a2a, 0.75 * LIGHT));
  const sun = new THREE.DirectionalLight(0xffffff, 1.05 * LIGHT);
  sun.position.set(-70, 150, 95);
  sun.target.position.set(0, 30, 0);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 10, far: 450 });
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const gc = document.createElement("canvas");
  gc.width = gc.height = 256;
  const g2 = gc.getContext("2d");
  const grad = g2.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(255,255,255,0.10)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g2.fillStyle = grad;
  g2.fillRect(0, 0, 256, 256);
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(420, 420),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -0.64; // 바깥 땅은 1층 바닥보다 0.75m 아래 (출입구 계단·경사로가 땅에 닿게)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShadowMaterial({ opacity: 0.45 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.62;
  ground.receiveShadow = true;
  scene.add(disc, ground);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 12;
  controls.maxDistance = 900;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
  controls.zoomSpeed = 0.9;

  function home() {
    const fit = Math.max(1, (16 / 9) / camera.aspect);
    const ty = lift(easeOf(state.p));
    controls.target.set(2, ty, 0);
    camera.position.set(2, ty, 0).add(HOME_OFF.clone().multiplyScalar(fit));
    state.zoomGoal = null;
    controls.update();
  }
  function resize() {
    const { w, h } = size();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();
  home();

  // ---------------------------------------------------------------- 라벨 (HTML, 3D 위치를 화면에 투영)
  function mkLabel(cls, text, hidden) {
    const el = document.createElement("span");
    el.className = cls;
    el.textContent = text;
    el.hidden = !!hidden;
    labels.appendChild(el);
    return el;
  }
  const v = new THREE.Vector3(), tmp = new THREE.Vector3();
  function project(world, el, dx = 0, dy = 0) {
    v.copy(world).project(camera);
    if (v.z > 1 || v.z < -1) { el.style.visibility = "hidden"; return; }
    el.style.visibility = "visible";
    const { w, h } = size();
    const x = (v.x * 0.5 + 0.5) * w + dx, y = (-v.y * 0.5 + 0.5) * h + dy;
    el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`;
  }
  function place(l) {
    floors[l.floor - 1].localToWorld(tmp.copy(l.p));
    project(tmp, l.el);
  }

  // ---------------------------------------------------------------- 모델 불러오기
  const loader = new GLTFLoader();
  const modelP = new Promise((res, rej) => loader.load(glbUrl, res,
    (x) => { if (x.total && onProgress) onProgress(Math.min(99, Math.round((x.loaded / x.total) * 100))); }, rej));
  Promise.all([modelP, fetch(roomsUrl).then((r) => r.json())]).then(([gltf, meta]) => {
    if (disposed) return;
    const root = gltf.scene;
    scene.add(root);
    floors = ["1F", "2F", "3F", "4F"].map((n) => root.getObjectByName(n));
    floors.forEach((node, i) => node.traverse((o) => {
      o.userData.floor = i + 1;
      if (!o.isMesh) return;
      const glass = /glass/.test(o.material.name);
      o.material = o.material.clone();
      if (glass) o.material.depthWrite = false;
      o.material.userData.base = { opacity: o.material.opacity, transparent: o.material.transparent, depthWrite: o.material.depthWrite };
      o.userData.glass = glass;
      o.castShadow = !glass;
      o.receiveShadow = true;
    }));
    clip = gltf.animations[0];
    mixer = new THREE.AnimationMixer(root);
    const act = mixer.clipAction(clip);
    act.setLoop(THREE.LoopOnce);
    act.clampWhenFinished = true;
    act.play();

    rooms = meta.rooms || [];
    seats = meta.seats || [];
    nav = meta.nav;
    rooms.forEach((r) => roomLabels.push({ el: mkLabel("s3d-lbl", r.name, true), p: new THREE.Vector3().fromArray(r.pos_local), floor: r.floor }));
    seats.forEach((s) => seatLabels.push({ el: mkLabel("s3d-slbl", s.name, true), p: new THREE.Vector3().fromArray(s.pos_local), floor: s.floor }));
    floors.forEach((f, i) => {
      const el = document.createElement("button");
      el.className = "s3d-flbl";
      el.type = "button";
      el.textContent = i + 1 + "F";
      el.setAttribute("aria-label", i + 1 + "층");
      el.addEventListener("click", () => api.toggleFloor(i + 1));
      labels.appendChild(el);
      floorLabels.push({ el, p: new THREE.Vector3(-49, 1.8, -12), floor: i + 1 });
    });
    if (onReady) onReady({ rooms });
  }).catch((err) => { if (!disposed && onError) onError(err); });

  // ---------------------------------------------------------------- 층 보이기 / 흐리게
  function setDim(node, dim) {
    node.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material, b = m.userData.base;
      m.transparent = dim || b.transparent;
      m.opacity = dim ? b.opacity * 0.08 : b.opacity;
      m.depthWrite = dim ? false : b.depthWrite;
      m.needsUpdate = true;
      o.castShadow = !dim && !o.userData.glass;
    });
  }
  const visibleFloors = () => (state.sel ? [state.sel] : state.route ? state.route.floors : [1, 2, 3, 4]);
  function refreshDim() {
    const vis = visibleFloors();
    floors.forEach((node, i) => setDim(node, !vis.includes(i + 1)));
    floorLabels.forEach((l) => l.el.setAttribute("aria-pressed", String(state.sel === l.floor)));
  }

  // ---------------------------------------------------------------- 길찾기
  function roomName(i, withFloor) {
    const r = rooms[i];
    if (!r) return "";
    const dup = rooms.some((o, j) => j !== i && o.floor === r.floor && o.name === r.name);
    return (withFloor ? r.floor + "층 " : "") + r.name + (dup ? ` (${WING[r.wing] || r.wing})` : "");
  }
  function dijkstra(src, dst) {
    const n = nav.nodes.length;
    const adj = Array.from({ length: n }, () => []);
    nav.edges.forEach((e, k) => { adj[e[0]].push([e[1], e[2], k]); adj[e[1]].push([e[0], e[2], k]); });
    const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), via = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    dist[src] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0 || u === dst) break;
      done[u] = 1;
      for (const [w2, wt, k] of adj[u]) if (dist[u] + wt < dist[w2]) { dist[w2] = dist[u] + wt; prev[w2] = u; via[w2] = k; }
    }
    if (!isFinite(dist[dst])) return null;
    const path = [], edges = [];
    for (let x = dst; x >= 0; x = prev[x]) { path.unshift(x); if (via[x] >= 0) edges.unshift(via[x]); }
    return { path, edges };
  }
  function describe(res) {
    const out = ["출발: " + roomName(state.from, true)];
    let lastWing = null, k = 0;
    const P = res.path;
    while (k < P.length - 1) {
      const e = nav.edges[res.edges[k]];
      if (e[3] === "stair") {
        const f0 = nav.nodes[P[k]].f;
        let j = k;
        while (j < P.length - 1 && nav.edges[res.edges[j]][3] === "stair") j++;
        out.push(`${e[4]}으로 ${f0}층 → ${nav.nodes[P[j]].f}층`);
        lastWing = null;
        k = j;
        continue;
      }
      if (e[3] === "out") { out.push(e[4] === "중정" ? "통로로 나가 중정을 지나 로비로" : "바깥으로 돌아서 이동"); lastWing = null; }
      const n = nav.nodes[P[k + 1]];
      if (n.k === "corr" && n.wing !== lastWing) {
        out.push(`${n.wing === "연결동" ? "연결동 복도" : n.wing + " 복도"}를 따라 이동`);
        lastWing = n.wing;
      }
      k++;
    }
    out.push("도착: " + roomName(state.to, true));
    return out;
  }

  // 경로(초록) 위에 걷는 점(주황): 둘 다 depthTest 끔 + 렌더 순서로 위아래 결정
  const ROUTE_MAT = new THREE.MeshBasicMaterial({ color: COLOR.route, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
  const mkMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false });
  const cylGeo = new THREE.CylinderGeometry(0.3, 0.3, 1, 10, 1, true);
  cylGeo.translate(0, 0.5, 0);
  const jointGeo = new THREE.SphereGeometry(0.3, 10, 8);
  const routeGroup = new THREE.Group();
  scene.add(routeGroup);
  const walker = new THREE.Group();
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.9, 20, 14), mkMat(COLOR.walker, 0.35));
  const ring = new THREE.Mesh(new THREE.SphereGeometry(1.15, 20, 14), mkMat(0xffffff, 1));
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 14), mkMat(COLOR.walker, 1));
  halo.renderOrder = 20; ring.renderOrder = 21; core.renderOrder = 22;
  walker.add(halo, ring, core);
  walker.visible = false;
  scene.add(walker);
  const segs = [], joints = [], wp = [];
  const mkFrom = mkLabel("s3d-mk s3d-mk-from", "출발", true), mkTo = mkLabel("s3d-mk s3d-mk-to", "도착", true);

  function updateRoute(t) {
    const R = state.route;
    const n = R ? R.path.length : 0;
    while (wp.length < n) wp.push(new THREE.Vector3());
    for (let i = 0; i < n; i++) {
      const nd = nav.nodes[R.path[i]];
      floors[nd.f - 1].localToWorld(wp[i].fromArray(nd.p));
    }
    while (segs.length < n - 1) {
      const m = new THREE.Mesh(cylGeo, ROUTE_MAT); m.renderOrder = 10; routeGroup.add(m); segs.push(m);
      const j = new THREE.Mesh(jointGeo, ROUTE_MAT); j.renderOrder = 10; routeGroup.add(j); joints.push(j);
    }
    const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
    let total = 0;
    for (let i = 0; i < segs.length; i++) {
      const on = i < n - 1;
      segs[i].visible = joints[i].visible = on;
      if (!on) continue;
      d.subVectors(wp[i + 1], wp[i]);
      const len = d.length();
      total += len;
      segs[i].position.copy(wp[i]);
      segs[i].scale.set(1, Math.max(len, 0.001), 1);
      segs[i].quaternion.setFromUnitVectors(up, d.normalize());
      joints[i].position.copy(wp[i + 1]);
    }
    walker.visible = n > 1;
    mkFrom.hidden = mkTo.hidden = n < 2;
    if (n < 2) return;
    let s = ((t / 1000) * 14) % total;                // 초당 14m
    for (let i = 0; i < n - 1; i++) {
      const len = wp[i].distanceTo(wp[i + 1]);
      if (s <= len) { walker.position.lerpVectors(wp[i], wp[i + 1], len ? s / len : 0); break; }
      s -= len;
    }
    walker.position.y += 0.6;
    halo.scale.setScalar(reduce ? 1 : 1 + 0.25 * Math.sin(t / 220));
    walker.scale.setScalar(THREE.MathUtils.clamp(camera.position.distanceTo(walker.position) / 160, 0.45, 1.6));
    project(wp[0], mkFrom, 0, -18);
    project(wp[n - 1], mkTo, 0, -18);
  }

  // ---------------------------------------------------------------- 건물에서 실 찍기
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let downAt = null, pickCb = null;
  const onDown = (e) => { downAt = [e.clientX, e.clientY]; };
  const onUp = (e) => {
    if (!state.pick || !downAt || !floors.length) return;
    if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const rc = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(visibleFloors().map((f) => floors[f - 1]), true)[0];
    if (!hit) return;
    let o = hit.object;
    while (o && !o.userData.floor) o = o.parent;
    const f = o ? o.userData.floor : null;
    if (!f) return;
    const lp = floors[f - 1].worldToLocal(hit.point.clone());
    let best = -1, bd = Infinity;
    rooms.forEach((r, i) => {
      if (r.floor !== f) return;
      const dd = Math.hypot(r.pos_local[0] - lp.x, r.pos_local[2] - lp.z);
      if (dd < bd) { bd = dd; best = i; }
    });
    if (best >= 0) {
      const which = state.pick, cb = pickCb;
      state.pick = null;
      pickCb = null;
      stage.classList.remove("s3d-picking");
      if (cb) cb(which, best);
    }
  };
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);

  // ---------------------------------------------------------------- 매 프레임
  let shown = -1;
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const prevE = easeOf(state.p);
    state.p += (state.target - state.p) * (reduce ? 1 : 0.07);
    if (Math.abs(state.target - state.p) < 1e-4) state.p = state.target;
    const p = state.p, e = easeOf(p);
    if (mixer && clip) mixer.setTime(Math.min(p, 0.9999) * clip.duration);
    const dy = lift(e) - lift(prevE);
    if (dy) { controls.target.y += dy; camera.position.y += dy; }
    if (state.zoomGoal !== null) {                       // 버튼 확대/축소를 부드럽게
      const off = camera.position.clone().sub(controls.target);
      const dist = off.length();
      const nd = reduce ? state.zoomGoal : dist + (state.zoomGoal - dist) * 0.18;
      camera.position.copy(controls.target).add(off.setLength(nd));
      if (Math.abs(state.zoomGoal - nd) < 0.05) state.zoomGoal = null;
    }
    controls.update();
    scene.updateMatrixWorld();
    if (floors.length) updateRoute(t);
    renderer.render(scene, camera);

    const pct = Math.round(p * 100);
    if (pct !== shown) { shown = pct; if (onExplode) onExplode(pct); }
    if (!floors.length) return;
    const fo = Math.min(1, Math.max(0, (p - 0.25) / 0.3));
    floorLabels.forEach((l) => { l.el.style.opacity = fo; l.el.style.pointerEvents = fo > 0.5 ? "auto" : "none"; place(l); });
    roomLabels.forEach((l) => { const on = state.sel === l.floor; l.el.hidden = !on; if (on) place(l); });
    const near = camera.position.distanceTo(controls.target) < 120;
    seatLabels.forEach((l) => { const on = near && state.sel === l.floor; l.el.hidden = !on; if (on) place(l); });
  }
  raf = requestAnimationFrame(frame);

  // ---------------------------------------------------------------- 바깥에서 쓰는 메서드
  const api = {
    explodeTo(x) { state.target = Math.min(1, Math.max(0, x)); },
    home,
    zoom(factor) {
      const cur = state.zoomGoal ?? camera.position.distanceTo(controls.target);
      state.zoomGoal = THREE.MathUtils.clamp(cur * factor, controls.minDistance, controls.maxDistance);
    },
    toggleFloor(f) {
      if (!floors.length) return;
      state.sel = state.sel === f || f == null ? null : f;
      refreshDim();
      if (state.sel && state.target < 0.85) state.target = 1;
      if (onSelect) onSelect(state.sel);
    },
    roomName,
    /** 출발·도착(실 번호)으로 경로 계산. 결과: {summary, steps} 또는 {note} */
    route(from, to) {
      state.from = from; state.to = to; state.route = null;
      let res = { note: "출발과 도착을 고르거나, 찍기를 누른 뒤 건물에서 실을 누르세요." };
      if (nav && from != null && to != null) {
        if (from === to) res = { note: "출발과 도착이 같은 곳이에요." };
        else {
          const nodeOf = (i) => nav.nodes.findIndex((n) => n.r === i);
          const r = dijkstra(nodeOf(from), nodeOf(to));
          if (!r) res = { note: "이어지는 길을 찾지 못했어요." };
          else {
            const fl = [...new Set(r.path.map((i) => nav.nodes[i].f))].sort();
            state.route = { path: r.path, floors: fl };
            let walk = 0, nStair = 0;
            r.edges.forEach((k) => { const e = nav.edges[k]; if (e[3] === "stair") nStair++; else walk += e[2]; });
            const sec = walk / 1.2 + nStair * 22;
            res = { summary: `${Math.round(walk + nStair * 7)}m · ${Math.max(1, Math.round(sec / 60))}분`, steps: describe(r) };
            if (fl.length > 1 && state.target < 0.6) state.target = 0.85;
            if (state.sel !== null) { state.sel = null; if (onSelect) onSelect(null); }
          }
        }
      }
      refreshDim();
      return res;
    },
    /** 다음 클릭에서 실을 골라 cb(which, roomIndex) 호출. which=null 이면 취소 */
    pick(which, cb) {
      state.pick = which;
      pickCb = which ? cb : null;
      stage.classList.toggle("s3d-picking", !!which);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      });
      renderer.dispose();
      renderer.domElement.remove();
      labels.textContent = "";
    },
  };
  return api;
}
