// 부원여중 본관 3D 지도 — 층 분해/합치기, 확대·축소 버튼(전자칠판용), 층별 실 목록, 길찾기
// 사용: <School3D onClose={() => setOpen(false)} />   (부모 요소 크기를 꽉 채움)
// 필요: npm i three  /  public/school3d/buwon_floors.glb, public/school3d/rooms.json
import { useEffect, useMemo, useRef, useState } from "react";
import { createSchool3D } from "./engine.js";
import "./school3d.css";

const NOTE = "출발과 도착을 고르거나, 찍기를 누른 뒤 건물에서 실을 누르세요.";

export default function School3D({
  glbUrl = "/school3d/buwon_floors.glb",
  roomsUrl = "/school3d/rooms.json",
  onClose,
  title = "본관 4개 층 분해 보기",
}) {
  const stageRef = useRef(null);
  const labelsRef = useRef(null);
  const eng = useRef(null);
  const [load, setLoad] = useState(0);          // 0~99 불러오는 중, 100 완료, -1 실패
  const [rooms, setRooms] = useState([]);
  const [names, setNames] = useState([]);       // 실 이름 (같은 층에 같은 이름이면 동 이름을 붙임) — 렌더 중에 엔진(ref)을 읽지 않으려고 미리 받아 둠
  const [explode, setExplode] = useState(0);    // 화면에 실제로 보이는 분해 정도(%)
  const [slider, setSlider] = useState(0);      // 슬라이더 손잡이 (사용자가 잡고 있을 땐 그대로 둠)
  const sliderRef = useRef(null);
  const [sel, setSel] = useState(null);
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [pick, setPick] = useState(null);
  const [result, setResult] = useState({ note: NOTE });
  const [routeOpen, setRouteOpen] = useState(() => window.innerWidth >= 720);

  useEffect(() => {
    const e = createSchool3D({
      stage: stageRef.current,
      labels: labelsRef.current,
      glbUrl,
      roomsUrl,
      onProgress: setLoad,
      onReady: ({ rooms: list }) => { setRooms(list); setNames(list.map((_, i) => e.roomName(i, false))); setLoad(100); },
      onError: () => setLoad(-1),
      onExplode: (pct) => {
        setExplode(pct);
        if (document.activeElement !== sliderRef.current) setSlider(pct);
      },
      onSelect: setSel,
    });
    eng.current = e;
    return () => { e.dispose(); eng.current = null; };
  }, [glbUrl, roomsUrl]);

  useEffect(() => {
    if (load === 100 && eng.current) setResult(eng.current.route(from, to));
  }, [from, to, load]);

  const name = (i) => names[i] || "";
  const groups = useMemo(() => [1, 2, 3, 4].map((f) => ({
    f,
    items: rooms.map((r, i) => i).filter((i) => rooms[i].floor === f)
      .sort((a, b) => rooms[a].name.localeCompare(rooms[b].name, "ko", { numeric: true })),
  })), [rooms]);
  const floorRooms = sel ? rooms.map((r, i) => i).filter((i) => rooms[i].floor === sel) : [];

  const startPick = (which) => {
    const next = pick === which ? null : which;
    setPick(next);
    eng.current?.pick(next, (w, i) => { setPick(null); (w === "from" ? setFrom : setTo)(i); });
  };
  const onSelectChange = (setter) => (e) => setter(e.target.value === "" ? null : Number(e.target.value));

  return (
    <div className="s3d">
      <div className="s3d-stage" ref={stageRef} />
      <div className="s3d-labels" ref={labelsRef} />

      <aside className="s3d-side" aria-label="안내">
        <header className="s3d-intro">
          <p className="s3d-eyebrow">Buwon Girls' Middle School · 3D</p>
          <h2 className="s3d-title">{title}</h2>
          <div className="s3d-keys"><span><b>DRAG</b> 회전</span><span><b>WHEEL</b> 확대/축소</span><span><b>R-DRAG</b> 이동</span></div>
        </header>

        <section className="s3d-card">
          <button type="button" className="s3d-cardhead" aria-expanded={routeOpen} onClick={() => setRouteOpen(!routeOpen)}>
            <span>길찾기</span>
            <span className="s3d-count">{result.summary || ""}</span>
            <span className="s3d-fold" aria-hidden="true">{routeOpen ? "−" : "+"}</span>
          </button>
          {routeOpen && (
            <div className="s3d-route">
              {[["from", "출발", from, setFrom], ["to", "도착", to, setTo]].map(([k, label, val, setter]) => (
                <div className="s3d-field" key={k}>
                  <span className={`s3d-tag s3d-tag-${k}`}>{label}</span>
                  <select aria-label={`${label} 실`} value={val ?? ""} onChange={onSelectChange(setter)}>
                    <option value="">{label}할 곳 선택</option>
                    {groups.map((g) => (
                      <optgroup key={g.f} label={`${g.f}층`}>
                        {g.items.map((i) => <option key={i} value={i}>{name(i, false)}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <button type="button" className="s3d-btn" aria-pressed={pick === k} onClick={() => startPick(k)}>찍기</button>
                </div>
              ))}
              <div className="s3d-row">
                <button type="button" className="s3d-btn" onClick={() => { setFrom(to); setTo(from); }}>출발 ↔ 도착</button>
                <button type="button" className="s3d-link" onClick={() => { setFrom(null); setTo(null); }}>지우기</button>
                {pick && <span className="s3d-pickhint">건물에서 {pick === "from" ? "출발할" : "도착할"} 실을 누르세요</span>}
              </div>
              {result.steps ? (
                <ol className="s3d-steps">
                  {result.steps.map((s, k) => <li key={k} className={k === result.steps.length - 1 ? "end" : ""}>{s}</li>)}
                </ol>
              ) : (
                <p className="s3d-note">{result.note}</p>
              )}
            </div>
          )}
        </section>

        {sel && (
          <section className="s3d-card">
            <div className="s3d-cardhead s3d-static">
              <span>{sel}층 실 목록</span>
              <span className="s3d-count">{floorRooms.length}개</span>
            </div>
            <div className="s3d-chips">
              {floorRooms.map((i) => (
                <button type="button" key={i} className="s3d-chip" title="도착지로 정하기" onClick={() => setTo(i)}>{name(i, false)}</button>
              ))}
            </div>
            <button type="button" className="s3d-link" onClick={() => eng.current?.toggleFloor(null)}>전체 층 다시 보기</button>
          </section>
        )}
      </aside>

      <nav className="s3d-floors" aria-label="층 선택">
        {[4, 3, 2, 1].map((f) => (
          <button type="button" key={f} className="s3d-ftab" aria-pressed={sel === f} onClick={() => eng.current?.toggleFloor(f)}>
            <span className="n">{f}</span><span className="u">층</span>
          </button>
        ))}
      </nav>

      <div className="s3d-zoom" role="group" aria-label="확대·축소">
        <button type="button" className="s3d-zbtn" aria-label="확대" onClick={() => eng.current?.zoom(0.75)}>+</button>
        <button type="button" className="s3d-zbtn" aria-label="축소" onClick={() => eng.current?.zoom(1.33)}>−</button>
        <button type="button" className="s3d-zbtn s3d-zhome" aria-label="처음 시점으로" onClick={() => eng.current?.home()}>⌂</button>
      </div>

      <section className="s3d-controls" aria-label="분해 조작">
        <div className="s3d-dock">
          <button type="button" className="s3d-btn" onClick={() => eng.current?.explodeTo(0)}>합치기</button>
          <label className="s3d-slider">
            <span className="s3d-lab"><span>Explode</span><b>{explode}%</b></span>
            <input ref={sliderRef} type="range" min="0" max="100" step="1" value={slider}
              onChange={(e) => { const x = Number(e.target.value); setSlider(x); eng.current?.explodeTo(x / 100); }} />
          </label>
          <button type="button" className="s3d-btn s3d-primary" onClick={() => eng.current?.explodeTo(1)}>분해</button>
        </div>
      </section>

      {onClose && <button type="button" className="s3d-close" onClick={onClose}>닫기 ✕</button>}

      {load !== 100 && (
        <div className="s3d-loading">
          <p>{load < 0 ? "모델 파일을 불러오지 못했어요. 새로고침해 주세요." : `LOADING MODEL · ${load}%`}</p>
          <span className="s3d-pbar"><i style={{ width: `${Math.max(0, load)}%` }} /></span>
        </div>
      )}
    </div>
  );
}
