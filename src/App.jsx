import { useState, useRef, useEffect, useCallback } from "react";

const CONDITIONS = [
  { id: 1, D: 200, W: 80,  label: "D200_W80" },
  { id: 2, D: 320, W: 80,  label: "D320_W80" },
  { id: 3, D: 480, W: 80,  label: "D480_W80" },
].map(c => ({ ...c, ID: parseFloat((Math.log2(c.D / c.W + 1)).toFixed(3)) }));

const TRIALS_PER_CONDITION = 8;
const TOTAL_CONDITIONS = CONDITIONS.length;
const ARENA = { w: 900, h: 480 };
const GHOST_COUNT = 4;

const THEMES = {
  Cyber: {
    bg: "linear-gradient(135deg,#0a0a1a 0%,#0d1b2a 50%,#0a0a1a 100%)",
    grid: "rgba(0,255,200,0.07)",
    accent: "#00ffe0", accent2: "#ff00aa",
    player: "🤖", target: "🎯", ghost: "👻",
    playerColor: "#00ffe0", targetColor: "#ff00aa",
    glow: "0 0 20px #00ffe0, 0 0 40px #00ffe080",
    targetGlow: "0 0 20px #ff00aa, 0 0 40px #ff00aa80",
    font: "'Courier New', monospace", name: "Cyber",
  },
  Mario: {
    bg: "linear-gradient(180deg,#1a0a2e 0%,#16213e 40%,#0f3460 100%)",
    grid: "rgba(255,200,0,0.06)",
    accent: "#ffd700", accent2: "#ff4444",
    player: "👲🏻", target: "🏆", ghost: "👾",
    playerColor: "#ffd700", targetColor: "#ff4444",
    glow: "0 0 20px #ffd700, 0 0 40px #ffd70080",
    targetGlow: "0 0 20px #ff4444, 0 0 40px #ff444480",
    font: "'Georgia', serif", name: "Mario",
  },
  Space: {
    bg: "linear-gradient(135deg,#000010 0%,#050520 50%,#000010 100%)",
    grid: "rgba(100,100,255,0.06)",
    accent: "#7b61ff", accent2: "#00d4ff",
    player: "🚀", target: "📍", ghost: "🌀",
    playerColor: "#7b61ff", targetColor: "#00d4ff",
    glow: "0 0 20px #7b61ff, 0 0 40px #7b61ff80",
    targetGlow: "0 0 20px #00d4ff, 0 0 40px #00d4ff80",
    font: "'Arial', sans-serif", name: "Space",
  },
};

const easeInOutCubic = t =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function fittsAB(data) {
  if (data.length < 2) return { a: null, b: null };
  const n = data.length;
  let sX = 0, sY = 0, sXY = 0, sX2 = 0;
  data.forEach(d => {
    sX += d.ID_bits; sY += d.MT_ms;
    sXY += d.ID_bits * d.MT_ms; sX2 += d.ID_bits * d.ID_bits;
  });
  const denom = n * sX2 - sX * sX;
  if (denom === 0) return { a: null, b: null };
  const bVal = (n * sXY - sX * sY) / denom;
  const aVal = (sY - bVal * sX) / n;
  return { a: aVal.toFixed(2), b: bVal.toFixed(2) };
}

function motorScore(data) {
  if (!data.length) return null;
  const tp = data.map(d => d.ID_bits / (d.MT_ms / 1000));
  return (tp.reduce((a, b) => a + b, 0) / tp.length).toFixed(2);
}

function buildCSV(rows) {
  const { a, b } = fittsAB(rows);
  const tp = motorScore(rows);
  const headers = ["trial_index","condition_id","condition_label","D_px","W_px","ID_bits","MT_ms","hit","miss","throughput_bps","timestamp_iso"].join(",");
  const lines = rows.map(r => {
    const tpRow = (r.ID_bits / (r.MT_ms / 1000)).toFixed(4);
    return [r.trial_index, r.condition_id, r.condition_label, r.D_px, r.W_px, r.ID_bits, r.MT_ms, r.hit, r.miss, tpRow, `"${r.timestamp_iso}"`].join(",");
  });
  const summary = ["","# FITTS MODEL SUMMARY",`# a (intercept ms),${a ?? ""}`,`# b (ms/bit),${b ?? ""}`,`# Mean Throughput (bps),${tp ?? ""}`,`# Total Trials,${rows.length}`].join("\n");
  return "\uFEFF" + headers + "\n" + lines.join("\n") + "\n" + summary;
}

