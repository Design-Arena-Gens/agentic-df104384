"use client";

import { useEffect, useRef, useState } from "react";

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function Home() {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const [isRacing, setIsRacing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [progress, setProgress] = useState(0);
  const [winner, setWinner] = useState(null);
  const [raceStartTime, setRaceStartTime] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const stateRef = useRef({
    cars: [],
    track: { lanes: 4, finishX: 0 },
    pixelsPerSecond: 220,
    startedAt: 0,
    endedAt: 0
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Update finish line on resize
      stateRef.current.track.finishX = rect.width - 80;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // Setup initial cars
    resetRace();
    // Cleanup on unmount
    return () => stopAnimation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetRace() {
    stopAnimation();
    setIsRacing(false);
    setWinner(null);
    setProgress(0);
    setElapsedMs(0);
    setDownloadUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return "";
    });
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const lanes = 4;
    const padding = 40;
    const laneHeight = (rect.height - padding * 2) / lanes;
    stateRef.current.track.lanes = lanes;
    stateRef.current.track.finishX = rect.width - 80;
    stateRef.current.startedAt = 0;
    stateRef.current.endedAt = 0;
    stateRef.current.cars = new Array(lanes).fill(null).map((_, i) => ({
      id: i + 1,
      color: ["#ef4444", "#10b981", "#3b82f6", "#f59e0b"][i % 4],
      shadow: ["#7f1d1d", "#064e3b", "#1e3a8a", "#7c2d12"][i % 4],
      y: padding + i * laneHeight + laneHeight * 0.5,
      x: 40,
      speed: 140 + Math.random() * 120, // px/s baseline
      swayPhase: Math.random() * Math.PI * 2,
      engineBoost: 0.9 + Math.random() * 0.3
    }));
    drawFrame(0);
  }

  function startRace() {
    if (isRacing) return;
    setIsRacing(true);
    setWinner(null);
    const now = performance.now();
    setRaceStartTime(now);
    stateRef.current.startedAt = now;
    loop(now);
  }

  function stopRace() {
    setIsRacing(false);
    stopAnimation();
  }

  function stopAnimation() {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }

  function drawTrack(ctx, width, height) {
    // Background gradient
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, "#0f172a");
    g.addColorStop(1, "#0b1020");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    // Asphalt
    const asphalt = ctx.createLinearGradient(0, 0, 0, height);
    asphalt.addColorStop(0, "#121826");
    asphalt.addColorStop(1, "#0b1020");
    ctx.fillStyle = asphalt;
    ctx.fillRect(0, 30, width, height - 60);

    // Lane dividers
    const lanes = stateRef.current.track.lanes;
    const laneH = (height - 60) / lanes;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    for (let i = 1; i < lanes; i++) {
      const y = 30 + i * laneH;
      dashLine(ctx, 20, y, width - 20, y, 18, 10);
    }

    // Finish line pattern
    const finishX = stateRef.current.track.finishX;
    const top = 30;
    const bottom = height - 30;
    drawCheckeredStrip(ctx, finishX, top, bottom, 10);
  }

  function dashLine(ctx, x1, y1, x2, y2, dash = 10, gap = 6) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const steps = Math.floor(len / (dash + gap));
    const vx = (dx / len) * (dash + gap);
    const vy = (dy / len) * (dash + gap);
    ctx.beginPath();
    for (let i = 0; i < steps; i++) {
      const sx = x1 + i * vx;
      const sy = y1 + i * vy;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (dx / len) * dash, sy + (dy / len) * dash);
    }
    ctx.stroke();
  }

  function drawCheckeredStrip(ctx, x, top, bottom, size) {
    const height = bottom - top;
    for (let y = 0; y < height; y += size) {
      const idx = Math.floor(y / size);
      ctx.fillStyle = idx % 2 === 0 ? "#e5e7eb" : "#111827";
      ctx.fillRect(x - size, top + y, size, size);
      ctx.fillRect(x, top + y, size, size);
    }
    // Pole lines
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(x - 2, top, 4, height);
  }

  function drawCar(ctx, car) {
    const width = 54;
    const height = 26;
    ctx.save();
    // shadow
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = car.shadow;
    ctx.beginPath();
    ctx.ellipse(car.x + 10, car.y + 10, width * 0.6, height * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // body
    const grd = ctx.createLinearGradient(car.x, car.y - height / 2, car.x, car.y + height / 2);
    grd.addColorStop(0, car.color);
    grd.addColorStop(1, "#111827");
    ctx.fillStyle = grd;
    roundRect(ctx, car.x - width / 2, car.y - height / 2, width, height, 8);
    ctx.fill();

    // cockpit
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    roundRect(ctx, car.x - width * 0.15, car.y - height * 0.35, width * 0.35, height * 0.7, 6);
    ctx.fill();

    // lights
    ctx.fillStyle = "rgba(255,255,200,0.8)";
    ctx.fillRect(car.x + width / 2 - 4, car.y - 6, 4, 4);
    ctx.fillRect(car.x + width / 2 - 4, car.y + 2, 4, 4);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawHud(ctx, width, height) {
    // Header text
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "700 16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "right";
    ctx.fillText(`?????: ${formatTime(elapsedMs)}`, width - 16, 24);

    // Winner banner
    if (winner) {
      const banner = `??????: ??????? ${winner.id}`;
      ctx.font = "800 28px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillText(banner, width / 2, 40);
    }
  }

  function drawFrame(dt) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    drawTrack(ctx, width, height);
    stateRef.current.cars.forEach((c) => drawCar(ctx, c));
    drawHud(ctx, width, height);
  }

  function loop(now) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!animationRef.current) {
      animationRef.current = requestAnimationFrame(loop);
      return;
    }
    const last = stateRef.current._last || now;
    const dt = Math.min(64, now - last);
    stateRef.current._last = now;

    // Update cars
    const finishX = stateRef.current.track.finishX;
    let anyFinished = false;
    let leadingX = 0;
    stateRef.current.cars = stateRef.current.cars.map((car) => {
      const sway = Math.sin((now / 500 + car.swayPhase) * 2) * 0.5;
      const jitter = (Math.random() - 0.5) * 0.6;
      const boostPulse = 0.9 + Math.sin(now / 1100 + car.id) * 0.08;
      const px = ((car.speed * car.engineBoost * boostPulse) + 8 * sway + jitter) * (dt / 1000);
      const nx = Math.min(car.x + px, finishX - 20);
      if (nx >= finishX - 20) anyFinished = true;
      leadingX = Math.max(leadingX, nx);
      return { ...car, x: nx };
    });

    // Compute progress against finish line
    const startX = 40;
    const total = Math.max(20, finishX - 20 - startX);
    const pct = Math.min(100, ((leadingX - startX) / total) * 100);
    setProgress(pct);
    setElapsedMs(stateRef.current.startedAt ? now - stateRef.current.startedAt : 0);

    drawFrame(dt);

    if (anyFinished && !winner) {
      const first = [...stateRef.current.cars].sort((a, b) => b.x - a.x)[0];
      setWinner(first);
      stateRef.current.endedAt = now;
      setIsRacing(false);
      stopAnimation();
    } else if (isRacing) {
      animationRef.current = requestAnimationFrame(loop);
    }
  }

  function startRecording() {
    if (isRecording) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stream = canvas.captureStream(60);
    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9"
    });
    recordedChunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  }

  function stopRecording() {
    if (!isRecording || !mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop();
    setIsRecording(false);
  }

  function downloadVideo() {
    if (!downloadUrl) return;
    const a = document.createElement("a");
    a.href = downloadUrl;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `car-race-${ts}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="container">
      <div className="card">
        <div className="header">
          <div>
            <h1 className="title">???? ?????? ? ??? ????? ?????</h1>
            <p className="subtitle">???? ??????? ???? ???????? ?????? ????? WebM.</p>
          </div>
          <div className="controls">
            <button className="btn primary" onClick={startRace} disabled={isRacing}>
              ???? ??????
            </button>
            <button className="btn secondary" onClick={stopRace} disabled={!isRacing}>
              ?????
            </button>
            <button className="btn ghost" onClick={resetRace}>
              ????? ?????
            </button>
            <button className="btn success" onClick={startRecording} disabled={isRecording}>
              ????? ???????
            </button>
            <button className="btn warning" onClick={stopRecording} disabled={!isRecording}>
              ????? ???????
            </button>
            <button className="btn danger" onClick={downloadVideo} disabled={!downloadUrl}>
              ????? ???????
            </button>
          </div>
        </div>

        <div className="canvasWrap">
          <canvas ref={canvasRef} />
        </div>

        <div className="footer">
          <div className="meta">
            {winner ? `??????: ??????? ${winner.id}` : isRacing ? "?????? ????..." : "???? ????????"}
            {" ? "}
            ??? ??????: {formatTime(elapsedMs)}
          </div>
          <div style={{ minWidth: 220 }}>
            <div className="badge">
              ???????
              <span style={{ width: 8, height: 8, background: "var(--accent)", borderRadius: 999 }} />
            </div>
            <div className="progress" style={{ marginTop: 8 }}>
              <span style={{ ["--value"]: `${progress}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

