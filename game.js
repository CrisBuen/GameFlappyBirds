(() => {
    'use strict';

    // ---------- Canvas setup (adaptive + HiDPI) ----------
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');

    // Calculate logical game dimensions from actual screen size
    const _dpr = Math.min(window.devicePixelRatio || 1, 2);
    const _wrapper = document.getElementById('game-wrapper');
    const _cssW = _wrapper.clientWidth  || window.innerWidth;
    const _cssH = _wrapper.clientHeight || window.innerHeight;

    // Game width stays 480; height adapts to screen aspect ratio
    const GAME_W = 480;
    const GAME_H = Math.round(GAME_W * (_cssH / _cssW));

    // Set canvas buffer to native device resolution for sharpness
    canvas.width  = GAME_W * _dpr;
    canvas.height = GAME_H * _dpr;
    ctx.scale(_dpr, _dpr);
    ctx.imageSmoothingEnabled = false;

    const W = GAME_W;
    const H = GAME_H;

    // ---------- Constants ----------
    const GROUND_HEIGHT = 112;
    const GROUND_Y = H - GROUND_HEIGHT;

    const GRAVITY = 1500;
    const FLAP_VELOCITY = -480;
    const MAX_FALL_SPEED = 700;
    const PIPE_SPEED = 160;
    // Scale gap & margins to screen height so gameplay feels the same on any device
    const _hRatio = H / 720;
    const PIPE_GAP = Math.round(165 * _hRatio);
    const PIPE_WIDTH = 72;
    const BOSS_RAY_PIPE_WIDTH = 112;
    const PIPE_INTERVAL = 1.45;
    const _pipeMargin = Math.round(80 * _hRatio);
    const PIPE_MIN_TOP = _pipeMargin;
    const PIPE_MAX_TOP = GROUND_Y - PIPE_GAP - _pipeMargin;

    const BIRD_X = 130;
    const BIRD_HITBOX_R = 13;

    // ---------- Boss / endgame thresholds ----------
    const PIPE_ANIMATION_SCORE = 120; // de 120 a 150: tubos animados facil/intermedio
    const BOSS_MUSIC_SCORE = 150;     // la musica del jefe entra junto con el jefe
    const BOSS_FIGHT_SCORE = 150;     // a partir de 150 puntos: comienza la pelea
    const BOSS_FIGHT_DURATION = 90;   // 1:30 minuto
    const BOSS_RAY_PHASE_AT = 60;     // minuto 1: empieza la fase de rayos
    const BOSS_PIPE_FADE_BEFORE_RAYS = 3;
    const BOSS_RAY_SCALE = 2.25;
    const DAY_CYCLE_STAGE_DURATION = 15;
    const DAY_CYCLE_DURATION = DAY_CYCLE_STAGE_DURATION * 4;
    const DAY_CYCLE_TRANSITION = 1.4;

    // ---------- State ----------
    const STATE = { READY: 0, PLAYING: 1, DEAD: 2, GAMEOVER: 3, BOSS: 4, WIN: 5 };
    let state = STATE.READY;

    // Boss state
    let bossActive = false;
    let bossTime = 0;          // segundos transcurridos en la pelea
    let bossPhase = 0;         // 0 = aún no, 1 = pipes dinámicos, 2 = rayos
    let bossMusicSwitched = false;
    let bossEntranceTimer = 0; // animación de entrada (0..1)
    let pipesFadingOut = false;
    let bossPipeFadeStarted = false;
    let rays = [];             // {sx, sy, ex, ey, telegraphTime, fireTime, age, phase}
    let raySpawnTimer = 0;
    let screenShake = 0;
    let winTimer = 0;
    let confetti = [];

    const boss = {
        x: W * 0.78,
        y: H * 0.32,
        baseY: H * 0.32,
        baseX: W * 0.78,
        bobPhase: 0,
        movePhase: 0,       // horizontal movement phase
        wing: 0,
        wingTimer: 0,
        chargeAmount: 0,    // 0..1 cuando carga un rayo
        eyeGlow: 0,
        scale: 1.0,         // grows before ray phase
        targetScale: 1.0
    };

    let bestScore = parseInt(localStorage.getItem('flappy_best') || '0', 10) || 0;
    let score = 0;
    let pipes = [];
    let spawnTimer = 0;
    let groundOffset = 0;
    let cloudOffset = 0;
    let cityOffset = 0;
    let bushOffset = 0;
    let starsOffset = 0;
    let gameOverTimer = 0;
    let flashAlpha = 0;
    let isNight = Math.random() < 0.3; // 30% chance night theme per run
    let dayCyclePhase = isNight ? DAY_CYCLE_STAGE_DURATION * 2 : 0;

    // Bird
    const bird = {
        x: BIRD_X,
        y: H * 0.45,
        vy: 0,
        rotation: 0,
        wing: 0,
        wingTimer: 0,
        bobTimer: 0,
        color: 'yellow'
    };

    // Random skin per session
    const SKIN_KEYS = ['yellow', 'red', 'blue'];
    bird.color = SKIN_KEYS[Math.floor(Math.random() * SKIN_KEYS.length)];

    // ---------- Pixel-art bird sprites ----------
    // Palette per skin
    const SKINS = {
        yellow: { body: '#fad126', shade: '#e69b1f', cheek: '#fbe88c', belly: '#fff7c6', wing: '#cf3a26', wingDark: '#8f2419', wingHi: '#f6776a' },
        red:    { body: '#e74c3c', shade: '#a02b1f', cheek: '#f5a39a', belly: '#ffd9d2', wing: '#f8b400', wingDark: '#a47200', wingHi: '#ffd866' },
        blue:   { body: '#3aa3ff', shade: '#1f6db3', cheek: '#a3d3ff', belly: '#d6ecff', wing: '#ffb74d', wingDark: '#a45f00', wingHi: '#ffd380' }
    };

    const OUTLINE = '#1a1a1a';
    const EYE_WHITE = '#ffffff';
    const PUPIL = '#1a1a1a';
    const EYE_HI = '#ffffff';
    const BEAK = '#ff9c1a';
    const BEAK_DARK = '#b86b00';

    // Bird sprite — drawn pixel-by-pixel on a 17x12 grid (each px = 1 sprite pixel)
    // Renders into an offscreen canvas, then we draw it scaled with no smoothing.
    const BIRD_SPRITE_W = 17;
    const BIRD_SPRITE_H = 12;
    const BIRD_PIXEL = 3; // each sprite pixel = 3 screen pixels (~51x36 on screen)

    function makePixelCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const x = c.getContext('2d');
        x.imageSmoothingEnabled = false;
        return { canvas: c, ctx: x };
    }

    function px(ctx, x, y, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
    }

    // Plot a horizontal run of pixels
    function pxRow(ctx, x, y, len, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, len, 1);
    }

    function drawBirdSprite(wingFrame, skinKey) {
        const s = SKINS[skinKey];
        const off = makePixelCanvas(BIRD_SPRITE_W, BIRD_SPRITE_H);
        const x = off.ctx;

        // ---- Body outline (rounded silhouette) ----
        // Row-by-row outline + fill
        const K = OUTLINE;
        const Y = s.body;
        const D = s.shade;
        const C = s.cheek;
        const B = s.belly;

        // Row 0: outline top (cols 5..10)
        pxRow(x, 5, 0, 6, K);
        // Row 1: outline + body (4..11)
        px(x, 4, 1, K); px(x, 11, 1, K);
        pxRow(x, 5, 1, 6, Y);
        // Row 2
        px(x, 3, 2, K); px(x, 13, 2, K);
        pxRow(x, 4, 2, 9, Y);
        // Row 3
        px(x, 2, 3, K); px(x, 14, 3, K);
        pxRow(x, 3, 3, 11, Y);
        // Row 4
        px(x, 1, 4, K); px(x, 15, 4, K);
        pxRow(x, 2, 4, 13, Y);
        // Row 5
        px(x, 1, 5, K); px(x, 16, 5, K);
        pxRow(x, 2, 5, 14, Y);
        // Row 6
        px(x, 0, 6, K); px(x, 16, 6, K);
        pxRow(x, 1, 6, 15, Y);
        // Row 7
        px(x, 0, 7, K); px(x, 14, 7, K);
        pxRow(x, 1, 7, 13, Y);
        // Row 8
        px(x, 1, 8, K); px(x, 13, 8, K);
        pxRow(x, 2, 8, 11, Y);
        // Row 9
        px(x, 2, 9, K); px(x, 12, 9, K);
        pxRow(x, 3, 9, 9, Y);
        // Row 10
        px(x, 3, 10, K); px(x, 11, 10, K);
        pxRow(x, 4, 10, 7, Y);
        // Row 11: bottom outline
        pxRow(x, 4, 11, 7, K);

        // ---- Belly (cream) ----
        // Bottom-front area
        pxRow(x, 4, 8, 7, B);
        pxRow(x, 4, 9, 7, B);  // overdraws but interior ok
        pxRow(x, 5, 10, 5, B);
        // Re-draw body outline pixels we may have stomped (left side)
        px(x, 3, 9, K);
        px(x, 12, 9, K); // closing edge
        px(x, 11, 10, K);
        // Front belly curve highlight
        px(x, 9, 7, B);
        px(x, 10, 7, B);
        px(x, 11, 7, B);
        // restore outline at row 7 right edge
        px(x, 14, 7, K);

        // ---- Body shading on bottom-back ----
        px(x, 2, 7, D);
        px(x, 3, 7, D);
        px(x, 2, 6, D);
        px(x, 3, 8, D);

        // ---- Cheek blush ----
        px(x, 9, 5, C);
        px(x, 10, 5, C);
        px(x, 9, 6, C);
        px(x, 10, 6, C);

        // ---- Eye ----
        // White
        pxRow(x, 11, 3, 3, EYE_WHITE);
        pxRow(x, 10, 4, 4, EYE_WHITE);
        pxRow(x, 10, 5, 4, EYE_WHITE); // overlaps cheek - fine, eye on top
        pxRow(x, 11, 6, 3, EYE_WHITE);
        // Eye outline
        px(x, 10, 3, K); px(x, 14, 3, K);
        px(x, 9, 4, K); px(x, 14, 4, K);
        px(x, 9, 5, K); px(x, 14, 5, K);
        px(x, 10, 6, K); px(x, 14, 6, K);
        pxRow(x, 11, 7, 3, K); // bottom of eye fused with body bottom edge
        pxRow(x, 11, 2, 3, K); // top
        // Pupil (large, towards forward edge)
        pxRow(x, 12, 4, 2, PUPIL);
        pxRow(x, 12, 5, 2, PUPIL);
        // Eye highlight
        px(x, 12, 4, EYE_HI);

        // ---- Beak ----
        // Two-piece beak (upper + lower) in front of head
        // Upper beak
        pxRow(x, 15, 5, 2, BEAK);
        pxRow(x, 15, 6, 2, BEAK);
        px(x, 14, 6, BEAK);
        // Lower beak (slightly darker)
        pxRow(x, 15, 7, 2, BEAK_DARK);
        px(x, 14, 7, BEAK_DARK);
        // Beak outline
        px(x, 14, 5, K);
        px(x, 16, 5, K);
        px(x, 16, 6, K);
        px(x, 16, 7, K);
        px(x, 15, 8, K);
        px(x, 16, 8, K);

        // ---- Wing (3 frames) ----
        // Wing sits on body's left/middle area
        const WCOL = s.wing, WDARK = s.wingDark, WHI = s.wingHi;
        if (wingFrame === 0) {
            // Wing UP
            pxRow(x, 4, 4, 4, WCOL);
            pxRow(x, 3, 5, 5, WCOL);
            px(x, 7, 5, WHI);
            // Outline
            px(x, 4, 3, K); px(x, 5, 3, K); px(x, 6, 3, K); px(x, 7, 3, K);
            px(x, 3, 4, K); px(x, 8, 4, K);
            px(x, 2, 5, K); px(x, 8, 5, K);
            px(x, 3, 6, K); px(x, 4, 6, K); px(x, 5, 6, K); px(x, 6, 6, K); px(x, 7, 6, K);
        } else if (wingFrame === 1) {
            // Wing MID
            pxRow(x, 3, 6, 5, WCOL);
            pxRow(x, 4, 7, 4, WCOL);
            px(x, 7, 6, WHI);
            // Outline
            px(x, 3, 5, K); px(x, 4, 5, K); px(x, 5, 5, K); px(x, 6, 5, K); px(x, 7, 5, K); px(x, 8, 5, K);
            px(x, 2, 6, K); px(x, 8, 6, K);
            px(x, 3, 7, K); px(x, 8, 7, K);
            px(x, 4, 8, K); px(x, 5, 8, K); px(x, 6, 8, K); px(x, 7, 8, K);
        } else {
            // Wing DOWN
            pxRow(x, 4, 7, 4, WCOL);
            pxRow(x, 3, 8, 5, WDARK);
            pxRow(x, 4, 9, 4, WDARK);
            // Outline
            px(x, 4, 6, K); px(x, 5, 6, K); px(x, 6, 6, K); px(x, 7, 6, K);
            px(x, 3, 7, K); px(x, 8, 7, K);
            px(x, 2, 8, K); px(x, 8, 8, K);
            px(x, 3, 9, K); px(x, 8, 9, K);
            px(x, 4, 10, K); px(x, 5, 10, K); px(x, 6, 10, K); px(x, 7, 10, K);
        }

        return off.canvas;
    }

    // Pre-render all sprites for the chosen skin (rebuild on skin change)
    let birdFrames = null;
    function rebuildBirdSprites() {
        birdFrames = [
            drawBirdSprite(0, bird.color),
            drawBirdSprite(1, bird.color),
            drawBirdSprite(2, bird.color),
        ];
    }
    rebuildBirdSprites();

    // ---------- Pre-rendered pipe sprite ----------
    // Pipe drawn as pixel art with cap (we render full pipe from sprite slices each frame)
    const PIPE_CAP_H = 28;
    function buildPipeSprite() {
        // Cap sprite (PIPE_WIDTH+8 wide x cap height)
        const capW = PIPE_WIDTH + 8;
        const capCv = makePixelCanvas(capW, PIPE_CAP_H);
        const cx = capCv.ctx;
        // Body shading bands (vertical strips of color)
        const stripes = [
            { c: '#3d6e1a', w: 4 },
            { c: '#5fa83a', w: 6 },
            { c: '#7dd24a', w: 14 },
            { c: '#a4e26b', w: 10 },
            { c: '#c0ec84', w: 6 },
            { c: '#a4e26b', w: 8 },
            { c: '#7dd24a', w: 14 },
            { c: '#5fa83a', w: 10 },
            { c: '#3d6e1a', w: 8 }
        ];
        let xpos = 0;
        for (const s of stripes) {
            cx.fillStyle = s.c;
            cx.fillRect(xpos, 0, s.w, PIPE_CAP_H);
            xpos += s.w;
        }
        // Top/bottom borders
        cx.fillStyle = '#243f0e';
        cx.fillRect(0, 0, capW, 2);
        cx.fillRect(0, PIPE_CAP_H - 2, capW, 2);
        cx.fillRect(0, 0, 2, PIPE_CAP_H);
        cx.fillRect(capW - 2, 0, 2, PIPE_CAP_H);
        // Inner highlight
        cx.fillStyle = '#e3f3a6';
        cx.fillRect(8, 4, 3, PIPE_CAP_H - 8);

        // Body sprite (just one row, we'll stretch vertically — flat colors in vertical bands so stretching is fine)
        const bodyCv = makePixelCanvas(PIPE_WIDTH, 1);
        const bx = bodyCv.ctx;
        const bodyStripes = [
            { c: '#3d6e1a', w: 3 },
            { c: '#5fa83a', w: 5 },
            { c: '#7dd24a', w: 12 },
            { c: '#a4e26b', w: 10 },
            { c: '#c0ec84', w: 5 },
            { c: '#a4e26b', w: 9 },
            { c: '#7dd24a', w: 12 },
            { c: '#5fa83a', w: 10 },
            { c: '#3d6e1a', w: 6 }
        ];
        let bxpos = 0;
        for (const s of bodyStripes) {
            bx.fillStyle = s.c;
            bx.fillRect(bxpos, 0, s.w, 1);
            bxpos += s.w;
        }

        // Outline strips for sides
        const sideCv = makePixelCanvas(2, 1);
        sideCv.ctx.fillStyle = '#243f0e';
        sideCv.ctx.fillRect(0, 0, 2, 1);

        return { cap: capCv.canvas, body: bodyCv.canvas, side: sideCv.canvas };
    }
    const pipeSprite = buildPipeSprite();

    // ---------- Pixel-art boss sprite ----------
    // Sprite pixel-art dibujado con primitivas, 3 frames de aleteo. Renderizado a 4x.
    const BOSS_SPRITE_W = 32;
    const BOSS_SPRITE_H = 28;
    const BOSS_PIXEL = 4;

    function drawBossSprite(wingFrame) {
        const off = makePixelCanvas(BOSS_SPRITE_W, BOSS_SPRITE_H);
        const x = off.ctx;

        // Paleta jefe — tonos morados/violetas oscuros con acentos rojos
        const K = '#0a0512';      // contorno casi negro
        const D1 = '#1d0c2a';     // morado muy oscuro (sombra)
        const D2 = '#3a1a52';     // morado oscuro (cuerpo)
        const D3 = '#5e2787';     // morado medio (highlight)
        const D4 = '#8a3fbf';     // morado claro
        const RED = '#e63946';    // ojo rojo
        const RED_BR = '#ff7a85'; // ojo brillante
        const BEAK_D = '#3a0a0a'; // pico oscuro
        const BEAK_L = '#9a1a1a'; // pico
        const HORN = '#c9b569';   // cuerno dorado
        const HORN_D = '#7a6630'; // cuerno sombra

        // ---- Cuerpo principal (silueta ovalada apuntando a la izquierda, mirando al jugador) ----
        // Filas 6..20, cuerpo grande
        // Outline + relleno por filas
        const bodyRows = [
            // [y, leftOutline, rightOutline, fillColor]
            [4, 11, 16, D2],
            [5, 9, 18, D2],
            [6, 7, 20, D2],
            [7, 6, 22, D2],
            [8, 5, 23, D2],
            [9, 4, 24, D2],
            [10, 3, 24, D2],
            [11, 3, 24, D2],
            [12, 3, 23, D2],
            [13, 4, 22, D2],
            [14, 5, 21, D2],
            [15, 6, 20, D2],
            [16, 7, 19, D2],
            [17, 8, 18, D2],
            [18, 10, 17, D2],
            [19, 12, 16, D2],
        ];
        // Pintar relleno
        for (const [y, l, r] of bodyRows) {
            x.fillStyle = D2;
            x.fillRect(l, y, r - l + 1, 1);
        }
        // Highlights de cuerpo (zona superior)
        x.fillStyle = D3;
        x.fillRect(7, 6, 8, 1);
        x.fillRect(6, 7, 10, 2);
        x.fillRect(7, 9, 8, 1);
        x.fillStyle = D4;
        x.fillRect(8, 7, 5, 1);
        x.fillRect(9, 8, 3, 1);
        // Sombra inferior
        x.fillStyle = D1;
        x.fillRect(8, 16, 11, 1);
        x.fillRect(10, 17, 8, 1);
        x.fillRect(12, 18, 5, 1);

        // Outline cuerpo
        x.fillStyle = K;
        for (const [y, l, r] of bodyRows) {
            x.fillRect(l - 1, y, 1, 1);
            x.fillRect(r + 1, y, 1, 1);
        }
        // Outline top/bottom
        x.fillRect(11, 3, 6, 1);
        x.fillRect(12, 20, 5, 1);

        // ---- Cuernos / corona (3 puntas) ----
        // Cuerno izquierdo
        x.fillStyle = HORN;
        x.fillRect(8, 1, 2, 3);
        x.fillStyle = HORN_D;
        x.fillRect(8, 3, 2, 1);
        x.fillStyle = K;
        x.fillRect(7, 1, 1, 3); x.fillRect(10, 1, 1, 3); x.fillRect(8, 0, 2, 1);
        // Cuerno central (más grande)
        x.fillStyle = HORN;
        x.fillRect(13, 0, 3, 4);
        x.fillStyle = HORN_D;
        x.fillRect(13, 3, 3, 1);
        x.fillRect(15, 1, 1, 2);
        x.fillStyle = K;
        x.fillRect(12, 0, 1, 4); x.fillRect(16, 0, 1, 4); x.fillRect(13, -1, 3, 1); // top
        // Cuerno derecho
        x.fillStyle = HORN;
        x.fillRect(19, 1, 2, 3);
        x.fillStyle = HORN_D;
        x.fillRect(19, 3, 2, 1);
        x.fillStyle = K;
        x.fillRect(18, 1, 1, 3); x.fillRect(21, 1, 1, 3); x.fillRect(19, 0, 2, 1);

        // ---- Ojos rojos brillantes (mirando al jugador, lado izquierdo del sprite) ----
        // Ojo izq (más cerca del jugador)
        x.fillStyle = K;
        x.fillRect(3, 9, 5, 4);
        x.fillStyle = RED;
        x.fillRect(4, 10, 3, 2);
        x.fillStyle = RED_BR;
        x.fillRect(5, 10, 1, 1);
        // Ojo der (en la mejilla del jefe)
        x.fillStyle = K;
        x.fillRect(9, 10, 4, 3);
        x.fillStyle = RED;
        x.fillRect(10, 11, 2, 1);
        x.fillStyle = RED_BR;
        x.fillRect(10, 11, 1, 1);

        // ---- Pico (apuntando a la izquierda — boca abierta) ----
        x.fillStyle = BEAK_L;
        x.fillRect(0, 12, 4, 2);
        x.fillRect(1, 14, 4, 2);
        x.fillStyle = BEAK_D;
        x.fillRect(0, 14, 2, 2);
        x.fillRect(2, 13, 1, 1);
        x.fillStyle = K;
        x.fillRect(0, 11, 4, 1); x.fillRect(0, 16, 5, 1);
        x.fillRect(4, 12, 1, 2); x.fillRect(5, 14, 1, 2);
        // Diente
        x.fillStyle = '#ffffff';
        x.fillRect(2, 14, 1, 1);

        // ---- Alas (3 frames) ----
        x.fillStyle = K;
        if (wingFrame === 0) {
            // Ala arriba — extendida hacia arriba-atrás
            x.fillStyle = D1;
            x.fillRect(20, 2, 6, 6);
            x.fillRect(22, 1, 4, 2);
            x.fillStyle = D2;
            x.fillRect(21, 3, 4, 4);
            x.fillStyle = K;
            x.fillRect(19, 2, 1, 6); x.fillRect(20, 1, 6, 1);
            x.fillRect(26, 2, 1, 6); x.fillRect(20, 8, 7, 1);
        } else if (wingFrame === 1) {
            // Ala media
            x.fillStyle = D1;
            x.fillRect(20, 8, 7, 5);
            x.fillStyle = D2;
            x.fillRect(21, 9, 5, 3);
            x.fillStyle = K;
            x.fillRect(19, 8, 1, 5); x.fillRect(20, 7, 7, 1);
            x.fillRect(27, 8, 1, 5); x.fillRect(20, 13, 8, 1);
        } else {
            // Ala abajo — extendida hacia abajo
            x.fillStyle = D1;
            x.fillRect(20, 14, 6, 6);
            x.fillRect(22, 19, 4, 2);
            x.fillStyle = D2;
            x.fillRect(21, 15, 4, 4);
            x.fillStyle = K;
            x.fillRect(19, 14, 1, 6); x.fillRect(20, 13, 6, 1);
            x.fillRect(26, 14, 1, 7); x.fillRect(20, 21, 7, 1);
        }

        // ---- Rediseño: cola, espinas y talones para hacerlo mas imponente ----
        x.fillStyle = K;
        x.fillRect(25, 10, 4, 2);
        x.fillRect(27, 12, 4, 2);
        x.fillRect(28, 14, 3, 2);
        x.fillRect(29, 16, 2, 2);
        x.fillStyle = D1;
        x.fillRect(25, 11, 3, 1);
        x.fillRect(27, 13, 3, 1);
        x.fillRect(28, 15, 2, 1);

        // Espinas dorsales.
        x.fillStyle = K;
        x.fillRect(22, 4, 2, 2);
        x.fillRect(24, 7, 2, 2);
        x.fillRect(24, 17, 2, 2);
        x.fillStyle = D4;
        x.fillRect(23, 4, 1, 1);
        x.fillRect(25, 7, 1, 1);
        x.fillRect(25, 17, 1, 1);

        // Nucleo/pechera brillante.
        x.fillStyle = K;
        x.fillRect(13, 12, 5, 5);
        x.fillStyle = '#7f1d9b';
        x.fillRect(14, 13, 3, 3);
        x.fillStyle = '#e864ff';
        x.fillRect(15, 13, 1, 1);

        // Talones.
        x.fillStyle = K;
        x.fillRect(10, 21, 2, 3);
        x.fillRect(16, 21, 2, 3);
        x.fillRect(9, 24, 4, 1);
        x.fillRect(15, 24, 4, 1);
        x.fillStyle = HORN;
        x.fillRect(10, 23, 2, 1);
        x.fillRect(16, 23, 2, 1);

        return off.canvas;
    }

    let bossFrames = null;
    function rebuildBossSprites() {
        bossFrames = [drawBossSprite(0), drawBossSprite(1), drawBossSprite(2)];
    }
    rebuildBossSprites();

    // ---------- Audio: SFX (Web Audio API) ----------
    let audioCtx = null;
    let masterGain = null;

    function ensureAudio() {
        if (!audioCtx) {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                masterGain = audioCtx.createGain();
                masterGain.gain.value = 0.55;
                masterGain.connect(audioCtx.destination);
            } catch (e) { audioCtx = null; }
        }
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    }

    // ---------- Background music via <audio> elements ----------
    // Dos pistas: principal (main) y jefe (boss). Crossfade al cambiar.
    const musicEl = document.getElementById('bg-music');     // pista principal
    const bossMusicEl = document.getElementById('boss-music'); // pista del jefe

    let musicPlaying = false;
    let musicMuted = false;
    let musicLoadError = null;
    // Volumen inicial 20% — protege los oídos (luego el usuario puede cambiarlo)
    const FIRST_TIME_DEFAULT_VOL = 20;
    let musicVolume;
    const storedVol = localStorage.getItem('flappy_music_volume');
    if (storedVol === null) {
        musicVolume = FIRST_TIME_DEFAULT_VOL;
        localStorage.setItem('flappy_music_volume', String(musicVolume));
    } else {
        musicVolume = parseInt(storedVol, 10);
        if (isNaN(musicVolume) || musicVolume < 0 || musicVolume > 100) musicVolume = FIRST_TIME_DEFAULT_VOL;
    }
    musicMuted = localStorage.getItem('flappy_music_muted') === '1';

    let currentTrack = 'main'; // 'main' | 'boss'
    let crossfadeTimer = null;

    function activeMusicEl() {
        return currentTrack === 'boss' ? bossMusicEl : musicEl;
    }

    function volToLevel(v) {
        const n = Math.max(0, Math.min(100, v)) / 100;
        return n * n;
    }

    function targetMusicLevel() {
        return musicMuted ? 0 : volToLevel(musicVolume);
    }

    function applyMusicVolume() {
        // Si hay un crossfade en curso, dejar que él controle el volumen.
        if (crossfadeTimer) return;
        const lvl = targetMusicLevel();
        activeMusicEl().volume = lvl;
        // El otro elemento queda silenciado (ya está en pausa, pero por si acaso)
        const other = currentTrack === 'boss' ? musicEl : bossMusicEl;
        other.volume = 0;
    }

    function attachMusicListeners(el, label) {
        el.addEventListener('error', () => {
            const errCodes = { 1: 'ABORTED', 2: 'NETWORK', 3: 'DECODE', 4: 'NOT_SUPPORTED' };
            const code = el.error ? el.error.code : '?';
            musicLoadError = 'Error cargando ' + label + ' (' + (errCodes[code] || code) + '). Sirve por HTTP o revisa la ruta.';
            console.error('[' + label + '] Error:', el.error, 'src=', el.currentSrc);
            if (typeof updateVolumeUI === 'function') updateVolumeUI();
        });
        el.addEventListener('canplaythrough', () => {
            console.log('[' + label + '] Lista (' + el.duration.toFixed(2) + 's)');
        });
        el.addEventListener('playing', () => {
            if (el === activeMusicEl()) musicPlaying = true;
            if (typeof updateVolumeUI === 'function') updateVolumeUI();
        });
        // Loop sin gap manual + red de seguridad nativa
        el.addEventListener('timeupdate', () => {
            if (el.duration && el.currentTime >= el.duration - 0.06) el.currentTime = 0;
        });
        el.addEventListener('ended', () => { el.currentTime = 0; el.play().catch(() => {}); });
    }
    attachMusicListeners(musicEl, 'Música');
    attachMusicListeners(bossMusicEl, 'Boss');

    // Asignación robusta del src + carga explícita
    musicEl.preload = 'auto'; musicEl.loop = true;
    musicEl.setAttribute('src', 'assets/music.mp3'); musicEl.load();

    bossMusicEl.preload = 'auto'; bossMusicEl.loop = true;
    bossMusicEl.setAttribute('src', 'assets/boss.mp3'); bossMusicEl.load();
    bossMusicEl.volume = 0; // empieza silenciada

    applyMusicVolume();

    async function startMusic() {
        if (musicPlaying) return;
        applyMusicVolume();
        try {
            await activeMusicEl().play();
            musicPlaying = true;
            musicLoadError = null;
            if (typeof updateVolumeUI === 'function') updateVolumeUI();
        } catch (e) {
            console.warn('[Música] play() rechazado:', e.name, e.message);
            musicLoadError = 'Bloqueado: ' + (e.name === 'NotAllowedError' ? 'haz clic en el juego primero' : e.message);
            if (typeof updateVolumeUI === 'function') updateVolumeUI();
        }
    }

    // ---- Crossfade entre pistas ----
    function crossfadeTo(track, durationMs = 1500) {
        if (currentTrack === track) return;
        if (crossfadeTimer) { clearInterval(crossfadeTimer); crossfadeTimer = null; }
        const fromEl = activeMusicEl();
        const toEl = track === 'boss' ? bossMusicEl : musicEl;

        // Empezar la nueva pista desde el inicio en silencio
        toEl.currentTime = 0;
        toEl.volume = 0;
        toEl.play().catch(err => console.warn('[crossfade] play() falló:', err));

        const steps = 30;
        const stepMs = durationMs / steps;
        let i = 0;
        // Marcamos el track destino antes (para que activeMusicEl() reporte el nuevo)
        currentTrack = track;
        crossfadeTimer = setInterval(() => {
            i++;
            const t = i / steps;
            const lvl = targetMusicLevel(); // se relee en cada paso (respeta cambios del slider)
            fromEl.volume = Math.max(0, lvl * (1 - t));
            toEl.volume = Math.min(1, lvl * t);
            if (i >= steps) {
                clearInterval(crossfadeTimer);
                crossfadeTimer = null;
                fromEl.pause();
                fromEl.currentTime = 0;
                fromEl.volume = 0;
                toEl.volume = targetMusicLevel();
            }
        }, stepMs);
    }

    // Generic blip with optional pitch sweep + tremolo
    function blip(freq, dur, type = 'square', vol = 0.2, sweepTo = null, attack = 0.005) {
        if (!audioCtx || audioCtx.state === 'suspended') ensureAudio();
        if (!audioCtx) return;
        const t0 = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (sweepTo !== null) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
        }
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(vol, t0 + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g).connect(masterGain);
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
    }

    // Noise burst (for thump/hit)
    function noise(dur, vol = 0.2, lpFreq = 1200) {
        if (!audioCtx || audioCtx.state === 'suspended') ensureAudio();
        if (!audioCtx) return;
        const t0 = audioCtx.currentTime;
        const bufSize = Math.floor(audioCtx.sampleRate * dur);
        const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        const lp = audioCtx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = lpFreq;
        const g = audioCtx.createGain();
        g.gain.value = vol;
        src.connect(lp).connect(g).connect(masterGain);
        src.start(t0);
        src.stop(t0 + dur);
    }

    const sfx = {
        flap:  () => {
            ensureAudio();
            // Quick rising chirp
            blip(720, 0.07, 'square', 0.15, 1100);
            setTimeout(() => blip(540, 0.06, 'triangle', 0.10, 380), 30);
        },
        score: () => {
            ensureAudio();
            // 2-note arpeggio
            blip(1040, 0.075, 'square', 0.22);
            setTimeout(() => blip(1560, 0.09, 'square', 0.20), 65);
        },
        hit:   () => {
            ensureAudio();
            // Thud + low square
            noise(0.18, 0.35, 800);
            blip(110, 0.16, 'sawtooth', 0.22, 70);
        },
        die:   () => {
            ensureAudio();
            // Falling tone
            blip(440, 0.55, 'triangle', 0.22, 60);
        },
        swoop: () => { ensureAudio(); blip(660, 0.18, 'sine', 0.15, 280); },
        bossRoar: () => {
            ensureAudio();
            // Rugido grave del jefe
            blip(95, 0.75, 'sawtooth', 0.36, 45);
            blip(155, 0.65, 'square', 0.22, 75);
            setTimeout(() => noise(0.42, 0.42, 560), 90);
        },
        rayCharge: () => {
            ensureAudio();
            // Carga ascendente
            blip(220, 0.48, 'sawtooth', 0.24, 980);
        },
        rayFire: () => {
            ensureAudio();
            // Disparo del rayo
            blip(980, 0.28, 'sawtooth', 0.34, 180);
            noise(0.22, 0.26, 3200);
        },
        win: () => {
            ensureAudio();
            // Fanfarria de victoria
            const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
            notes.forEach((f, i) => setTimeout(() => blip(f, 0.18, 'square', 0.22), i * 110));
            setTimeout(() => { blip(1319, 0.4, 'square', 0.25); blip(1568, 0.4, 'triangle', 0.18); }, 500);
        }
    };

    // ---------- Input ----------
    function flap() {
        ensureAudio();
        // Kick off background music on first user gesture (browsers require it)
        if (!musicPlaying && !musicMuted) startMusic();
        if (state === STATE.READY) {
            state = STATE.PLAYING;
            bird.vy = FLAP_VELOCITY;
            sfx.flap();
        } else if (state === STATE.PLAYING || state === STATE.BOSS) {
            bird.vy = FLAP_VELOCITY;
            sfx.flap();
        } else if (state === STATE.GAMEOVER && gameOverTimer > 0.6) {
            resetGame();
            sfx.swoop();
        } else if (state === STATE.WIN && winTimer > 1.8) {
            resetGame();
            sfx.swoop();
        }
    }

    canvas.addEventListener('mousedown', e => { e.preventDefault(); flap(); });
    canvas.addEventListener('touchstart', e => { e.preventDefault(); flap(); }, { passive: false });
    window.addEventListener('keydown', e => {
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
            e.preventDefault();
            flap();
        } else if (e.code === 'KeyM') {
            // M = toggle mute
            toggleMute();
        }
    });

    // ---------- Music UI ----------
    const musicToggleBtn = document.getElementById('music-toggle');
    const volumePanel = document.getElementById('volume-panel');
    const volSlider = document.getElementById('vol-slider');
    const volValue = document.getElementById('vol-value');
    const volUpBtn = document.getElementById('vol-up');
    const volDownBtn = document.getElementById('vol-down');
    const muteBtn = document.getElementById('mute-btn');
    const playMusicBtn = document.getElementById('play-music-btn');
    const musicStatus = document.getElementById('music-status');
    const settingsToggleBtn = document.getElementById('settings-toggle');
    const settingsPanel = document.getElementById('settings-panel');
    const fpsValue = document.getElementById('fps-value');
    const fpsOptionButtons = Array.from(document.querySelectorAll('#fps-options button'));

    const FPS_OPTIONS = [30, 60, 90, 120];
    let targetFps = parseInt(localStorage.getItem('flappy_target_fps') || '60', 10);
    if (!FPS_OPTIONS.includes(targetFps)) targetFps = 60;

    function updateVolumeUI() {
        volSlider.value = String(musicVolume);
        volSlider.style.setProperty('--vol', musicVolume + '%');
        volValue.textContent = (musicMuted ? 'Silenciado' : musicVolume + '%');
        muteBtn.textContent = musicMuted ? '🔇' : (musicVolume === 0 ? '🔈' : musicVolume < 50 ? '🔉' : '🔊');
        musicToggleBtn.classList.toggle('muted', musicMuted);

        // Play button reflects estado actual
        const cur = activeMusicEl();
        if (playMusicBtn) {
            const playing = musicPlaying && !cur.paused;
            playMusicBtn.classList.toggle('playing', playing);
            playMusicBtn.textContent = playing ? '⏸ Pausar música' : '▶ Reproducir música';
        }
        // Status text
        if (musicStatus) {
            musicStatus.classList.remove('error', 'ok');
            if (musicLoadError) {
                musicStatus.textContent = '⚠ ' + musicLoadError;
                musicStatus.classList.add('error');
            } else if (musicPlaying && !cur.paused) {
                const trackLabel = currentTrack === 'boss' ? 'Boss · Harmonica Finals' : 'Principal';
                musicStatus.textContent = '♪ ' + trackLabel + (cur.duration ? ' — ' + cur.duration.toFixed(1) + 's en loop' : ' — cargando…');
                musicStatus.classList.add('ok');
            } else {
                musicStatus.textContent = '';
            }
        }
    }
    updateVolumeUI();

    function updateSettingsUI() {
        fpsValue.textContent = String(targetFps);
        for (const btn of fpsOptionButtons) {
            btn.classList.toggle('selected', parseInt(btn.dataset.fps, 10) === targetFps);
        }
    }
    updateSettingsUI();

    function setVolume(v) {
        musicVolume = Math.max(0, Math.min(100, Math.round(v)));
        localStorage.setItem('flappy_music_volume', String(musicVolume));
        if (musicVolume > 0 && musicMuted) {
            // Subir volumen implícitamente desmutea
            musicMuted = false;
            localStorage.setItem('flappy_music_muted', '0');
        }
        applyMusicVolume();
        updateVolumeUI();
    }

    function toggleMute() {
        musicMuted = !musicMuted;
        localStorage.setItem('flappy_music_muted', musicMuted ? '1' : '0');
        applyMusicVolume();
        updateVolumeUI();
        if (!musicMuted && !musicPlaying) startMusic();
    }

    function togglePanel() {
        volumePanel.classList.toggle('hidden');
        settingsPanel.classList.add('hidden');
    }

    function toggleSettingsPanel() {
        settingsPanel.classList.toggle('hidden');
        volumePanel.classList.add('hidden');
    }

    function setTargetFps(fps) {
        if (!FPS_OPTIONS.includes(fps)) return;
        targetFps = fps;
        localStorage.setItem('flappy_target_fps', String(targetFps));
        updateSettingsUI();
    }

    musicToggleBtn.addEventListener('click', e => {
        e.stopPropagation();
        ensureAudio();
        // El botón del panel también es un gesto de usuario → arranca la música
        if (!musicPlaying && !musicMuted) startMusic();
        togglePanel();
    });

    settingsToggleBtn.addEventListener('click', e => {
        e.stopPropagation();
        toggleSettingsPanel();
    });

    for (const btn of fpsOptionButtons) {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            setTargetFps(parseInt(btn.dataset.fps, 10));
        });
    }

    volSlider.addEventListener('input', e => setVolume(parseInt(e.target.value, 10)));
    volUpBtn.addEventListener('click', e => { e.stopPropagation(); setVolume(musicVolume + 10); });
    volDownBtn.addEventListener('click', e => { e.stopPropagation(); setVolume(musicVolume - 10); });
    muteBtn.addEventListener('click', e => { e.stopPropagation(); toggleMute(); });

    // Botón Play/Pausa explícito (es un user gesture seguro para play())
    if (playMusicBtn) {
        playMusicBtn.addEventListener('click', e => {
            e.stopPropagation();
            ensureAudio();
            const cur = activeMusicEl();
            if (musicPlaying && !cur.paused) {
                cur.pause();
                musicPlaying = false;
                updateVolumeUI();
            } else {
                if (musicMuted) {
                    musicMuted = false;
                    localStorage.setItem('flappy_music_muted', '0');
                }
                startMusic();
            }
        });
    }

    // Stop clicks inside the panel from bubbling up to the canvas (which would flap)
    volumePanel.addEventListener('mousedown', e => e.stopPropagation());
    volumePanel.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    volumePanel.addEventListener('click', e => e.stopPropagation());
    settingsPanel.addEventListener('mousedown', e => e.stopPropagation());
    settingsPanel.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    settingsPanel.addEventListener('click', e => e.stopPropagation());

    // Click outside the panel closes it
    document.addEventListener('click', e => {
        if (!volumePanel.classList.contains('hidden') &&
            !volumePanel.contains(e.target) &&
            e.target !== musicToggleBtn) {
            volumePanel.classList.add('hidden');
        }
        if (!settingsPanel.classList.contains('hidden') &&
            !settingsPanel.contains(e.target) &&
            e.target !== settingsToggleBtn) {
            settingsPanel.classList.add('hidden');
        }
    });

    function resetGame() {
        state = STATE.READY;
        score = 0;
        pipes = [];
        spawnTimer = 0;
        bird.x = BIRD_X;
        bird.y = H * 0.45;
        bird.vy = 0;
        bird.rotation = 0;
        gameOverTimer = 0;
        flashAlpha = 0;
        bird.color = SKIN_KEYS[Math.floor(Math.random() * SKIN_KEYS.length)];
        isNight = Math.random() < 0.3;
        dayCyclePhase = isNight ? DAY_CYCLE_STAGE_DURATION * 2 : 0;
        rebuildBirdSprites();
        // Reset boss state
        bossActive = false;
        bossTime = 0;
        bossPhase = 0;
        bossMusicSwitched = false;
        bossEntranceTimer = 0;
        pipesFadingOut = false;
        bossPipeFadeStarted = false;
        rays = [];
        raySpawnTimer = 0;
        screenShake = 0;
        winTimer = 0;
        confetti = [];
        boss.x = boss.baseX;
        boss.y = boss.baseY;
        boss.scale = 1.0;
        boss.targetScale = 1.0;
        boss.movePhase = 0;
        boss.bobPhase = 0;
        boss.eyeGlow = 0;
        // Si veníamos de la música del jefe, regresar a la principal
        if (currentTrack === 'boss' && musicPlaying) {
            crossfadeTo('main', 1200);
        }
    }

    function clamp01(v) {
        return Math.max(0, Math.min(1, v));
    }

    function smoothstep(edge0, edge1, x) {
        const t = clamp01((x - edge0) / (edge1 - edge0));
        return t * t * (3 - 2 * t);
    }

    function hexToRgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    function mixHex(a, b, t) {
        const ar = hexToRgb(a);
        const br = hexToRgb(b);
        const out = ar.map((v, i) => Math.round(v + (br[i] - v) * t));
        return 'rgb(' + out[0] + ',' + out[1] + ',' + out[2] + ')';
    }

    function cycleStage() {
        return (dayCyclePhase / DAY_CYCLE_STAGE_DURATION) % 4;
    }

    function cycleInfo() {
        const t = ((dayCyclePhase % DAY_CYCLE_DURATION) + DAY_CYCLE_DURATION) % DAY_CYCLE_DURATION;
        const stage = Math.floor(t / DAY_CYCLE_STAGE_DURATION) % 4;
        const elapsed = t - stage * DAY_CYCLE_STAGE_DURATION;
        const next = (stage + 1) % 4;
        const transitionStart = DAY_CYCLE_STAGE_DURATION - DAY_CYCLE_TRANSITION;
        if (elapsed >= transitionStart) {
            return {
                from: stage,
                to: next,
                blend: smoothstep(transitionStart, DAY_CYCLE_STAGE_DURATION, elapsed)
            };
        }
        return { from: stage, to: stage, blend: 1 };
    }

    function cycleLevel(stageIndex) {
        const c = cycleInfo();
        let v = 0;
        if (c.from === stageIndex) v += 1 - c.blend;
        if (c.to === stageIndex) v += c.blend;
        return clamp01(v);
    }

    function distancePointToSegment(px0, py0, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) return Math.hypot(px0 - x1, py0 - y1);
        const t = clamp01(((px0 - x1) * dx + (py0 - y1) * dy) / len2);
        const lx = x1 + t * dx;
        const ly = y1 + t * dy;
        return Math.hypot(px0 - lx, py0 - ly);
    }

    function nightLevel() {
        return cycleLevel(2);
    }

    function duskLevel() {
        return cycleLevel(1);
    }

    function dawnLevel() {
        return cycleLevel(3);
    }

    // ---------- Update ----------
    function getPipeWidth(p) {
        return p && p.width ? p.width : PIPE_WIDTH;
    }

    function isPipeAnimationActive() {
        return score >= PIPE_ANIMATION_SCORE || state === STATE.BOSS;
    }

    function pipeDifficulty01() {
        if (state === STATE.BOSS) return 1;
        if (score < PIPE_ANIMATION_SCORE) return 0;
        return Math.min(1, (score - PIPE_ANIMATION_SCORE) / (BOSS_FIGHT_SCORE - PIPE_ANIMATION_SCORE));
    }

    function spawnPipe() {
        // Desde 120 puntos los tubos empiezan a animarse. En fase de rayos son mas anchos.
        let gap = PIPE_GAP;
        let width = PIPE_WIDTH;
        const difficulty = pipeDifficulty01();
        if (state === STATE.BOSS && bossPhase === 1) {
            gap = Math.round((178 + Math.random() * 44) * _hRatio);
        } else if (state === STATE.BOSS && bossPhase === 2) {
            width = BOSS_RAY_PIPE_WIDTH;
            gap = Math.round(280 * _hRatio);
        } else if (difficulty > 0) {
            gap = Math.round((190 - difficulty * 25 + Math.random() * 30) * _hRatio);
        }
        const minTop = _pipeMargin;
        const maxTop = GROUND_Y - gap - _pipeMargin;
        const topHeight = minTop + Math.random() * Math.max(20, maxTop - minTop);
        pipes.push({
            x: W + 20,
            width: width,
            top: topHeight,
            bottom: topHeight + gap,
            baseTop: topHeight,
            baseGap: gap,
            scored: false,
            pulse: Math.random() * Math.PI * 2,
            fadeOut: 1.0
        });
    }

    function spawnRay() {
        const margin = 70;
        const sc = boss.scale;
        const sw = BOSS_SPRITE_W * BOSS_PIXEL * sc;
        const sh = BOSS_SPRITE_H * BOSS_PIXEL * sc;
        const aimedY = bird.y + (Math.random() - 0.5) * 140;
        const minBossY = boss.y - sh * 0.34;
        const maxBossY = boss.y + sh * 0.34;
        const y = Math.max(margin, Math.min(GROUND_Y - margin, Math.max(minBossY, Math.min(maxBossY, aimedY))));
        const sx = boss.x - sw * 0.46;
        rays.push({
            sx: sx,
            sy: y,
            ex: -30,
            ey: y,
            telegraphTime: 0.75,
            fireTime: 0.32,
            age: 0,
            phase: 0  // 0 telegraph, 1 firing, 2 dead
        });
        sfx.rayCharge();
        boss.eyeGlow = 1;
    }

    function spawnConfetti() {
        confetti = [];
        const colors = ['#ffd34d', '#ff5252', '#4caf50', '#3aa3ff', '#ff9c1a', '#ffffff', '#e040fb'];
        for (let i = 0; i < 100; i++) {
            confetti.push({
                x: W / 2 + (Math.random() - 0.5) * 100,
                y: H / 2 + 30,
                vx: (Math.random() - 0.5) * 480,
                vy: -250 - Math.random() * 320,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: 4 + Math.random() * 5,
                rotation: Math.random() * Math.PI * 2,
                spin: (Math.random() - 0.5) * 10,
                life: 0
            });
        }
    }

    function update(dt) {
        const moving = state !== STATE.DEAD && state !== STATE.GAMEOVER && state !== STATE.WIN;
        if (moving) {
            groundOffset = (groundOffset + PIPE_SPEED * dt) % 24;
            cloudOffset += 8 * dt;
            cityOffset += 18 * dt;
            bushOffset += 50 * dt;
            starsOffset += 2 * dt;
            dayCyclePhase = (dayCyclePhase + dt) % DAY_CYCLE_DURATION;
            isNight = nightLevel() > 0.55;
        }

        if (screenShake > 0) screenShake = Math.max(0, screenShake - dt * 1.6);
        if (boss.eyeGlow > 0) boss.eyeGlow = Math.max(0, boss.eyeGlow - dt * 1.4);

        if (state === STATE.READY) {
            bird.bobTimer += dt;
            bird.y = H * 0.45 + Math.sin(bird.bobTimer * 5) * 6;
            bird.rotation = 0;
            bird.wingTimer += dt;
            if (bird.wingTimer > 0.08) { bird.wingTimer = 0; bird.wing = (bird.wing + 1) % 3; }
            return;
        }

        if (state === STATE.PLAYING || state === STATE.BOSS) {
            // Trigger musica del jefe junto con la aparicion del jefe.
            if (!bossMusicSwitched && score >= BOSS_MUSIC_SCORE && currentTrack === 'main' && musicPlaying) {
                bossMusicSwitched = true;
                crossfadeTo('boss', 1500);
            }

            // Trigger pelea del jefe a 150 puntos.
            if (state === STATE.PLAYING && score >= BOSS_FIGHT_SCORE) {
                state = STATE.BOSS;
                bossActive = true;
                bossTime = 0;
                bossPhase = 1;
                bossEntranceTimer = 0;
                bossPipeFadeStarted = false;
                pipesFadingOut = false;
                raySpawnTimer = 0.5;
                screenShake = 1.0;
                sfx.bossRoar();
                if (currentTrack !== 'boss' && musicPlaying) crossfadeTo('boss', 800);
            }

            // Spawn de tubos (also during ray phase with wide gaps)
            const allowSpawn =
                state === STATE.PLAYING ||
                (state === STATE.BOSS && !pipesFadingOut);
            if (allowSpawn) {
                spawnTimer += dt;
                const difficulty = pipeDifficulty01();
                const interval = state === STATE.BOSS ? PIPE_INTERVAL * 0.88 : PIPE_INTERVAL * (1 - difficulty * 0.12);
                if (spawnTimer >= interval) {
                    spawnTimer = 0;
                    spawnPipe();
                }
            }

            // Movimiento + score + animación de tubos
            for (const p of pipes) {
                p.x -= PIPE_SPEED * dt;
                const pWidth = getPipeWidth(p);
                if ((state === STATE.PLAYING || state === STATE.BOSS) && !p.scored && p.x + pWidth < bird.x - BIRD_HITBOX_R) {
                    p.scored = true;
                    score++;
                    sfx.score();
                }
                if (isPipeAnimationActive() && !(state === STATE.BOSS && bossPhase === 2) && !pipesFadingOut) {
                    // Pulsacion: el hueco respira. De 120 a 150 sube gradualmente.
                    const difficulty = pipeDifficulty01();
                    p.pulse += dt * (1.8 + difficulty * 0.9);
                    const breath = Math.sin(p.pulse) * (8 + difficulty * 14);
                    p.top = p.baseTop - breath;
                    p.bottom = p.baseTop + p.baseGap + breath;
                }
                if (pipesFadingOut) {
                    p.fadeOut = Math.max(0, p.fadeOut - dt * 0.95);
                }
            }
            pipes = pipes.filter(p => {
                if (p.fadeOut !== undefined && p.fadeOut <= 0) return false;
                return p.x + getPipeWidth(p) > -10;
            });

            // Física del pájaro
            bird.vy += GRAVITY * dt;
            if (bird.vy > MAX_FALL_SPEED) bird.vy = MAX_FALL_SPEED;
            bird.y += bird.vy * dt;
            const target = bird.vy < 0 ? -0.45 : Math.min(Math.PI / 2.2, bird.vy / 600);
            bird.rotation += (target - bird.rotation) * Math.min(1, dt * 8);
            bird.wingTimer += dt;
            const wingSpeed = bird.vy < 0 ? 0.05 : 0.12;
            if (bird.wingTimer > wingSpeed) { bird.wingTimer = 0; bird.wing = (bird.wing + 1) % 3; }

            // Estado del jefe
            if (state === STATE.BOSS) {
                if (bossEntranceTimer < 1) {
                    bossEntranceTimer = Math.min(1, bossEntranceTimer + dt * 1.2);
                } else {
                    bossTime += dt;
                }

                // Boss movement: sways during charge; in ray phase it becomes a huge launcher on the right.
                boss.bobPhase += dt * 1.4;
                boss.movePhase += dt * 0.6;
                if (bossPhase === 2) {
                    const anchorX = W - 18;
                    const anchorY = H * 0.42;
                    const targetX = anchorX + Math.sin(boss.movePhase * 2.8) * 8;
                    const targetY = anchorY + Math.sin(boss.bobPhase * 2.2) * 16;
                    boss.x += (targetX - boss.x) * Math.min(1, dt * 4.0);
                    boss.y += (targetY - boss.y) * Math.min(1, dt * 3.4);
                } else {
                    const moveRangeX = 60; // horizontal sway
                    const moveRangeY = 55; // vertical bob
                    boss.x = boss.baseX + Math.sin(boss.movePhase) * moveRangeX;
                    boss.y = boss.baseY + Math.sin(boss.bobPhase) * moveRangeY;
                }
                // Keep boss from overlapping the bird area
                if (boss.x < W * 0.55) boss.x = W * 0.55;

                boss.wingTimer += dt;
                const bossWingSpeed = bossPhase === 2 ? 0.075 : 0.11;
                if (boss.wingTimer > bossWingSpeed) { boss.wingTimer = 0; boss.wing = (boss.wing + 1) % 3; }

                // Boss crece desde el segundo 0 hasta el minuto 1.
                const growProgress = Math.min(1, bossTime / BOSS_RAY_PHASE_AT);
                boss.targetScale = 1.0 + growProgress * (BOSS_RAY_SCALE - 1.0);
                boss.scale += (boss.targetScale - boss.scale) * dt * 2.5;

                // Tres segundos antes de los rayos desaparece la animacion de tubos.
                if (
                    bossPhase === 1 &&
                    !bossPipeFadeStarted &&
                    bossTime >= BOSS_RAY_PHASE_AT - BOSS_PIPE_FADE_BEFORE_RAYS
                ) {
                    bossPipeFadeStarted = true;
                    pipesFadingOut = true;
                }

                // A los 60s: empieza la fase de rayos con tubos mas anchos.
                if (bossTime >= BOSS_RAY_PHASE_AT && bossPhase === 1) {
                    bossPhase = 2;
                    pipesFadingOut = false;
                    spawnTimer = PIPE_INTERVAL;
                    raySpawnTimer = 0.7;
                    screenShake = 0.85;
                    sfx.bossRoar();
                }

                // Spawnear rayos durante phase 2
                if (bossPhase === 2) {
                    raySpawnTimer -= dt;
                    if (raySpawnTimer <= 0) {
                        spawnRay();
                        raySpawnTimer = 1.4 + Math.random() * 0.6;
                    }
                }

                // Actualizar rayos existentes
                for (const r of rays) {
                    r.age += dt;
                    if (r.phase === 0 && r.age >= r.telegraphTime) {
                        r.phase = 1;
                        r.age = 0;
                        sfx.rayFire();
                        screenShake = 0.4;
                    } else if (r.phase === 1 && r.age >= r.fireTime) {
                        r.phase = 2;
                    }
                }
                rays = rays.filter(r => r.phase < 2);

                // Victoria
                if (bossTime >= BOSS_FIGHT_DURATION) {
                    state = STATE.WIN;
                    winTimer = 0;
                    pipes = [];
                    rays = [];
                    spawnConfetti();
                    sfx.win();
                    if (score > bestScore) {
                        bestScore = score;
                        localStorage.setItem('flappy_best', String(bestScore));
                    }
                }
            }

            // Colisiones
            if (bird.y + BIRD_HITBOX_R >= GROUND_Y) {
                bird.y = GROUND_Y - BIRD_HITBOX_R;
                killBird();
            } else if (bird.y - BIRD_HITBOX_R < -10) {
                bird.y = -10 + BIRD_HITBOX_R;
                bird.vy = 0;
            } else {
                for (const p of pipes) {
                    // Cuando el tubo empieza a desvanecerse, ya no es sólido
                    if (p.fadeOut !== undefined && p.fadeOut < 0.6) continue;
                    const pWidth = getPipeWidth(p);
                    if (
                        bird.x + BIRD_HITBOX_R > p.x &&
                        bird.x - BIRD_HITBOX_R < p.x + pWidth &&
                        (bird.y - BIRD_HITBOX_R < p.top || bird.y + BIRD_HITBOX_R > p.bottom)
                    ) {
                        killBird();
                        break;
                    }
                }
                // Rayos durante fase 2
                for (const r of rays) {
                    if (r.phase !== 1) continue;
                    if (distancePointToSegment(bird.x, bird.y, r.sx, r.sy, r.ex, r.ey) < BIRD_HITBOX_R + 9) {
                        killBird();
                        break;
                    }
                }
            }
        } else if (state === STATE.DEAD) {
            bird.vy += GRAVITY * dt;
            if (bird.vy > MAX_FALL_SPEED) bird.vy = MAX_FALL_SPEED;
            bird.y += bird.vy * dt;
            bird.rotation += dt * 6;
            if (bird.rotation > Math.PI / 2) bird.rotation = Math.PI / 2;

            if (bird.y + BIRD_HITBOX_R >= GROUND_Y) {
                bird.y = GROUND_Y - BIRD_HITBOX_R;
                state = STATE.GAMEOVER;
                gameOverTimer = 0;
                if (score > bestScore) {
                    bestScore = score;
                    localStorage.setItem('flappy_best', String(bestScore));
                }
            }
        } else if (state === STATE.WIN) {
            winTimer += dt;
            // El pajaro celebra y luego avanza hacia el desierto.
            if (winTimer < 1.1) {
                bird.vy += -800 * dt;
                bird.y += bird.vy * dt;
                bird.rotation = -0.4;
            } else {
                bird.bobTimer += dt;
                const travel = clamp01((winTimer - 1.1) / 2.2);
                bird.x += ((W * 0.58) - bird.x) * dt * 1.7;
                bird.y = (H * (0.38 + travel * 0.05)) + Math.sin(bird.bobTimer * 3) * 8;
                bird.vy = 0;
                bird.rotation = -0.08 + travel * 0.08;
            }
            bird.wingTimer += dt;
            if (bird.wingTimer > 0.06) { bird.wingTimer = 0; bird.wing = (bird.wing + 1) % 3; }
            // Confeti
            for (const c of confetti) {
                c.x += c.vx * dt;
                c.y += c.vy * dt;
                c.vy += 320 * dt;
                c.rotation += c.spin * dt;
                c.life += dt;
            }
            confetti = confetti.filter(c => c.y < H + 30);
            // Boss huyendo / cayendo durante la victoria
            boss.y += 200 * dt;
            boss.x += 80 * dt;
        } else if (state === STATE.GAMEOVER) {
            gameOverTimer += dt;
        }

        if (flashAlpha > 0) flashAlpha = Math.max(0, flashAlpha - dt * 3);
    }

    function killBird() {
        if (state !== STATE.PLAYING && state !== STATE.BOSS) return;
        state = STATE.DEAD;
        flashAlpha = 0.85;
        sfx.hit();
        setTimeout(() => sfx.die(), 180);
    }

    // ---------- Drawing: backgrounds ----------
    function drawSky() {
        const skyStages = [
            { top: '#4ec0ca', mid: '#7ed4dc', bot: '#bde7eb' }, // dia
            { top: '#f08a5d', mid: '#d66b7d', bot: '#ffd28f' }, // tarde
            { top: '#0c1a3a', mid: '#1f3566', bot: '#3b5a8a' }, // noche
            { top: '#5da7cc', mid: '#92c7d4', bot: '#ffd3a0' }  // manana
        ];
        const cycle = cycleInfo();
        const cur = skyStages[cycle.from];
        const next = skyStages[cycle.to];
        const top = mixHex(cur.top, next.top, cycle.blend);
        const mid = mixHex(cur.mid, next.mid, cycle.blend);
        const bot = mixHex(cur.bot, next.bot, cycle.blend);

        const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
        g.addColorStop(0, top);
        g.addColorStop(0.6, mid);
        g.addColorStop(1, bot);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, GROUND_Y);
    }

    // Stars (night only)
    function drawStars() {
        const n = nightLevel();
        if (n <= 0.05) return;
        ctx.save();
        const offset = starsOffset;
        for (let i = 0; i < 60; i++) {
            const sx = (i * 73 + offset * 8) % W;
            const sy = (i * 37) % (GROUND_Y - 200);
            const tw = (Math.sin(performance.now() / 600 + i) + 1) / 2;
            ctx.globalAlpha = n * (0.4 + tw * 0.6);
            ctx.fillStyle = i % 7 === 0 ? '#ffe9b3' : '#ffffff';
            ctx.fillRect(Math.floor(sx), Math.floor(sy), 2, 2);
        }
        ctx.restore();
    }

    // Sun / Moon
    function drawCelestial() {
        ctx.save();
        const n = nightLevel();
        const d = duskLevel();
        const dawn = dawnLevel();
        const stage = cycleStage();
        const sunT = stage < 2 ? stage / 2 : Math.max(0, stage - 3) * 0.35;
        const moonT = clamp01((stage - 1.55) / 1.7);
        const sunX = W - 95 - sunT * 130;
        const sunY = 115 + Math.sin(sunT * Math.PI) * 55 + d * 42 - dawn * 22;
        const moonX = W - 70 - moonT * 170;
        const moonY = 95 + Math.sin(moonT * Math.PI) * 45;

        if (n > 0.15) {
            const cx = moonX, cy = moonY;
            ctx.globalAlpha = n;
            // Moon glow
            const grd = ctx.createRadialGradient(cx, cy, 10, cx, cy, 80);
            grd.addColorStop(0, 'rgba(255,255,220,0.35)');
            grd.addColorStop(1, 'rgba(255,255,220,0)');
            ctx.fillStyle = grd;
            ctx.fillRect(cx - 80, cy - 80, 160, 160);
            // Moon
            ctx.fillStyle = '#fff5cc';
            ctx.beginPath(); ctx.arc(cx, cy, 32, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#0c1a3a';
            ctx.beginPath(); ctx.arc(cx - 12, cy - 6, 28, 0, Math.PI * 2); ctx.fill();
            // Craters
            ctx.fillStyle = '#e3d9a8';
            ctx.beginPath(); ctx.arc(cx + 14, cy + 8, 4, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx + 8, cy - 12, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx + 22, cy - 4, 2, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
        }
        const sunAlpha = Math.max(0, stage < 2 ? 1 - n * 0.85 : dawn * 0.95);
        if (sunAlpha > 0.05) {
            const cx = sunX, cy = sunY;
            ctx.globalAlpha = sunAlpha;
            // Sun glow
            const grd = ctx.createRadialGradient(cx, cy, 10, cx, cy, 100);
            grd.addColorStop(0, 'rgba(255,250,200,0.45)');
            grd.addColorStop(1, 'rgba(255,250,200,0)');
            ctx.fillStyle = grd;
            ctx.fillRect(cx - 100, cy - 100, 200, 200);
            ctx.fillStyle = '#fff7c0';
            ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffe066';
            ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
        }
        ctx.restore();
    }

    const cloudSpriteCache = {};

    function buildCloudSprite(night) {
        const key = night ? 'night' : 'day';
        if (cloudSpriteCache[key]) return cloudSpriteCache[key];
        const off = makePixelCanvas(160, 80);
        const x = off.ctx;
        const cx = 80, cy = 40;
        const col = night ? '#5a6c8c' : '#ffffff';
        const shade = night ? '#3d4f74' : '#d8f6f8';
        const hi = night ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.72)';

        x.fillStyle = col;
        x.beginPath();
        x.moveTo(cx - 54, cy + 18);
        x.bezierCurveTo(cx - 62, cy - 2, cx - 41, cy - 21, cx - 18, cy - 13);
        x.bezierCurveTo(cx - 8, cy - 35, cx + 27, cy - 36, cx + 35, cy - 11);
        x.bezierCurveTo(cx + 58, cy - 17, cx + 79, cy + 2, cx + 68, cy + 22);
        x.lineTo(cx - 42, cy + 24);
        x.bezierCurveTo(cx - 50, cy + 24, cx - 55, cy + 21, cx - 54, cy + 18);
        x.fill();

        x.fillStyle = shade;
        x.beginPath();
        x.moveTo(cx - 38, cy + 15);
        x.bezierCurveTo(cx - 6, cy + 21, cx + 33, cy + 18, cx + 66, cy + 20);
        x.lineTo(cx + 60, cy + 27);
        x.lineTo(cx - 44, cy + 27);
        x.closePath();
        x.fill();

        x.fillStyle = hi;
        x.fillRect(cx - 20, cy - 22, 28, 5);
        x.fillRect(cx + 15, cy - 18, 22, 4);
        x.fillRect(cx - 45, cy - 5, 16, 4);

        cloudSpriteCache[key] = off.canvas;
        return off.canvas;
    }

    function drawClouds() {
        ctx.save();
        const n = nightLevel();
        const daySprite = buildCloudSprite(false);
        const nightSprite = buildCloudSprite(true);
        function drawRows(sprite, alphaScale) {
            // Far clouds (faded, slow)
            ctx.globalAlpha = (0.55 - n * 0.3) * alphaScale;
            for (let i = -1; i < 4; i++) {
                const x = (((i * 240) - cloudOffset * 0.6) % (W + 240) + (W + 240)) % (W + 240) - 120;
                cloudShape(sprite, x + 60, 230 + Math.sin(cloudOffset * 0.02 + i) * 3, 0.7);
            }
            // Near clouds (bigger, faster, brighter)
            ctx.globalAlpha = (0.95 - n * 0.45) * alphaScale;
            for (let i = -1; i < 3; i++) {
                const x = (((i * 280) - cloudOffset * 1.0 + 80) % (W + 280) + (W + 280)) % (W + 280) - 140;
                cloudShape(sprite, x + 60, 150 + Math.sin(cloudOffset * 0.025 + i * 1.7) * 4, 1.0);
            }
        }
        drawRows(daySprite, 1 - n);
        drawRows(nightSprite, n);
        ctx.restore();
    }

    function cloudShape(sprite, x, y, scale) {
        ctx.drawImage(sprite, x - 80 * scale, y - 40 * scale, 160 * scale, 80 * scale);
    }

    // Distant city silhouette layer
    function drawCity() {
        const baseY = GROUND_Y - 8;
        ctx.save();
        // Far city
        ctx.fillStyle = isNight ? '#1a2a48' : '#7e9bb0';
        const offFar = cityOffset * 0.4;
        for (let x = -((offFar) % 80) - 80; x < W + 80; x += 80) {
            const heights = [70, 95, 55, 110, 80, 65];
            for (let i = 0; i < 6; i++) {
                const bx = x + i * 14;
                const bh = heights[i];
                ctx.fillRect(bx, baseY - bh, 14, bh);
                // Roof step
                ctx.fillRect(bx + 3, baseY - bh - 4, 8, 4);
            }
        }
        // Lit windows (night)
        if (isNight) {
            ctx.fillStyle = '#ffd76a';
            for (let i = 0; i < 80; i++) {
                const wx = ((i * 53 - offFar * 0.4) % (W + 80)) - 40;
                const wy = baseY - 30 - (i * 17) % 70;
                if ((i * 7 + Math.floor(performance.now() / 1000)) % 5 !== 0) {
                    ctx.fillRect(Math.floor(wx), Math.floor(wy), 2, 3);
                }
            }
        }

        // Near city (taller, darker)
        ctx.fillStyle = isNight ? '#0c1a30' : '#5a7a8e';
        const offNear = cityOffset * 0.9;
        for (let x = -((offNear) % 110) - 110; x < W + 110; x += 110) {
            const heights = [55, 80, 110, 70, 95, 60, 85];
            for (let i = 0; i < 7; i++) {
                const bx = x + i * 16;
                const bh = heights[i];
                ctx.fillRect(bx, baseY - bh, 16, bh);
                ctx.fillRect(bx + 4, baseY - bh - 5, 8, 5);
            }
        }
        // Lit near windows
        if (isNight) {
            ctx.fillStyle = '#ffe08a';
            for (let i = 0; i < 100; i++) {
                const wx = ((i * 41 - offNear * 0.9) % (W + 110)) - 55;
                const wy = baseY - 20 - (i * 13) % 90;
                if ((i * 11) % 4 !== 0) {
                    ctx.fillRect(Math.floor(wx), Math.floor(wy), 3, 3);
                }
            }
        }
        ctx.restore();
    }

    // Bushes/trees front layer
    const bushSpriteCache = {};

    function buildBushSprite(night) {
        const key = night ? 'night' : 'day';
        if (bushSpriteCache[key]) return bushSpriteCache[key];
        const off = makePixelCanvas(80, 48);
        const x = off.ctx;
        const baseY = 46;
        const dark = night ? '#17391f' : '#4f9457';
        const mid = night ? '#1f4a2a' : '#5fa66a';
        const light = night ? '#2a663b' : '#7dd24a';
        const blade = night ? '#244f2e' : '#67bd3f';

        x.fillStyle = dark;
        x.beginPath();
        x.moveTo(0, baseY);
        x.lineTo(8, baseY - 17);
        x.lineTo(21, baseY - 31);
        x.lineTo(36, baseY - 24);
        x.lineTo(48, baseY - 39);
        x.lineTo(67, baseY - 22);
        x.lineTo(80, baseY);
        x.closePath();
        x.fill();

        x.fillStyle = mid;
        x.beginPath();
        x.moveTo(6, baseY);
        x.lineTo(17, baseY - 26);
        x.lineTo(33, baseY - 34);
        x.lineTo(43, baseY - 20);
        x.lineTo(59, baseY - 31);
        x.lineTo(73, baseY);
        x.closePath();
        x.fill();

        x.fillStyle = light;
        x.fillRect(24, baseY - 31, 12, 10);
        x.fillRect(53, baseY - 26, 9, 8);

        x.strokeStyle = blade;
        x.lineWidth = 3;
        for (let i = 0; i < 5; i++) {
            const gx = 7 + i * 14;
            const gh = 12 + (i % 3) * 4;
            x.beginPath();
            x.moveTo(gx, baseY + 2);
            x.lineTo(gx + (i % 2 === 0 ? 2 : -2), baseY - gh);
            x.stroke();
        }

        bushSpriteCache[key] = off.canvas;
        return off.canvas;
    }

    function drawBushes() {
        const baseY = GROUND_Y - 4;
        ctx.save();
        const off = bushOffset;
        const n = nightLevel();
        const daySprite = buildBushSprite(false);
        const nightSprite = buildBushSprite(true);
        for (let x = -((off) % 70) - 70; x < W + 70; x += 70) {
            const y = baseY + Math.sin((x + off) * 0.02) * 2;
            ctx.globalAlpha = 1 - n;
            ctx.drawImage(daySprite, Math.round(x), Math.round(y - 46), 80, 48);
            ctx.globalAlpha = n;
            ctx.drawImage(nightSprite, Math.round(x), Math.round(y - 46), 80, 48);
        }
        ctx.restore();
    }

    function desertProgress() {
        return state === STATE.WIN ? clamp01((winTimer - 1.15) / 2.2) : 0;
    }

    function drawDesertScenery(alpha) {
        if (alpha <= 0) return;
        const baseY = GROUND_Y - 6;
        ctx.save();
        ctx.globalAlpha = alpha;

        // Dunas lejanas.
        ctx.fillStyle = isNight ? '#5f4a2d' : '#d9b66d';
        for (let x = -80 - (cityOffset * 0.25 % 160); x < W + 160; x += 160) {
            ctx.beginPath();
            ctx.moveTo(x, baseY);
            ctx.quadraticCurveTo(x + 80, baseY - 70, x + 170, baseY);
            ctx.closePath();
            ctx.fill();
        }

        // Piramides pixel-art en el fondo.
        const pyr = [
            { x: 55 - cityOffset * 0.18 % 520, w: 150, h: 110 },
            { x: 255 - cityOffset * 0.12 % 560, w: 210, h: 145 },
            { x: 430 - cityOffset * 0.16 % 620, w: 130, h: 95 }
        ];
        for (const p of pyr) {
            let px0 = ((p.x % (W + 260)) + (W + 260)) % (W + 260) - 130;
            ctx.fillStyle = isNight ? '#80643c' : '#d2a95f';
            ctx.beginPath();
            ctx.moveTo(px0, baseY);
            ctx.lineTo(px0 + p.w / 2, baseY - p.h);
            ctx.lineTo(px0 + p.w, baseY);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = isNight ? '#5c472d' : '#b18448';
            ctx.beginPath();
            ctx.moveTo(px0 + p.w / 2, baseY - p.h);
            ctx.lineTo(px0 + p.w, baseY);
            ctx.lineTo(px0 + p.w * 0.62, baseY);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = isNight ? 'rgba(40,25,15,0.45)' : 'rgba(95,64,32,0.35)';
            ctx.lineWidth = 2;
            for (let y = 18; y < p.h; y += 18) {
                ctx.beginPath();
                ctx.moveTo(px0 + p.w * 0.5 - y * 0.7, baseY - p.h + y);
                ctx.lineTo(px0 + p.w * 0.5 + y * 0.7, baseY - p.h + y);
                ctx.stroke();
            }
        }

        // Camellos muy lejanos en silueta.
        ctx.fillStyle = isNight ? '#2d241b' : '#7c5a36';
        for (let i = 0; i < 4; i++) {
            const cx = ((i * 170 - cityOffset * 0.35) % (W + 180) + W + 180) % (W + 180) - 90;
            const cy = baseY - 28 - (i % 2) * 10;
            ctx.fillRect(cx, cy, 24, 8);
            ctx.fillRect(cx + 5, cy - 7, 7, 7);
            ctx.fillRect(cx + 21, cy - 4, 8, 5);
            ctx.fillRect(cx + 3, cy + 8, 3, 10);
            ctx.fillRect(cx + 18, cy + 8, 3, 10);
            ctx.fillRect(cx + 28, cy - 10, 3, 11);
        }

        // Columnas/tubos egipcios de fondo para anticipar el segundo mundo.
        for (let x = -90 - (cityOffset * 0.7 % 190); x < W + 190; x += 190) {
            const h = 90 + ((x + 320) % 3) * 28;
            drawEgyptColumn(x, baseY - h, 42, h);
        }
        ctx.restore();
    }

    function drawEgyptColumn(x, y, w, h) {
        ctx.fillStyle = isNight ? '#8d6b3e' : '#d8aa58';
        ctx.fillRect(x, y + 16, w, h - 16);
        ctx.fillStyle = isNight ? '#5d452c' : '#9f733d';
        ctx.fillRect(x, y + 16, 3, h - 16);
        ctx.fillRect(x + w - 3, y + 16, 3, h - 16);
        ctx.fillStyle = isNight ? '#b08b52' : '#f0cd7b';
        ctx.fillRect(x + 8, y + 20, 4, h - 24);
        ctx.fillStyle = '#2d5f75';
        ctx.fillRect(x + 5, y + 28, w - 10, 4);
        ctx.fillStyle = '#b33a35';
        ctx.fillRect(x + 5, y + 42, w - 10, 4);
        ctx.fillStyle = isNight ? '#7b5b35' : '#c8964e';
        ctx.fillRect(x - 6, y, w + 12, 18);
        ctx.fillRect(x - 10, y + h - 8, w + 20, 8);
        ctx.strokeStyle = '#4d331d';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 6, y, w + 12, 18);
    }

    function drawDesertPipeOrnaments(x, top, bottom, width) {
        ctx.save();
        ctx.fillStyle = '#d8aa58';
        ctx.fillRect(x + 8, Math.max(12, top - 22), width - 16, 4);
        ctx.fillRect(x + 8, bottom + 18, width - 16, 4);
        ctx.fillStyle = '#2d5f75';
        ctx.fillRect(x + 14, Math.max(18, top - 16), 10, 4);
        ctx.fillRect(x + width - 28, bottom + 24, 10, 4);
        ctx.fillStyle = '#b33a35';
        ctx.fillRect(x + width / 2 - 6, Math.max(24, top - 10), 12, 4);
        ctx.fillRect(x + width / 2 - 6, bottom + 30, 12, 4);
        ctx.restore();
    }

    function drawPipe(p) {
        const fade = p.fadeOut !== undefined ? p.fadeOut : 1.0;
        const pWidth = getPipeWidth(p);
        ctx.save();
        ctx.globalAlpha = fade;
        // Cuando se desvanecen, escalan ligeramente hacia adentro y se difuminan
        const scale = 0.6 + 0.4 * fade;
        const cx = p.x + pWidth / 2;
        ctx.translate(cx, 0);
        ctx.scale(scale, 1);
        ctx.translate(-cx, 0);

        // Top pipe
        const topBodyH = p.top - PIPE_CAP_H;
        if (topBodyH > 0) {
            ctx.drawImage(pipeSprite.body, 0, 0, PIPE_WIDTH, 1, p.x, 0, pWidth, topBodyH);
            ctx.fillStyle = '#243f0e';
            ctx.fillRect(p.x, 0, 2, topBodyH);
            ctx.fillRect(p.x + pWidth - 2, 0, 2, topBodyH);
        }
        ctx.drawImage(pipeSprite.cap, p.x - 4, p.top - PIPE_CAP_H, pWidth + 8, PIPE_CAP_H);

        // Bottom pipe
        ctx.drawImage(pipeSprite.cap, p.x - 4, p.bottom, pWidth + 8, PIPE_CAP_H);
        const botY = p.bottom + PIPE_CAP_H;
        const botH = GROUND_Y - botY;
        if (botH > 0) {
            ctx.drawImage(pipeSprite.body, 0, 0, PIPE_WIDTH, 1, p.x, botY, pWidth, botH);
            ctx.fillStyle = '#243f0e';
            ctx.fillRect(p.x, botY, 2, botH);
            ctx.fillRect(p.x + pWidth - 2, botY, 2, botH);
        }

        if (state === STATE.WIN) drawDesertPipeOrnaments(p.x, p.top, p.bottom, pWidth);
        ctx.restore();
    }

    function drawBoss() {
        if (!bossActive && state !== STATE.WIN) return;
        const sc = state === STATE.WIN ? 1.0 : boss.scale;
        const sw = BOSS_SPRITE_W * BOSS_PIXEL * sc;
        const sh = BOSS_SPRITE_H * BOSS_PIXEL * sc;
        // Animación de entrada: aparece desde la derecha
        const entrance = Math.min(1, bossEntranceTimer);
        const ease = 1 - Math.pow(1 - entrance, 3);
        const drawX = state === STATE.WIN ? boss.x : (W + sw) - ease * ((W + sw) - boss.x);
        const flapT = performance.now() / (bossPhase === 2 ? 85 : 130);
        const drawY = boss.y + Math.sin(flapT) * 2.5 * sc;
        const tilt = state === STATE.WIN ? 0 : Math.sin(boss.movePhase * 1.6) * 0.035;

        ctx.save();
        // Aura roja pulsante (scales with boss)
        const auraPulse = 0.6 + Math.sin(performance.now() / 250) * 0.2;
        const auraR = sw * 0.85 * auraPulse;
        const aura = ctx.createRadialGradient(drawX, drawY, 10, drawX, drawY, auraR);
        aura.addColorStop(0, 'rgba(230, 57, 70, 0.45)');
        aura.addColorStop(0.5, 'rgba(138, 63, 191, 0.25)');
        aura.addColorStop(1, 'rgba(138, 63, 191, 0)');
        ctx.fillStyle = aura;
        ctx.fillRect(drawX - auraR, drawY - auraR, auraR * 2, auraR * 2);

        // Sombra debajo del jefe
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(drawX, drawY + sh * 0.4, sw * 0.4, 8 * sc, 0, 0, Math.PI * 2);
        ctx.fill();

        // Sprite del jefe (scaled)
        ctx.save();
        ctx.translate(drawX, drawY);
        ctx.rotate(tilt);
        ctx.drawImage(bossFrames[boss.wing], -sw / 2, -sh / 2, sw, sh);
        ctx.restore();

        // Brillo en los ojos cuando está cargando un rayo
        if (boss.eyeGlow > 0) {
            const glowR = 20 + boss.eyeGlow * 18;
            const eyeX = drawX - sw * 0.32;
            const eyeY = drawY - sh * 0.08;
            const eyeGlow = ctx.createRadialGradient(eyeX, eyeY, 2, eyeX, eyeY, glowR);
            eyeGlow.addColorStop(0, 'rgba(255, 80, 90, ' + (boss.eyeGlow * 0.9) + ')');
            eyeGlow.addColorStop(1, 'rgba(255, 80, 90, 0)');
            ctx.fillStyle = eyeGlow;
            ctx.fillRect(eyeX - glowR, eyeY - glowR, glowR * 2, glowR * 2);
        }
        ctx.restore();
    }

    function drawRays() {
        if (!rays.length) return;
        ctx.save();
        for (const r of rays) {
            if (r.phase === 0) {
                // Telegraph: apunta desde la boca/ojo del jefe, nunca desde la nada.
                const t = r.age / r.telegraphTime;
                const blink = (Math.sin(r.age * 30) + 1) / 2;
                ctx.strokeStyle = 'rgba(255, 60, 80, ' + (0.4 + blink * 0.5) + ')';
                ctx.lineWidth = 2 + t * 2;
                ctx.setLineDash([8, 6]);
                ctx.beginPath();
                ctx.moveTo(r.sx, r.sy);
                ctx.lineTo(r.ex, r.ey);
                ctx.stroke();
                ctx.setLineDash([]);
                // Indicador de carga en el origen
                ctx.fillStyle = 'rgba(255, 80, 100, ' + (0.5 + t * 0.5) + ')';
                ctx.beginPath();
                ctx.arc(r.sx, r.sy, 5 + t * 8, 0, Math.PI * 2);
                ctx.fill();
            } else if (r.phase === 1) {
                // Disparo: rayo grueso brillante, anchura decreciente con el tiempo
                const t = r.age / r.fireTime;
                const thickness = 28 * (1 - t * 0.4);
                ctx.lineCap = 'round';
                ctx.strokeStyle = 'rgba(255, 80, 100, 0.38)';
                ctx.lineWidth = thickness * 1.9;
                ctx.beginPath();
                ctx.moveTo(r.sx, r.sy);
                ctx.lineTo(r.ex, r.ey);
                ctx.stroke();
                ctx.strokeStyle = '#ff5160';
                ctx.lineWidth = thickness * 0.72;
                ctx.beginPath();
                ctx.moveTo(r.sx, r.sy);
                ctx.lineTo(r.ex, r.ey);
                ctx.stroke();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = Math.max(3, thickness * 0.18);
                ctx.beginPath();
                ctx.moveTo(r.sx, r.sy);
                ctx.lineTo(r.ex, r.ey);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    function drawConfetti() {
        ctx.save();
        for (const c of confetti) {
            ctx.save();
            ctx.translate(c.x, c.y);
            ctx.rotate(c.rotation);
            ctx.fillStyle = c.color;
            ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
            ctx.restore();
        }
        ctx.restore();
    }

    function drawGround() {
        const desert = desertProgress();
        // Sand base
        const g = ctx.createLinearGradient(0, GROUND_Y, 0, H);
        if (desert > 0.5) {
            g.addColorStop(0, isNight ? '#8a6a36' : '#e2bd66');
            g.addColorStop(1, isNight ? '#5c4528' : '#c99648');
        } else if (isNight) {
            g.addColorStop(0, '#7a6e3a');
            g.addColorStop(1, '#4d452a');
        } else {
            g.addColorStop(0, '#ded895');
            g.addColorStop(1, '#c1b66a');
        }
        ctx.fillStyle = g;
        ctx.fillRect(0, GROUND_Y, W, GROUND_HEIGHT);

        // Grass strip top
        ctx.fillStyle = desert > 0.5 ? (isNight ? '#6f552d' : '#d7a84d') : (isNight ? '#3d6e1a' : '#7dd24a');
        ctx.fillRect(0, GROUND_Y, W, 14);
        ctx.fillStyle = desert > 0.5 ? (isNight ? '#3d2f22' : '#a86f35') : (isNight ? '#244412' : '#5fa83a');
        ctx.fillRect(0, GROUND_Y + 14, W, 4);

        // Diagonal hatch
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, GROUND_Y + 22, W, GROUND_HEIGHT - 22);
        ctx.clip();
        ctx.strokeStyle = isNight ? 'rgba(40,30,15,0.55)' : 'rgba(160, 138, 60, 0.55)';
        ctx.lineWidth = 2;
        for (let x = -groundOffset - 40; x < W + 40; x += 12) {
            ctx.beginPath();
            ctx.moveTo(x, GROUND_Y + 22);
            ctx.lineTo(x + 16, H);
            ctx.stroke();
        }
        ctx.restore();

        ctx.strokeStyle = isNight ? '#2a2410' : '#9a8d3e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, GROUND_Y + 22);
        ctx.lineTo(W, GROUND_Y + 22);
        ctx.stroke();
    }

    function drawBird() {
        const sprite = birdFrames[bird.wing];
        const sw = BIRD_SPRITE_W * BIRD_PIXEL;
        const sh = BIRD_SPRITE_H * BIRD_PIXEL;
        ctx.save();
        ctx.translate(bird.x, bird.y);
        ctx.rotate(bird.rotation);
        // Soft shadow
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(0, sh / 2 - 2, sw * 0.45, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        // Sprite (centered)
        ctx.drawImage(sprite, -sw / 2, -sh / 2, sw, sh);
        ctx.restore();
    }

    // ---------- Text helpers ----------
    function drawTextWithShadow(text, x, y, size, color = '#fff', align = 'center') {
        ctx.font = `bold ${size}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = align;
        ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(3, size / 6);
        ctx.strokeStyle = '#3a2a1a';
        ctx.fillStyle = color;
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
    }

    function drawScore(num, x, y, size) {
        drawTextWithShadow(String(num), x, y, size, '#ffffff', 'center');
    }

    // ---------- UI overlays ----------
    function drawReadyScreen() {
        drawTextWithShadow('Flappy Bird', W / 2, 130, 56, '#ffd34d');

        const cx = W / 2, cy = 320;
        drawTextWithShadow('¿Listo?', cx, cy - 30, 38, '#ffffff');

        ctx.save();
        ctx.translate(cx, cy + 60);
        const pulse = 1 + Math.sin(performance.now() / 250) * 0.06;
        ctx.scale(pulse, pulse);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.strokeStyle = '#3a2a1a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#3a2a1a';
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(10, 4);
        ctx.lineTo(4, 4);
        ctx.lineTo(4, 14);
        ctx.lineTo(-4, 14);
        ctx.lineTo(-4, 4);
        ctx.lineTo(-10, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        drawTextWithShadow('Toca / Espacio para volar', W / 2, cy + 130, 22, '#ffffff');

        if (bestScore > 0) {
            drawTextWithShadow('Récord: ' + bestScore, W / 2, cy + 170, 20, '#ffd34d');
        }
    }

    function drawHUDScore() {
        if (state === STATE.PLAYING || state === STATE.DEAD) {
            drawScore(score, W / 2, 80, 64);
        } else if (state === STATE.BOSS) {
            // Barra de espera: primero carga 1 minuto, luego sobrevives 30s de rayos.
            const phaseRemaining = bossPhase === 1
                ? Math.max(0, BOSS_RAY_PHASE_AT - bossTime)
                : Math.max(0, BOSS_FIGHT_DURATION - bossTime);
            const remaining = phaseRemaining;
            const mm = Math.floor(remaining / 60);
            const ss = Math.floor(remaining % 60);
            const timeStr = mm + ':' + String(ss).padStart(2, '0');
            // Texto JEFE FINAL
            drawTextWithShadow(bossPhase === 1 ? 'JEFE FINAL' : 'RAYOS', W / 2, 50, 32, '#ff5160');
            // Barra
            const barW = 320, barH = 14;
            const bx = W / 2 - barW / 2, by = 78;
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            roundedRect(bx - 2, by - 2, barW + 4, barH + 4, 4);
            ctx.fill();
            const pct = bossPhase === 1
                ? bossTime / BOSS_RAY_PHASE_AT
                : (bossTime - BOSS_RAY_PHASE_AT) / (BOSS_FIGHT_DURATION - BOSS_RAY_PHASE_AT);
            const fillW = barW * Math.min(1, pct);
            const barGrad = ctx.createLinearGradient(bx, 0, bx + barW, 0);
            barGrad.addColorStop(0, '#ff5160');
            barGrad.addColorStop(0.5, '#ff9c1a');
            barGrad.addColorStop(1, '#ffd34d');
            ctx.fillStyle = barGrad;
            roundedRect(bx, by, fillW, barH, 3);
            ctx.fill();
            // Tiempo restante
            drawTextWithShadow(timeStr, W / 2, by + barH / 2 + 28, 22, '#ffffff');
            // Score keeps showing during boss fight
            drawScore(score, W / 2, by + barH / 2 + 62, 40);
            // Aviso "RAYOS!" cuando entra phase 2
            if (bossPhase === 2) {
                const pulse = (Math.sin(performance.now() / 120) + 1) / 2;
                ctx.globalAlpha = 0.65 + pulse * 0.35;
                drawTextWithShadow('¡ESQUIVA LOS RAYOS!', W / 2, by + barH / 2 + 105, 26, '#ff5160');
                ctx.globalAlpha = 1;
            }
        }
    }

    function drawWinScreen() {
        // Fondo difuminado dorado
        ctx.save();
        const fadeAlpha = Math.min(1, winTimer * 0.8);
        ctx.fillStyle = 'rgba(0,0,0,' + (fadeAlpha * 0.45) + ')';
        ctx.fillRect(0, 0, W, H);
        // Brillo radial central
        const gleam = ctx.createRadialGradient(W / 2, H * 0.45, 30, W / 2, H * 0.45, W * 0.7);
        gleam.addColorStop(0, 'rgba(255, 230, 120, ' + (fadeAlpha * 0.55) + ')');
        gleam.addColorStop(1, 'rgba(255, 230, 120, 0)');
        ctx.fillStyle = gleam;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();

        // Confeti (debajo del título)
        drawConfetti();

        // Título "¡VICTORIA!" con animación
        const titleScale = 1 + Math.sin(performance.now() / 380) * 0.04;
        const titleY = 130 + (winTimer < 0.6 ? -50 + winTimer * 80 : 0);
        ctx.save();
        ctx.translate(W / 2, titleY);
        ctx.scale(titleScale, titleScale);
        drawTextWithShadow('¡VICTORIA!', 0, 0, 64, '#ffd34d');
        ctx.restore();

        drawTextWithShadow(winTimer > 1.2 ? 'Rumbo al desierto' : 'Has derrotado al jefe final', W / 2, 185, 20, '#ffffff');

        // Panel de logros (aparece tras 0.8s)
        if (winTimer > 0.8) {
            const ay = Math.min(255, 255 - (1 - Math.min(1, (winTimer - 0.8) * 2)) * 40);
            ctx.save();
            ctx.globalAlpha = Math.min(1, (winTimer - 0.8) * 2);

            const px0 = W / 2 - 175;
            const py = ay;
            const pw = 350;
            const ph = 270;

            roundedRect(px0, py, pw, ph, 14);
            const panelG = ctx.createLinearGradient(0, py, 0, py + ph);
            panelG.addColorStop(0, 'rgba(34, 28, 18, 0.92)');
            panelG.addColorStop(1, 'rgba(60, 45, 25, 0.92)');
            ctx.fillStyle = panelG;
            ctx.fill();
            ctx.strokeStyle = '#ffd34d';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Encabezado
            ctx.font = 'bold 18px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffd34d';
            ctx.fillText('★ LOGROS DESBLOQUEADOS ★', W / 2, py + 28);

            // Lista de logros
            const achievements = [
                { icon: '🏆', text: 'Dominaste tubos animados (120+ pts)' },
                { icon: '👑', text: 'Convocaste al jefe (150+ pts)' },
                { icon: '⚔', text: 'Sobreviviste 1:30 al jefe' },
                { icon: '⚡', text: 'Esquivaste todos los rayos' },
                { icon: '🎖', text: 'Puntuación: ' + score + (score === bestScore ? '  (¡Récord!)' : '') }
            ];
            ctx.font = '15px "Segoe UI", sans-serif';
            ctx.textAlign = 'left';
            for (let i = 0; i < achievements.length; i++) {
                const reveal = Math.min(1, (winTimer - 1.2 - i * 0.15) * 3);
                if (reveal <= 0) continue;
                ctx.globalAlpha = reveal * Math.min(1, (winTimer - 0.8) * 2);
                const ay2 = py + 60 + i * 32;
                ctx.fillStyle = '#ffd34d';
                ctx.font = 'bold 18px "Segoe UI Emoji", "Segoe UI", sans-serif';
                ctx.fillText(achievements[i].icon, px0 + 20, ay2);
                ctx.fillStyle = '#ffffff';
                ctx.font = '14px "Segoe UI", sans-serif';
                ctx.fillText(achievements[i].text, px0 + 50, ay2);
            }
            ctx.restore();
        }

        // Botón JUGAR DE NUEVO
        if (winTimer > 1.8) {
            const bx = W / 2 - 90, by = H - 130, bw = 180, bh = 52;
            const hover = (Math.sin(performance.now() / 350) + 1) / 2;
            ctx.save();
            roundedRect(bx, by, bw, bh, 12);
            const bg = ctx.createLinearGradient(0, by, 0, by + bh);
            bg.addColorStop(0, '#ffd34d');
            bg.addColorStop(1, '#f57c00');
            ctx.fillStyle = bg;
            ctx.fill();
            ctx.strokeStyle = '#7a3e00';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
            ctx.globalAlpha = 0.7 + hover * 0.3;
            drawTextWithShadow('▶ JUGAR DE NUEVO', W / 2, by + bh / 2 + 1, 20, '#ffffff');
            ctx.globalAlpha = 1;
        }
    }

    function drawGameOver() {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(0, 0, W, H);

        const titleY = 160 + Math.min(0, -30 + gameOverTimer * 80);
        drawTextWithShadow('Game Over', W / 2, titleY, 52, '#ff5252');

        const px0 = W / 2 - 140;
        const py = 240;
        const pw = 280;
        const ph = 200;

        ctx.save();
        roundedRect(px0, py, pw, ph, 14);
        const panelG = ctx.createLinearGradient(0, py, 0, py + ph);
        panelG.addColorStop(0, '#fff5d2');
        panelG.addColorStop(1, '#f0ddb0');
        ctx.fillStyle = panelG;
        ctx.fill();
        ctx.strokeStyle = '#a78b3e';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();

        drawMedal(px0 + 60, py + 100, score);

        ctx.font = 'bold 16px "Segoe UI", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#a55a16';
        ctx.fillText('PUNTOS', px0 + pw - 24, py + 50);
        ctx.fillText('RÉCORD', px0 + pw - 24, py + 120);

        ctx.font = 'bold 28px "Segoe UI", sans-serif';
        ctx.fillStyle = '#3a2a1a';
        ctx.fillText(String(score), px0 + pw - 24, py + 78);
        ctx.fillText(String(bestScore), px0 + pw - 24, py + 148);

        if (score === bestScore && bestScore > 0) {
            ctx.save();
            ctx.translate(px0 + pw - 80, py + 120);
            ctx.rotate(-0.18);
            ctx.fillStyle = '#ff5252';
            roundedRect(-30, -10, 60, 20, 4);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('¡NUEVO!', 0, 0);
            ctx.restore();
        }

        if (gameOverTimer > 0.6) {
            const bx = W / 2 - 80, by = py + ph + 30, bw = 160, bh = 50;
            const hover = (Math.sin(performance.now() / 350) + 1) / 2;
            ctx.save();
            roundedRect(bx, by, bw, bh, 10);
            const bg = ctx.createLinearGradient(0, by, 0, by + bh);
            bg.addColorStop(0, '#ffb74d');
            bg.addColorStop(1, '#f57c00');
            ctx.fillStyle = bg;
            ctx.fill();
            ctx.strokeStyle = '#7a3e00';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();

            ctx.globalAlpha = 0.7 + hover * 0.3;
            drawTextWithShadow('▶ JUGAR', W / 2, by + bh / 2 + 1, 22, '#ffffff');
            ctx.globalAlpha = 1;
        }
    }

    function drawMedal(cx, cy, sc) {
        let inner, outer, label;
        if (sc >= 60)      { outer = '#b9f2ff'; inner = '#7fe3ff'; label = 'PLATINO'; }
        else if (sc >= 40) { outer = '#c8a2ff'; inner = '#9b6dd7'; label = 'DIAMANTE'; }
        else if (sc >= 30) { outer = '#ffd34d'; inner = '#f5b800'; label = 'ORO'; }
        else if (sc >= 20) { outer = '#dadada'; inner = '#a4a4a4'; label = 'PLATA'; }
        else if (sc >= 10) { outer = '#d49a5b'; inner = '#a16828'; label = 'BRONCE'; }
        else if (sc >= 5)  { outer = '#8a8a8a'; inner = '#5c5c5c'; label = 'HIERRO'; }
        else               { return; }

        ctx.save();
        ctx.fillStyle = outer;
        ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = inner;
        ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        drawStar(cx, cy, 5, 11, 5);
        ctx.fillStyle = '#3a2a1a';
        ctx.font = 'bold 10px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, cx, cy + 45);
        ctx.restore();
    }

    function drawStar(cx, cy, spikes, outerR, innerR) {
        let rot = -Math.PI / 2;
        const step = Math.PI / spikes;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
        for (let i = 0; i < spikes; i++) {
            rot += step;
            ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
            rot += step;
            ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
        }
        ctx.closePath();
        ctx.fill();
    }

    function roundedRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    // ---------- Render ----------
    function render() {
        // Screen shake
        ctx.save();
        if (screenShake > 0) {
            const sx = (Math.random() - 0.5) * screenShake * 16;
            const sy = (Math.random() - 0.5) * screenShake * 16;
            ctx.translate(sx, sy);
        }

        drawSky();
        drawStars();
        drawCelestial();
        drawClouds();
        const dProg = desertProgress();
        if (dProg > 0) {
            ctx.save();
            ctx.globalAlpha = 1 - dProg;
            drawCity();
            drawBushes();
            ctx.restore();
            drawDesertScenery(dProg);
        } else {
            drawCity();
            drawBushes();
        }

        // El jefe se dibuja detrás de los tubos pero delante de la ciudad
        if (bossActive || state === STATE.WIN) drawBoss();

        for (const p of pipes) drawPipe(p);

        // Rayos por encima de tubos pero por debajo del pájaro
        drawRays();

        drawGround();
        drawBird();

        if (state === STATE.READY) drawReadyScreen();
        drawHUDScore();
        if (state === STATE.GAMEOVER) drawGameOver();
        if (state === STATE.WIN) drawWinScreen();

        if (flashAlpha > 0) {
            ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
            ctx.fillRect(0, 0, W, H);
        }
        ctx.restore();
    }

    // ---------- Loop ----------
    let lastTime = performance.now();
    function loop(now) {
        const frameMs = 1000 / targetFps;
        const elapsedMs = now - lastTime;
        if (elapsedMs < frameMs - 0.25) {
            requestAnimationFrame(loop);
            return;
        }
        let dt = elapsedMs / 1000;
        lastTime = now;
        if (dt > 0.05) dt = 0.05;
        update(dt);
        render();
        requestAnimationFrame(loop);
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (audioCtx) audioCtx.suspend();
            if (musicPlaying) activeMusicEl().pause();
        } else {
            lastTime = performance.now();
            if (audioCtx) audioCtx.resume();
            if (musicPlaying) activeMusicEl().play().catch(() => {});
        }
    });

    requestAnimationFrame(loop);
})();