function placeTargetAtDistance(px, py, D, W, tries = 40) {
  const margin = W / 2 + 8;
  const DIAG_ANGLES = [45, 135, 225, 315, 30, 150, 210, 330, 60, 120, 240, 300];
  for (let attempt = 0; attempt < tries; attempt++) {
    const angDeg = DIAG_ANGLES[Math.floor(Math.random() * DIAG_ANGLES.length)];
    const ang = angDeg * Math.PI / 180;
    const tx = px + Math.cos(ang) * D;
    const ty = py + Math.sin(ang) * D;
    const cx = Math.max(margin, Math.min(ARENA.w - W - margin, tx));
    const cy = Math.max(margin, Math.min(ARENA.h - W - margin, ty));
    const actual = Math.hypot(cx - px, cy - py);
    if (actual >= D * 0.75) return { x: cx, y: cy };
  }
  const tx = px < ARENA.w / 2 ? ARENA.w - W - margin : margin;
  const ty = py < ARENA.h / 2 ? ARENA.h - W - margin : margin;
  return { x: tx, y: ty };
}

// ── Ghost spawner ─────────────────────────────────────────────────────────────
function spawnGhosts(targetPos, W) {
  return Array.from({ length: GHOST_COUNT }, (_, i) => {
    const margin = W / 2 + 10;
    let gx, gy;
    do {
      gx = margin + Math.random() * (ARENA.w - W - margin * 2);
      gy = margin + Math.random() * (ARENA.h - W - margin * 2);
    } while (Math.hypot(gx - targetPos.x, gy - targetPos.y) < W * 2.5);
    // random smooth drift direction
    const ang = Math.random() * Math.PI * 2;
    const spd = 0.6 + Math.random() * 0.8;
    return { id: i, x: gx, y: gy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd };
  });
}

function useParticles(canvasRef, theme) {
  const particles = useRef([]);
  const rafRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    particles.current = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.3, vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2, alpha: Math.random() * 0.6 + 0.2,
    }));
    const accentHex = THEMES[theme].accent;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.current.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = accentHex + Math.floor(p.alpha * 255).toString(16).padStart(2, "0");
        ctx.fill();
      });
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [theme, canvasRef]);
}

function Explosion({ pos, color, id }) {
  return (
    <div key={id} style={{ position: "absolute", left: pos.x, top: pos.y, pointerEvents: "none", zIndex: 20, transform: "translate(-50%,-50%)" }}>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} style={{ position: "absolute", width: 6, height: 6, borderRadius: "50%", background: color, animation: `explodePt${i} 0.6s ease-out forwards` }} />
      ))}
      <style>{Array.from({ length: 8 }, (_, i) => {
        const ang = (i / 8) * Math.PI * 2;
        return `@keyframes explodePt${i}{0%{transform:translate(0,0);opacity:1;}100%{transform:translate(${Math.cos(ang)*40}px,${Math.sin(ang)*40}px);opacity:0;}}`;
      }).join("")}</style>
    </div>
  );
}

function Trail({ points, color }) {
  if (points.length < 2) return null;
  return (
    <svg style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5, width: "100%", height: "100%" }}>
      {points.map((p, i) => i > 0 && (
        <line key={i} x1={points[i-1].x + 30} y1={points[i-1].y + 30} x2={p.x + 30} y2={p.y + 30}
          stroke={color} strokeWidth={2 - i * (1.5 / points.length)} strokeOpacity={(i / points.length) * 0.8} />
      ))}
    </svg>
  );
}

