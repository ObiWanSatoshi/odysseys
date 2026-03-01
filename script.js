const canvas = document.getElementById("ascii-canvas");
const ctx = canvas.getContext("2d", { alpha: true });
const titleEl = document.getElementById("scene-title");
const p1El = document.getElementById("scene-p1");
const p2El = document.getElementById("scene-p2");
const sceneMenu = document.getElementById("scene-menu");
const sceneDots = Array.from(document.querySelectorAll("#scene-menu .dot"));
const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const logo = new Image();
logo.src = "./assets/delphi-mark-white.svg";

const offscreen = document.createElement("canvas");
const offCtx = offscreen.getContext("2d", { willReadFrequently: true });

const BASE_CHARS = " .`^,:;i!l+_-?1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
const FLOW_CHARS = BASE_CHARS.split("").filter((ch) => ch !== " ");
const DRIP_CHARS = FLOW_CHARS;
const DUST_CHARS = FLOW_CHARS;

const state = {
  dpr: 1,
  width: 0,
  height: 0,
  cols: 0,
  rows: 0,
  cell: 8,
  logoReady: false,
  alphaMap: null,
  edgePoints: [],
  drips: [],
  dust: [],
  burst: [],
  logoRect: { x: 0, y: 0, size: 0 },
  raf: 0,
  lastTs: 0,
  lastFrame: 0,
  fpsInterval: 1000 / 24,
  sceneCurrent: 0,
  sceneTarget: 0,
  wheelAccum: 0,
  touchStartY: null,
  sceneLockUntil: 0,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function rangeProgress(value, start, end) {
  if (start === end) {
    return value >= end ? 1 : 0;
  }
  return smoothstep((value - start) / (end - start));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function resize() {
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.floor(state.width * state.dpr);
  canvas.height = Math.floor(state.height * state.dpr);
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

  state.cell = state.width < 780 ? 7 : 8;
  state.cols = Math.max(1, Math.floor(state.width / state.cell));
  state.rows = Math.max(1, Math.floor(state.height / state.cell));

  ctx.font = `${state.cell + 1}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  ctx.textBaseline = "top";

  rebuildMask();
}

function rebuildMask() {
  if (!state.logoReady) {
    return;
  }

  const size = Math.min(state.width, state.height) * 0.42;
  const x = (state.width - size) * 0.5;
  const y = (state.height - size) * 0.5;
  state.logoRect = { x, y, size };

  const sampleW = state.cols;
  const sampleH = state.rows;
  offscreen.width = sampleW;
  offscreen.height = sampleH;

  offCtx.clearRect(0, 0, sampleW, sampleH);
  offCtx.drawImage(
    logo,
    x / state.cell,
    y / state.cell,
    size / state.cell,
    size / state.cell
  );

  const data = offCtx.getImageData(0, 0, sampleW, sampleH).data;
  state.alphaMap = new Float32Array(sampleW * sampleH);

  for (let i = 0; i < sampleW * sampleH; i += 1) {
    state.alphaMap[i] = data[i * 4 + 3] / 255;
  }

  const centerY = (y + size * 0.5) / state.cell;
  const edges = [];

  for (let sx = 1; sx < sampleW - 1; sx += 1) {
    let last = -1;
    for (let sy = sampleH - 2; sy >= 1; sy -= 1) {
      const idx = sy * sampleW + sx;
      if (state.alphaMap[idx] > 0.1) {
        last = sy;
        break;
      }
    }

    if (last < 0 || last < centerY) {
      continue;
    }

    const below = state.alphaMap[(last + 1) * sampleW + sx];
    if (below > 0.03) {
      continue;
    }

    if (sx % 2 === 0) {
      edges.push({ x: sx * state.cell, y: last * state.cell });
    }
  }

  state.edgePoints = edges;
  state.drips = [];
  state.dust = [];
}

function emitLogoBurst() {
  if (!state.alphaMap || state.cols <= 0 || state.rows <= 0) {
    return;
  }

  const centerX = state.logoRect.x + state.logoRect.size * 0.5;
  const centerY = state.logoRect.y + state.logoRect.size * 0.5;
  const attempts = 1200;
  let made = 0;

  for (let i = 0; i < attempts && made < 260; i += 1) {
    const sx = (Math.random() * state.cols) | 0;
    const sy = (Math.random() * state.rows) | 0;
    const alpha = state.alphaMap[sy * state.cols + sx];
    if (alpha < 0.12) {
      continue;
    }

    const x = sx * state.cell + rand(-1.2, 1.2);
    const y = sy * state.cell + rand(-1.2, 1.2);
    const dx = x - centerX;
    const dy = y - centerY;
    const d = Math.hypot(dx, dy) || 1;
    const speed = rand(42, 146);
    const spread = rand(-0.35, 0.35);

    state.burst.push({
      x,
      y,
      vx: (dx / d) * speed + spread * speed,
      vy: (dy / d) * speed - rand(5, 24),
      life: rand(0.46, 1.05),
      age: 0,
      char: FLOW_CHARS[(Math.random() * FLOW_CHARS.length) | 0],
    });
    made += 1;
  }

  if (state.burst.length > 480) {
    state.burst.splice(0, state.burst.length - 480);
  }
}

function drawBase(ts, alphaMul) {
  if (!state.alphaMap || alphaMul <= 0.001) {
    return;
  }

  const t = ts * 0.001;
  const sampleW = state.cols;
  const sampleH = state.rows;

  for (let sy = 0; sy < sampleH; sy += 1) {
    for (let sx = 0; sx < sampleW; sx += 1) {
      const alpha = state.alphaMap[sy * sampleW + sx];
      if (alpha < 0.05) {
        continue;
      }

      const flicker = reduceMotionQuery.matches
        ? 0
        : (Math.sin(t * 6.3 + sx * 0.2 + sy * 0.16) + 1) * 0.42;
      const energy = clamp(alpha * 0.72 + flicker * 0.42, 0, 1);
      const charIndex = Math.min(BASE_CHARS.length - 1, Math.floor(energy * BASE_CHARS.length));
      const char = BASE_CHARS[charIndex];
      const drawAlpha = clamp(alpha * (0.65 + flicker * 0.35), 0.14, 1) * alphaMul;

      ctx.fillStyle = `rgba(247, 250, 255, ${drawAlpha})`;
      ctx.fillText(char, sx * state.cell, sy * state.cell);
    }
  }
}

function spawnDrip() {
  if (state.edgePoints.length === 0 || state.drips.length > 26) {
    return;
  }

  const src = state.edgePoints[(Math.random() * state.edgePoints.length) | 0];
  state.drips.push({
    x: src.x + rand(-1.4, 1.4),
    y: src.y + rand(0.2, 1.2),
    vx: rand(-5, 5),
    vy: rand(12, 26),
    life: rand(0.9, 1.5),
    age: 0,
  });
}

function spawnDust(x, y, strength = 1) {
  if (state.dust.length > 280) {
    return;
  }

  const count = 1 + ((Math.random() * 2) | 0);
  for (let i = 0; i < count; i += 1) {
    state.dust.push({
      x,
      y,
      vx: rand(-20, 20) * strength,
      vy: rand(8, 34) * strength,
      life: rand(0.32, 0.75),
      age: 0,
      char: DUST_CHARS[(Math.random() * DUST_CHARS.length) | 0],
    });
  }
}

function updateDrips(dt, alphaMul) {
  if (alphaMul > 0.25 && !reduceMotionQuery.matches && Math.random() < 0.18) {
    spawnDrip();
  }

  for (let i = state.drips.length - 1; i >= 0; i -= 1) {
    const d = state.drips[i];
    d.age += dt;

    if (d.age >= d.life) {
      if (alphaMul > 0.08) {
        spawnDust(d.x, d.y, 1.2);
      }
      state.drips.splice(i, 1);
      continue;
    }

    d.vy += 78 * dt;
    d.vx *= 0.994;
    d.x += d.vx * dt;
    d.y += d.vy * dt;

    if (alphaMul > 0.18 && !reduceMotionQuery.matches && Math.random() < 0.22) {
      spawnDust(d.x, d.y, 0.55);
    }

    const lifeT = d.age / d.life;
    const charIndex = Math.min(DRIP_CHARS.length - 1, Math.floor(lifeT * DRIP_CHARS.length));
    const char = DRIP_CHARS[charIndex];
    const alpha = (1 - lifeT) * 0.92 * alphaMul;

    ctx.fillStyle = `rgba(246, 250, 255, ${alpha})`;
    ctx.fillText(char, d.x, d.y);

    const tailAlpha = alpha * 0.45;
    ctx.fillStyle = `rgba(246, 250, 255, ${tailAlpha})`;
    ctx.fillText(".", d.x, d.y - state.cell * 0.75);
  }
}

function updateDust(dt, alphaMul) {
  for (let i = state.dust.length - 1; i >= 0; i -= 1) {
    const p = state.dust[i];
    p.age += dt;

    if (p.age >= p.life) {
      state.dust.splice(i, 1);
      continue;
    }

    p.vy += 38 * dt;
    p.vx *= 0.985;
    p.vy *= 0.985;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const t = p.age / p.life;
    const alpha = (1 - t) * 0.85 * alphaMul;
    ctx.fillStyle = `rgba(240, 245, 255, ${alpha})`;
    ctx.fillText(p.char, p.x, p.y);
  }
}

function updateBurst(dt) {
  for (let i = state.burst.length - 1; i >= 0; i -= 1) {
    const p = state.burst[i];
    p.age += dt;
    if (p.age >= p.life) {
      state.burst.splice(i, 1);
      continue;
    }

    p.vy += 56 * dt;
    p.vx *= 0.987;
    p.vy *= 0.987;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const t = p.age / p.life;
    const alpha = (1 - t) * 0.98;
    ctx.fillStyle = `rgba(250, 253, 255, ${alpha})`;
    ctx.fillText(p.char, p.x, p.y);
  }
}

function setTextVisual(el, alpha, fill = null) {
  const a = clamp(alpha, 0, 1);
  el.style.opacity = `${a}`;
  el.style.transform = `translate(-50%, -50%) translateY(${(1 - a) * 12}px)`;
  if (typeof fill === "number") {
    el.style.setProperty("--fill", `${clamp(fill, 0, 1) * 100}%`);
  }
}

function updateMenu() {
  const show = state.sceneCurrent >= 0.72;
  sceneMenu.classList.toggle("is-visible", show);

  const activeScene = clamp(Math.round(state.sceneCurrent), 1, 3);
  sceneDots.forEach((dot, index) => {
    const sceneNumber = index + 1;
    dot.classList.toggle("is-active", sceneNumber === activeScene);
  });
}

function updateScenes() {
  if (reduceMotionQuery.matches) {
    state.sceneCurrent = state.sceneTarget;
  } else {
    state.sceneCurrent += (state.sceneTarget - state.sceneCurrent) * 0.14;
  }

  const s = state.sceneCurrent;

  const logoAlpha = 1 - rangeProgress(s, 0.12, 0.95);

  const titleIn = rangeProgress(s, 0.08, 0.75);
  const titleOut = 1 - rangeProgress(s, 1.18, 1.95);
  const titleAlpha = titleIn * clamp(titleOut, 0, 1);

  const p1In = rangeProgress(s, 1.12, 1.86);
  const p1Out = 1 - rangeProgress(s, 2.15, 2.92);
  const p1Alpha = p1In * clamp(p1Out, 0, 1);
  const p1Fill = rangeProgress(s, 1.2, 2.0);

  const p2Alpha = rangeProgress(s, 2.12, 2.94);
  const p2Fill = rangeProgress(s, 2.18, 3.0);

  setTextVisual(titleEl, titleAlpha);
  setTextVisual(p1El, p1Alpha, p1Fill);
  setTextVisual(p2El, p2Alpha, p2Fill);
  updateMenu();

  return logoAlpha;
}

function render(ts) {
  const dt = state.lastTs ? (ts - state.lastTs) / 1000 : 1 / 24;
  state.lastTs = ts;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, state.width, state.height);

  const logoAlpha = updateScenes();
  drawBase(ts, logoAlpha);
  updateDrips(dt, logoAlpha);
  updateDust(dt, logoAlpha);
  updateBurst(dt);
}

function animate(ts) {
  if (!state.lastFrame) {
    state.lastFrame = ts;
  }

  const elapsed = ts - state.lastFrame;
  if (elapsed >= state.fpsInterval) {
    state.lastFrame = ts - (elapsed % state.fpsInterval);
    render(ts);
  }

  state.raf = window.requestAnimationFrame(animate);
}

function stepScene(direction) {
  const now = performance.now();
  if (now < state.sceneLockUntil) {
    return;
  }

  const next = clamp(state.sceneTarget + direction, 0, 3);
  if (next !== state.sceneTarget) {
    if (state.sceneTarget === 0 && next === 1) {
      emitLogoBurst();
    }
    state.sceneTarget = next;
    state.sceneLockUntil = now + 300;
  }
}

function onWheel(event) {
  event.preventDefault();
  state.wheelAccum += event.deltaY;

  if (Math.abs(state.wheelAccum) < 110) {
    return;
  }

  stepScene(state.wheelAccum > 0 ? 1 : -1);
  state.wheelAccum = 0;
}

function onKeydown(event) {
  if (event.key === "ArrowDown" || event.key === "PageDown" || event.key === " ") {
    event.preventDefault();
    stepScene(1);
  } else if (event.key === "ArrowUp" || event.key === "PageUp") {
    event.preventDefault();
    stepScene(-1);
  }
}

function onTouchStart(event) {
  if (event.touches && event.touches[0]) {
    state.touchStartY = event.touches[0].clientY;
  }
}

function onTouchMove(event) {
  if (!event.touches || !event.touches[0] || state.touchStartY == null) {
    return;
  }
  event.preventDefault();
  const delta = state.touchStartY - event.touches[0].clientY;
  if (Math.abs(delta) > 42) {
    stepScene(delta > 0 ? 1 : -1);
    state.touchStartY = event.touches[0].clientY;
  }
}

function onTouchEnd() {
  state.touchStartY = null;
}

function start() {
  resize();
  window.cancelAnimationFrame(state.raf);
  state.lastFrame = 0;
  state.lastTs = 0;
  state.sceneCurrent = state.sceneTarget;
  state.raf = window.requestAnimationFrame(animate);
}

logo.onload = () => {
  state.logoReady = true;
  start();
};

logo.onerror = () => {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
};

window.addEventListener("resize", start);
window.addEventListener("wheel", onWheel, { passive: false });
window.addEventListener("keydown", onKeydown, { passive: false });
window.addEventListener("touchstart", onTouchStart, { passive: false });
window.addEventListener("touchmove", onTouchMove, { passive: false });
window.addEventListener("touchend", onTouchEnd, { passive: false });
reduceMotionQuery.addEventListener("change", start);