export default function App() {
  const [theme, setTheme] = useState("Cyber");
  const T = THEMES[theme];

  const [phase, setPhase] = useState("idle");
  const [condIdx, setCondIdx] = useState(0);
  const [trialNum, setTrialNum] = useState(1);
  const [globalTrial, setGlobalTrial] = useState(1);

  const [playerPos, setPlayerPos] = useState({ x: 50, y: 200 });
  const [targetPos, setTargetPos] = useState({ x: 700, y: 150 });
  const [animating, setAnimating] = useState(false);
  const [trail, setTrail] = useState([]);

  const [rows, setRows] = useState([]);
  const [explosions, setExplosions] = useState([]);
  const [feedback, setFeedback] = useState("");
  const [missCount, setMissCount] = useState(0);

  // ── Ghost state ──────────────────────────────────────────────────────────────
  const [ghosts, setGhosts] = useState([]);
  const ghostRafRef = useRef(null);
  const ghostsRef = useRef([]);

  const startTimeRef = useRef(null);
  const rafRef = useRef(null);
  const playerRef = useRef({ x: 50, y: 200 });
  const animatingRef = useRef(false);
  const phaseRef = useRef("idle");
  const canvasRef = useRef(null);

  useParticles(canvasRef, theme);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { animatingRef.current = animating; }, [animating]);

  // ── Ghost animation loop ─────────────────────────────────────────────────────
  const startGhostLoop = useCallback((initialGhosts) => {
    cancelAnimationFrame(ghostRafRef.current);
    ghostsRef.current = initialGhosts;

    const tick = () => {
      ghostsRef.current = ghostsRef.current.map(g => {
        let nx = g.x + g.vx;
        let ny = g.y + g.vy;
        let nvx = g.vx, nvy = g.vy;
        if (nx < 10 || nx > ARENA.w - 70) { nvx = -nvx; nx = Math.max(10, Math.min(ARENA.w - 70, nx)); }
        if (ny < 10 || ny > ARENA.h - 70) { nvy = -nvy; ny = Math.max(10, Math.min(ARENA.h - 70, ny)); }
        return { ...g, x: nx, y: ny, vx: nvx, vy: nvy };
      });
      setGhosts([...ghostsRef.current]);
      ghostRafRef.current = requestAnimationFrame(tick);
    };
    ghostRafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopGhostLoop = useCallback(() => {
    cancelAnimationFrame(ghostRafRef.current);
    setGhosts([]);
    ghostsRef.current = [];
  }, []);

  const cond = CONDITIONS[Math.min(condIdx, CONDITIONS.length - 1)];
  const { a, b } = fittsAB(rows);
  const tp = motorScore(rows);

  // ── Animate player ──────────────────────────────────────────────────────────
  const animatePlayerTo = useCallback((tx, ty, onDone) => {
    cancelAnimationFrame(rafRef.current);
    animatingRef.current = true;
    setAnimating(true);
    const sx = playerRef.current.x, sy = playerRef.current.y;
    const dist = Math.hypot(tx - sx, ty - sy);
    const dur = Math.max(300, 400 + dist * 0.5);
    const t0 = performance.now();
    const trailPts = [{ x: sx, y: sy }];
    let lastSample = 0;
    const step = (now) => {
      const t = Math.min((now - t0) / dur, 1);
      const s = easeInOutCubic(t);
      const nx = sx + (tx - sx) * s, ny = sy + (ty - sy) * s;
      playerRef.current = { x: nx, y: ny };
      setPlayerPos({ x: nx, y: ny });
      if (t - lastSample > 0.08) { trailPts.push({ x: nx, y: ny }); lastSample = t; setTrail([...trailPts]); }
      if (t < 1) { rafRef.current = requestAnimationFrame(step); }
      else {
        playerRef.current = { x: tx, y: ty }; setPlayerPos({ x: tx, y: ty });
        animatingRef.current = false; setAnimating(false);
        onDone && onDone();
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  // ── Start ───────────────────────────────────────────────────────────────────
  const handleStart = useCallback((e) => {
    // FIX: stop click from bubbling to arena miss handler
    if (e) e.stopPropagation();
    cancelAnimationFrame(rafRef.current);
    stopGhostLoop();
    setRows([]); setCondIdx(0); setTrialNum(1); setGlobalTrial(1);
    setMissCount(0); setTrail([]); setExplosions([]);

    const px = 80, py = 200;
    const cond0 = CONDITIONS[0];
    const t0 = placeTargetAtDistance(px, py, cond0.D, cond0.W);
    playerRef.current = { x: px, y: py };
    setPlayerPos({ x: px, y: py });
    setTargetPos(t0);
    setFeedback("Find the SHAKING target — ignore moving ghosts!");

    // Spawn ghosts away from target
    const initGhosts = spawnGhosts(t0, cond0.W);
    startGhostLoop(initGhosts);

    phaseRef.current = "running";
    setPhase("running");
    requestAnimationFrame(() => { startTimeRef.current = performance.now(); });
  }, [stopGhostLoop, startGhostLoop]);

  // ── Hit target ──────────────────────────────────────────────────────────────
  const handleTargetClick = useCallback((e) => {
    e.stopPropagation();
    if (phaseRef.current !== "running" || animatingRef.current) return;
    if (startTimeRef.current === null) return;

    const MT = Math.round(performance.now() - startTimeRef.current);
    startTimeRef.current = null;

    setCondIdx(prevCondIdx => {
      setTrialNum(prevTrialNum => {
        setGlobalTrial(prevGlobal => {
          const activeCond = CONDITIONS[prevCondIdx];
          const row = {
            trial_index: prevGlobal, condition_id: activeCond.id, condition_label: activeCond.label,
            D_px: activeCond.D, W_px: activeCond.W, ID_bits: activeCond.ID,
            MT_ms: MT, hit: 1, miss: missCount, timestamp_iso: new Date().toISOString(),
          };
          setRows(prev => [...prev, row]);
          setMissCount(0);

          const boom = { id: Date.now(), pos: { x: targetPos.x + activeCond.W / 2, y: targetPos.y + activeCond.W / 2 }, color: T.accent2 };
          setExplosions(prev => [...prev, boom]);
          setTimeout(() => setExplosions(prev => prev.filter(b => b.id !== boom.id)), 700);
          setFeedback(`✓ ${MT} ms`);

          const isLastTrialInCond = prevTrialNum >= TRIALS_PER_CONDITION;
          const nextCondIdx = isLastTrialInCond ? prevCondIdx + 1 : prevCondIdx;
          const nextTrialNum = isLastTrialInCond ? 1 : prevTrialNum + 1;

          if (isLastTrialInCond && nextCondIdx >= TOTAL_CONDITIONS) {
            stopGhostLoop();
            setTimeout(() => { setPhase("done"); phaseRef.current = "done"; }, 50);
            return prevGlobal + 1;
          }

          if (isLastTrialInCond) setCondIdx(nextCondIdx);
          setTrialNum(nextTrialNum);

          const oldTarget = { x: targetPos.x, y: targetPos.y };
          const nextCond = CONDITIONS[nextCondIdx];
          animatePlayerTo(oldTarget.x, oldTarget.y, () => {
            const newT = placeTargetAtDistance(playerRef.current.x, playerRef.current.y, nextCond.D, nextCond.W);
            setTargetPos(newT);
            // Respawn ghosts around new target
            const newGhosts = spawnGhosts(newT, nextCond.W);
            startGhostLoop(newGhosts);
            requestAnimationFrame(() => { startTimeRef.current = performance.now(); });
          });
          return prevGlobal + 1;
        });
        return prevTrialNum;
      });
      return prevCondIdx;
    });
  }, [animatePlayerTo, missCount, targetPos, T.accent2, stopGhostLoop, startGhostLoop]);

  // ── Miss: only when running AND not clicking the start/done overlay ─────────
  const handleArenaMiss = useCallback((e) => {
    // FIX: ignore clicks that came from buttons/overlays via stopPropagation
    if (phaseRef.current !== "running" || animatingRef.current) return;
    if (startTimeRef.current === null) return; // timer not started yet
    setMissCount(m => m + 1);
    setFeedback("❌ Miss! Find the SHAKING one!");
  }, []);

  // ── Ghost click = miss ───────────────────────────────────────────────────────
  const handleGhostClick = useCallback((e) => {
    e.stopPropagation();
    if (phaseRef.current !== "running" || animatingRef.current) return;
    if (startTimeRef.current === null) return;
    setMissCount(m => m + 1);
    setFeedback("👻 Wrong! That's a ghost — find the SHAKING target!");
  }, []);

  const downloadCSV = useCallback(() => {
    if (!rows.length) return;
    const csv = buildCSV(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "fitts_law_data.csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [rows]);

  const handleReset = useCallback((e) => {
    if (e) e.stopPropagation();
    cancelAnimationFrame(rafRef.current);
    stopGhostLoop();
    startTimeRef.current = null;
    phaseRef.current = "idle";
    setPhase("idle");
    setRows([]); setCondIdx(0); setTrialNum(1); setGlobalTrial(1);
    setFeedback(""); setMissCount(0); setTrail([]); setExplosions([]);
    playerRef.current = { x: 50, y: 200 };
    setPlayerPos({ x: 50, y: 200 });
    setTargetPos({ x: 700, y: 150 });
  }, [stopGhostLoop]);

  const totalDone = rows.length;
  const totalTrials = TOTAL_CONDITIONS * TRIALS_PER_CONDITION;
  const W = cond.W;
  const condMTs = rows.filter(r => r.condition_id === cond.id).map(r => r.MT_ms);
  const avgMT = condMTs.length ? (condMTs.reduce((a, b) => a + b, 0) / condMTs.length).toFixed(0) : "--";
  const lastMT = condMTs.length ? condMTs[condMTs.length - 1] : "--";
  const actualDist = phase === "running"
    ? Math.hypot(targetPos.x + W/2 - (playerPos.x + 30), targetPos.y + W/2 - (playerPos.y + 30)).toFixed(0)
    : "--";

  // Shaking CSS keyframe amplitude based on W
  const shakeAmp = Math.max(3, Math.round(W * 0.08));

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.font, color: "#eee", display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 8px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", backgroundImage: `linear-gradient(${T.grid} 1px,transparent 1px),linear-gradient(90deg,${T.grid} 1px,transparent 1px)`, backgroundSize: "40px 40px", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 2, textAlign: "center", marginBottom: 12 }}>
        <h1 style={{ fontSize: 28, margin: 0, letterSpacing: 4, color: T.accent, textShadow: T.glow, textTransform: "uppercase" }}>⚡ Fitts' Law Experiment</h1>
        <p style={{ margin: "4px 0", fontSize: 12, color: "#aaa", letterSpacing: 2 }}>PERCEPTION · DECISION · MOTOR EXECUTION</p>
      </div>

      {/* Theme Selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, zIndex: 2, flexWrap: "wrap", justifyContent: "center" }}>
        {Object.keys(THEMES).map(th => (
          <button key={th} onClick={() => setTheme(th)} style={{ padding: "4px 14px", borderRadius: 20, border: `1.5px solid ${theme === th ? T.accent : "#555"}`, background: theme === th ? T.accent + "22" : "transparent", color: theme === th ? T.accent : "#999", cursor: "pointer", fontSize: 12, letterSpacing: 1, transition: "all 0.2s" }}>{THEMES[th].name} {THEMES[th].player}</button>
        ))}
      </div>

      {/* Perception legend */}
      {phase === "running" && (
        <div style={{ display: "flex", gap: 16, marginBottom: 8, zIndex: 2, background: "#ffffff08", border: `1px solid ${T.accent}33`, borderRadius: 10, padding: "6px 18px", fontSize: 12 }}>
          <span style={{ color: T.targetColor }}>🎯 PERCEPTION: <b>Shaking = Real target</b></span>
          <span style={{ color: "#999" }}>|</span>
          <span style={{ color: "#aaa" }}>{T.ghost} Smooth drifting = Ghost decoy (miss!)</span>
        </div>
      )}

      {/* HUD */}
      <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap", justifyContent: "center", zIndex: 2 }}>
        {[
          ["Trial", `${totalDone} / ${totalTrials}`],
          ["Condition", `${Math.min(condIdx + 1, TOTAL_CONDITIONS)} / ${TOTAL_CONDITIONS}`],
          ["Avg MT", `${avgMT} ms`],
          ["Last MT", `${lastMT} ms`],
          ["D (target)", `${cond.D} px`],
          ["Actual D", `${actualDist} px`],
          ["Misses", missCount],
        ].map(([label, val]) => (
          <div key={label} style={{ background: "#ffffff08", border: `1px solid ${T.accent}44`, borderRadius: 8, padding: "4px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: T.accent, letterSpacing: 1 }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: "bold" }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Condition pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, zIndex: 2 }}>
        {CONDITIONS.map((c, i) => {
          const done = rows.filter(r => r.condition_id === c.id).length;
          return (
            <div key={i} style={{ padding: "3px 12px", borderRadius: 20, border: `1.5px solid ${i === condIdx && phase === "running" ? T.accent : "#444"}`, background: i === condIdx && phase === "running" ? T.accent + "22" : "#ffffff08", fontSize: 11, color: i === condIdx && phase === "running" ? T.accent : "#888", letterSpacing: 1 }}>
              D={c.D} W={c.W} ID={c.ID} ({done}/{TRIALS_PER_CONDITION})
            </div>
          );
        })}
      </div>

      {/* ARENA */}
      <div
        onClick={handleArenaMiss}
        style={{ width: ARENA.w, height: ARENA.h, position: "relative", borderRadius: 16, border: `2px solid ${T.accent}66`, boxShadow: `0 0 40px ${T.accent}22, inset 0 0 60px #00000066`, background: "linear-gradient(135deg,#050510 0%,#0a0a1a 100%)", overflow: "hidden", cursor: phase === "running" ? "crosshair" : "default", zIndex: 2, flexShrink: 0 }}
      >
        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 1 }} />

        {/* Distance guide line */}
        {phase === "running" && !animating && (
          <svg style={{ position: "absolute", inset: 0, zIndex: 3, width: "100%", height: "100%", pointerEvents: "none" }}>
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill={T.accent} opacity="0.5" />
              </marker>
            </defs>
            <line x1={playerPos.x + 30} y1={playerPos.y + 30} x2={targetPos.x + W / 2} y2={targetPos.y + W / 2}
              stroke={T.accent} strokeWidth="1.5" strokeDasharray="6,4" strokeOpacity="0.4" markerEnd="url(#arrow)" />
            <text x={(playerPos.x + 30 + targetPos.x + W/2) / 2 + 6} y={(playerPos.y + 30 + targetPos.y + W/2) / 2 - 6} fill={T.accent} fontSize="11" opacity="0.7">D={cond.D}px</text>
          </svg>
        )}

        <Trail points={trail} color={T.playerColor} />

        {/* ── GHOST DECOYS (smooth drifting, no shake) ── */}
        {phase === "running" && ghosts.map(g => (
          <div key={g.id} onClick={handleGhostClick} style={{
            position: "absolute", left: g.x, top: g.y,
            width: W, height: W, borderRadius: 8,
            border: `2px dashed #ffffff33`,
            background: "#ffffff08",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: W * 0.45, cursor: "pointer", zIndex: 9,
            opacity: 0.55,
          }}>
            {T.ghost}
            <div style={{ position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)", fontSize: 9, color: "#666", whiteSpace: "nowrap" }}>decoy</div>
          </div>
        ))}

        {/* ── REAL TARGET (shaking animation) ── */}
        {phase === "running" && (
          <div onClick={handleTargetClick} style={{
            position: "absolute", left: targetPos.x, top: targetPos.y,
            width: W, height: W, borderRadius: 8,
            border: `2px solid ${T.targetColor}`,
            boxShadow: T.targetGlow,
            background: T.targetColor + "22",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: W * 0.5, cursor: "pointer", zIndex: 10,
            // Shake = perception cue
            animation: `targetShake 0.18s infinite`,
          }}>
            {T.target}
            <div style={{ position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)", fontSize: 10, color: T.accent, whiteSpace: "nowrap", opacity: 0.8 }}>W={W}px</div>
          </div>
        )}

        {/* Player */}
        <div style={{ position: "absolute", left: playerPos.x, top: playerPos.y, width: 60, height: 60, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, filter: `drop-shadow(0 0 8px ${T.playerColor})`, zIndex: 8, pointerEvents: "none" }}>
          {T.player}
          <div style={{ position: "absolute", bottom: -18, left: "50%", transform: "translateX(-50%)", fontSize: 9, color: T.playerColor, whiteSpace: "nowrap", opacity: 0.8 }}>PLAYER</div>
        </div>

        {explosions.map(b => <Explosion key={b.id} pos={b.pos} color={b.color} id={b.id} />)}

        {feedback && (
          <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", background: "#000000aa", border: `1px solid ${T.accent}66`, borderRadius: 20, padding: "4px 20px", fontSize: 14, color: T.accent, zIndex: 20, pointerEvents: "none", animation: "fadeup 0.4s ease" }}>{feedback}</div>
        )}

        {/* IDLE overlay */}
        {phase === "idle" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#00000088", zIndex: 15, borderRadius: 14 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{T.player}</div>
            <div style={{ fontSize: 22, color: T.accent, letterSpacing: 3, marginBottom: 8 }}>READY</div>
            <div style={{ fontSize: 13, color: "#ccc", marginBottom: 4, textAlign: "center", maxWidth: 380 }}>
              <b style={{ color: T.targetColor }}>Perception task:</b> The real target <b>shakes</b>. Ghost decoys drift smoothly. Find &amp; click the shaker!
            </div>
            <div style={{ fontSize: 12, color: "#aaa", marginBottom: 24 }}>
              {TOTAL_CONDITIONS} conditions × {TRIALS_PER_CONDITION} trials = {totalTrials} clicks
            </div>
            <button onClick={handleStart} style={{ padding: "10px 40px", borderRadius: 30, border: `2px solid ${T.accent}`, background: T.accent + "22", color: T.accent, fontSize: 16, cursor: "pointer", letterSpacing: 2, boxShadow: T.glow }}>▶ START</button>
          </div>
        )}

        {/* DONE overlay */}
        {phase === "done" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#00000099", zIndex: 15, borderRadius: 14 }}>
            <div style={{ fontSize: 48 }}>🏆</div>
            <div style={{ fontSize: 22, color: T.accent, letterSpacing: 3, margin: "8px 0" }}>COMPLETE!</div>
            <div style={{ fontSize: 13, color: "#ccc", marginBottom: 2 }}>MT = <b style={{ color: T.accent }}>{a ?? "--"}</b> + <b style={{ color: T.accent2 }}>{b ?? "--"}</b> × ID (ms)</div>
            <div style={{ fontSize: 13, color: "#ccc", marginBottom: 16 }}>Throughput = {tp ?? "--"} bps</div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={handleStart} style={{ padding: "10px 28px", borderRadius: 24, border: `2px solid ${T.accent}`, background: T.accent + "33", color: T.accent, cursor: "pointer", fontSize: 14, fontWeight: "bold", boxShadow: T.glow }}>▶ Play Again</button>
              <button onClick={downloadCSV} style={{ padding: "8px 20px", borderRadius: 20, border: `2px solid ${T.accent2}`, background: T.accent2 + "22", color: T.accent2, cursor: "pointer", fontSize: 13 }}>⬇ CSV</button>
              <button onClick={handleReset} style={{ padding: "8px 20px", borderRadius: 20, border: `2px solid #666`, background: "#ffffff08", color: "#aaa", cursor: "pointer", fontSize: 13 }}>↺ Reset</button>
            </div>
          </div>
        )}
      </div>

      {/* Stats panel */}
      <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap", justifyContent: "center", zIndex: 2 }}>
        <div style={{ background: "#ffffff06", border: `1px solid ${T.accent}33`, borderRadius: 12, padding: "12px 20px", minWidth: 220 }}>
          <div style={{ fontSize: 11, color: T.accent, letterSpacing: 2, marginBottom: 6 }}>FITTS' MODEL</div>
          <div style={{ fontSize: 13 }}>MT = <b style={{ color: T.accent }}>{a ?? "?"}</b> + <b style={{ color: T.accent2 }}>{b ?? "?"}</b> × ID (ms)</div>
          <div style={{ fontSize: 12, color: "#aaa" }}>Throughput = {tp ?? "--"} bps</div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>a = motor initiation (ms intercept)<br />b = ms per bit (movement speed)</div>
        </div>
        <div style={{ background: "#ffffff06", border: `1px solid ${T.accent}33`, borderRadius: 12, padding: "12px 20px", minWidth: 280 }}>
          <div style={{ fontSize: 11, color: T.accent, letterSpacing: 2, marginBottom: 6 }}>CONDITION STATS</div>
          {CONDITIONS.map((c, i) => {
            const crows = rows.filter(r => r.condition_id === c.id);
            const mt = crows.length ? (crows.reduce((s, r) => s + r.MT_ms, 0) / crows.length).toFixed(0) : "--";
            const active = i === condIdx && phase === "running";
            return (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: active ? T.accent : "#bbb", borderLeft: active ? `2px solid ${T.accent}` : "2px solid transparent", paddingLeft: 6 }}>
                <span>D={c.D} W={c.W} ID={c.ID}</span>
                <span>{mt} ms &nbsp; ({crows.length}/{TRIALS_PER_CONDITION})</span>
              </div>
            );
          })}
        </div>
        <div style={{ background: "#ffffff06", border: `1px solid ${T.accent}33`, borderRadius: 12, padding: "12px 20px", display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
          <button onClick={downloadCSV} disabled={!rows.length} style={{ padding: "8px 20px", borderRadius: 20, border: `2px solid ${rows.length ? T.accent2 : "#444"}`, background: rows.length ? T.accent2 + "22" : "transparent", color: rows.length ? T.accent2 : "#555", cursor: rows.length ? "pointer" : "default", fontSize: 13 }}>⬇ Download CSV ({rows.length} rows)</button>
          <button onClick={handleReset} style={{ padding: "8px 20px", borderRadius: 20, border: `2px solid ${T.accent}55`, background: "#ffffff08", color: "#aaa", cursor: "pointer", fontSize: 13 }}>↺ Reset</button>
        </div>
      </div>

      {rows.length > 0 && (
        <div style={{ marginTop: 12, zIndex: 2, maxWidth: ARENA.w, background: "#ffffff05", border: `1px solid ${T.accent}22`, borderRadius: 10, padding: "10px 16px", fontSize: 11, fontFamily: "monospace", width: "100%" }}>
          <div style={{ color: T.accent, letterSpacing: 2, marginBottom: 4, fontSize: 10 }}>RECENT TRIALS</div>
          {rows.slice(-4).map((r, i) => (
            <div key={i} style={{ color: "#ccc", paddingBottom: 2 }}>
              #{r.trial_index} | Cond {r.condition_id} ({r.condition_label}) | D={r.D_px} W={r.W_px} ID={r.ID_bits} | MT={r.MT_ms} ms | hit={r.hit} miss={r.miss}
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes targetShake {
          0%   { transform: translate(0, 0) rotate(0deg); }
          15%  { transform: translate(-${shakeAmp}px, ${shakeAmp}px) rotate(-1deg); }
          30%  { transform: translate(${shakeAmp}px, -${shakeAmp}px) rotate(1deg); }
          45%  { transform: translate(-${shakeAmp}px, 0px) rotate(0deg); }
          60%  { transform: translate(${shakeAmp}px, ${shakeAmp}px) rotate(-1deg); }
          75%  { transform: translate(0, -${shakeAmp}px) rotate(1deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
        @keyframes fadeup {
          0%   { opacity:0; transform:translateX(-50%) translateY(10px); }
          100% { opacity:1; transform:translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
