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
    const BOSS_RAY_PIPE_WIDTH = 92;
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
    const BOSS_FIGHT_DURATION = 120;  // 2 minutos reales con el jefe
    const BOSS_RAY_PHASE_AT = 60;     // minuto 1: empieza la fase de rayos
    const BOSS_FINAL_PHASE_AT = 90;   // ultimo medio minuto: sin tubos, rafagas de rayos
    const BOSS_PIPE_FADE_BEFORE_RAYS = 3;
    const BOSS_FINAL_PIPE_FADE_BEFORE = 2.5;
    const BOSS_RAY_SCALE = 2.75;
    const BOSS_FINAL_SCALE = 2.92;
    const DAY_CYCLE_STAGE_DURATION = 22;
    const DAY_CYCLE_DURATION = DAY_CYCLE_STAGE_DURATION * 4;
    const DAY_CYCLE_TRANSITION = 1.4;
    const MAX_ZONES = 5;
    const IMPLEMENTED_ZONES = 2;

    // ---------- State ----------
    const STATE = { READY: 0, PLAYING: 1, DEAD: 2, GAMEOVER: 3, BOSS: 4, WIN: 5 };
    let state = STATE.READY;

    // Boss state
    let bossActive = false;
    let bossTime = 0;          // segundos transcurridos en la pelea
    let bossPhase = 0;         // 0 = aun no, 1 = carga, 2 = rayos+tubos, 3 = furia sin tubos
    let bossMusicSwitched = false;
    let bossEntranceTimer = 0; // animación de entrada (0..1)
    let pipesFadingOut = false;
    let bossPipeFadeStarted = false;
    let bossFinalPipeFadeStarted = false;
    let rays = [];             // {sx, sy, ex, ey, telegraphTime, fireTime, age, phase}
    let raySpawnTimer = 0;
    let stormThunderTimer = 0;
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

    let unlockedZone = parseInt(localStorage.getItem('adventure_unlocked_zone') || '1', 10);
    if (isNaN(unlockedZone) || unlockedZone < 1) unlockedZone = 1;
    if (localStorage.getItem('adventure_zone1_cleared') === '1') unlockedZone = Math.max(unlockedZone, 2);
    unlockedZone = Math.min(IMPLEMENTED_ZONES, Math.max(1, unlockedZone));
    let selectedZone = parseInt(localStorage.getItem('adventure_selected_zone') || String(unlockedZone), 10);
    if (isNaN(selectedZone) || selectedZone < 1 || selectedZone > unlockedZone || selectedZone > IMPLEMENTED_ZONES) selectedZone = 1;
    let currentZone = selectedZone;

    let bestScore = parseInt(localStorage.getItem('flappy_best') || '0', 10) || 0;
    let score = 0;
    let pipes = [];
    let spawnTimer = 0;
    let groundOffset = 0;
    let cityOffset = 0;
    let starsOffset = 0;
    let backgroundCameraX = 0;
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

    // ---------- Modular pixel-art boss ----------
    // Zone 1 boss is assembled from separate parts so every module can move/react.
    const BOSS_SPRITE_W = 56;
    const BOSS_SPRITE_H = 44;
    const BOSS_PIXEL = 4;

    function buildBossPart(w, h, drawFn) {
        const off = makePixelCanvas(w, h);
        const x = off.ctx;
        function rect(px0, py0, rw, rh, c) {
            x.fillStyle = c;
            x.fillRect(px0, py0, rw, rh);
        }
        function row(py0, l, r, c) {
            x.fillStyle = c;
            x.fillRect(l, py0, r - l + 1, 1);
        }
        drawFn(rect, row, x);
        return off.canvas;
    }

    const BOSS_COLORS = {
        k: '#05030b',
        d0: '#10061b',
        d1: '#231036',
        d2: '#3b195e',
        d3: '#64269b',
        d4: '#a44ee4',
        hi: '#f0b6ff',
        red: '#ef1f2d',
        redHi: '#ff9a86',
        blue: '#2678ff',
        blueHi: '#7ee8ff',
        gold: '#f0b72e',
        goldHi: '#ffe27a',
        goldDark: '#8a5513',
        metal: '#a9b2c6',
        metalDark: '#3b4058',
        core: '#8b28ff',
        coreHi: '#f2c8ff'
    };

    function buildBossBodyPart() {
        const c = BOSS_COLORS;
        return buildBossPart(46, 34, (rect, row) => {
            const bodyRows = [
                [3, 18, 28], [4, 12, 35], [5, 8, 40], [6, 5, 43],
                [7, 3, 44], [8, 2, 45], [9, 1, 45], [10, 0, 45],
                [11, 0, 45], [12, 0, 45], [13, 0, 45], [14, 0, 45],
                [15, 0, 45], [16, 0, 45], [17, 0, 45], [18, 1, 45],
                [19, 1, 45], [20, 2, 44], [21, 3, 43], [22, 4, 42],
                [23, 6, 40], [24, 8, 38], [25, 11, 35], [26, 15, 31],
                [27, 20, 26]
            ];
            for (const [py, l, r] of bodyRows) row(py, Math.max(0, l - 1), Math.min(45, r + 1), c.k);
            for (const [py, l, r] of bodyRows) row(py, l, r, c.d2);

            row(5, 15, 33, c.d4);
            row(6, 10, 38, c.d3);
            row(7, 7, 42, c.d4);
            row(8, 6, 43, c.d3);
            row(9, 14, 39, c.d4);
            row(10, 22, 41, c.hi);
            row(11, 28, 43, c.d3);
            row(18, 5, 42, c.d1);
            row(19, 6, 42, c.d0);
            row(21, 10, 38, c.d0);
            row(23, 14, 34, c.d1);

            rect(4, 12, 13, 9, c.k);
            rect(6, 13, 9, 7, c.metalDark);
            rect(19, 12, 8, 1, c.k);
            rect(23, 13, 2, 8, c.k);
            rect(29, 10, 3, 12, c.k);
            rect(33, 12, 7, 1, c.k);
            rect(34, 16, 6, 1, c.k);
            rect(11, 9, 10, 1, c.k);
            rect(18, 6, 7, 1, c.metalDark);
            rect(20, 5, 5, 1, c.metal);
            rect(8, 10, 1, 1, c.metal);
            rect(17, 21, 2, 1, c.metal);
            rect(31, 22, 1, 1, c.gold);
            rect(38, 20, 3, 2, c.k);
            rect(39, 20, 1, 1, c.d4);
            rect(24, 9, 10, 2, 'rgba(255,255,255,0.10)');
        });
    }

    function buildBossFinPart() {
        const c = BOSS_COLORS;
        return buildBossPart(30, 30, (rect, row) => {
            const rows = [
                [2, 4, 13], [3, 4, 17], [4, 5, 21], [5, 6, 24],
                [6, 8, 26], [7, 10, 28], [8, 12, 29], [9, 13, 29],
                [10, 13, 28], [11, 12, 28], [12, 11, 27], [13, 10, 26],
                [14, 9, 25], [15, 8, 24], [16, 7, 23], [17, 6, 22],
                [18, 5, 20], [19, 4, 18], [20, 4, 16], [21, 3, 14],
                [22, 2, 11], [23, 1, 8]
            ];
            for (const [py, l, r] of rows) row(py, Math.max(0, l - 1), Math.min(29, r + 1), c.k);
            for (const [py, l, r] of rows) row(py, l, r, c.d2);
            row(5, 9, 23, c.d4);
            row(6, 11, 25, c.d3);
            row(8, 14, 28, c.d4);
            row(10, 15, 27, c.d1);
            row(13, 12, 25, c.d0);
            row(16, 9, 22, c.d1);
            row(19, 6, 17, c.d0);
            rect(11, 6, 13, 1, c.k);
            rect(13, 9, 13, 1, c.k);
            rect(11, 13, 13, 1, c.k);
            rect(8, 17, 10, 1, c.k);
            rect(14, 5, 4, 1, c.hi);
            rect(18, 8, 6, 1, c.hi);
            rect(8, 20, 4, 1, c.d4);
            rect(21, 11, 2, 2, c.metal);
        });
    }

    function buildBossTubePart() {
        const c = BOSS_COLORS;
        return buildBossPart(8, 12, (rect) => {
            rect(1, 0, 6, 1, c.metal);
            rect(0, 1, 8, 10, c.k);
            rect(1, 2, 6, 8, c.gold);
            rect(2, 2, 2, 7, c.goldHi);
            rect(5, 2, 2, 8, c.goldDark);
            rect(1, 8, 6, 2, c.goldDark);
            rect(0, 5, 8, 1, c.k);
            rect(2, 1, 4, 1, '#fff0a6');
            rect(1, 10, 6, 1, c.metalDark);
        });
    }

    function buildBossLegPart() {
        const c = BOSS_COLORS;
        return buildBossPart(9, 9, (rect) => {
            rect(3, 0, 3, 5, c.k);
            rect(4, 1, 1, 4, c.metalDark);
            rect(2, 4, 5, 2, c.gold);
            rect(1, 6, 7, 2, c.k);
            rect(2, 7, 5, 1, c.metal);
        });
    }

    const bossParts = {
        body: buildBossBodyPart(),
        fin: buildBossFinPart(),
        tube: buildBossTubePart(),
        leg: buildBossLegPart()
    };

    function drawBossPart(part, x, y, sc, rotation = 0, alpha = 1) {
        const unit = BOSS_PIXEL * sc;
        ctx.save();
        ctx.translate(x * unit, y * unit);
        ctx.rotate(rotation);
        ctx.globalAlpha *= alpha;
        ctx.drawImage(part, -part.width * unit / 2, -part.height * unit / 2, part.width * unit, part.height * unit);
        ctx.restore();
    }

    // ---------- Audio: SFX (Web Audio API) ----------
    let audioCtx = null;
    let masterGain = null;
    const DEFAULT_GAME_VOLUME = 70;
    let gameVolume = parseInt(localStorage.getItem('flappy_game_volume') || String(DEFAULT_GAME_VOLUME), 10);
    if (isNaN(gameVolume) || gameVolume < 0 || gameVolume > 100) gameVolume = DEFAULT_GAME_VOLUME;

    function targetGameLevel() {
        return (Math.max(0, Math.min(100, gameVolume)) / 100) * 0.65;
    }

    function applyGameVolume() {
        if (masterGain) masterGain.gain.value = targetGameLevel();
    }

    function ensureAudio() {
        if (!audioCtx) {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                masterGain = audioCtx.createGain();
                masterGain.gain.value = targetGameLevel();
                masterGain.connect(audioCtx.destination);
            } catch (e) { audioCtx = null; }
        }
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    }

    // ---------- Background music via <audio> elements ----------
    // Dos pistas: principal (main) y jefe (boss). Crossfade al cambiar.
    const musicEl = document.getElementById('bg-music');     // pista principal
    const bossMusicEl = document.getElementById('boss-music'); // pista del jefe
    const mainTracks = [
        { title: 'Principal', src: 'assets/music.mp3' },
        { title: 'Cattails Echo World 1', src: 'assets/Cattails’ Echo Worl1.mp3', fallbackSrc: 'www/assets/Cattails’ Echo Worl1.mp3' },
        { title: 'Startlight Brass World 1', src: 'assets/Startlight Brass World1.mp3', fallbackSrc: 'www/assets/Startlight Brass World1.mp3' }
    ];
    const bossTrack = { title: 'Boss · Harmonica Finals', src: 'assets/boss.mp3', loop: true };

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
    let currentMainTrackIndex = parseInt(localStorage.getItem('flappy_music_track') || '0', 10);
    if (isNaN(currentMainTrackIndex) || currentMainTrackIndex < 0 || currentMainTrackIndex >= mainTracks.length) currentMainTrackIndex = 0;
    let crossfadeTimer = null;
    let audioSourceVersion = 0;

    function activeMusicEl() {
        return currentTrack === 'boss' ? bossMusicEl : musicEl;
    }

    function activeMusicTitle() {
        return currentTrack === 'boss' ? bossTrack.title : mainTracks[currentMainTrackIndex].title;
    }

    function isBossMusicLocked() {
        return currentZone === 1 && (bossActive || state === STATE.BOSS || score >= BOSS_FIGHT_SCORE);
    }

    function zoneName(zone) {
        if (zone === 1) return 'Ciudad';
        if (zone === 2) return 'Desierto';
        if (zone === 3) return 'Acuatica';
        return 'Zona ' + zone;
    }

    function isZoneUnlocked(zone) {
        return zone >= 1 && zone <= unlockedZone && zone <= IMPLEMENTED_ZONES;
    }

    function persistSelectedZone() {
        localStorage.setItem('adventure_selected_zone', String(selectedZone));
    }

    function unlockZone(zone) {
        const next = Math.min(IMPLEMENTED_ZONES, Math.max(1, zone));
        if (next >= 2) localStorage.setItem('adventure_zone1_cleared', '1');
        if (next > unlockedZone) {
            unlockedZone = next;
            localStorage.setItem('adventure_unlocked_zone', String(unlockedZone));
        }
    }

    function selectZone(zone, applyNow = true) {
        if (!isZoneUnlocked(zone)) return false;
        selectedZone = zone;
        persistSelectedZone();
        if (applyNow && state === STATE.READY) currentZone = selectedZone;
        return true;
    }

    function markAudioSourceAttempt(el) {
        const requestId = String(++audioSourceVersion);
        el.dataset.audioRequestId = requestId;
        return requestId;
    }

    function configureAudioSource(el, track) {
        const requestId = markAudioSourceAttempt(el);
        el.preload = 'auto';
        el.loop = track.loop === true;
        el.dataset.trackTitle = track.title;
        el.dataset.fallbackSrc = track.fallbackSrc || '';
        el.dataset.fallbackPending = '0';
        el.setAttribute('src', track.src);
        el.load();
        return requestId;
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

    function handleMusicPlayError(el, error, requestId) {
        if (requestId && el.dataset.audioRequestId !== String(requestId)) return;
        const name = error && error.name ? error.name : 'Error';
        const message = error && error.message ? error.message : 'no disponible';

        if (name === 'NotAllowedError') {
            console.warn('[Música] play() rechazado:', name, message);
            musicLoadError = 'Bloqueado: haz clic en el juego primero';
            if (typeof updateVolumeUI === 'function') updateVolumeUI();
            return;
        }

        // Si hay fallback activo o disponible, el error pertenece al src anterior.
        if (el.dataset.fallbackSrc || el.dataset.fallbackPending === '1') return;
        if (el !== activeMusicEl()) return;

        console.warn('[Música] play() rechazado:', name, message);
        musicLoadError = 'Error cargando ' + (el.dataset.trackTitle || 'música') + '.';
        if (typeof updateVolumeUI === 'function') updateVolumeUI();
    }

    function attachMusicListeners(el, label) {
        el.addEventListener('error', () => {
            const fallbackSrc = el.dataset.fallbackSrc;
            if (fallbackSrc) {
                el.dataset.fallbackSrc = '';
                el.dataset.fallbackPending = '1';
                const fallbackRequestId = markAudioSourceAttempt(el);
                musicLoadError = null;
                el.setAttribute('src', fallbackSrc);
                el.load();
                if (typeof updateVolumeUI === 'function') updateVolumeUI();
                if (el === activeMusicEl() && musicPlaying) {
                    el.play().catch(error => handleMusicPlayError(el, error, fallbackRequestId));
                }
                return;
            }
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
            el.dataset.fallbackPending = '0';
            if (el === activeMusicEl()) {
                musicPlaying = true;
                musicLoadError = null;
            }
            if (typeof updateVolumeUI === 'function') updateVolumeUI();
        });
        // El loop manual solo aplica a pistas que deben repetirse, como el boss.
        el.addEventListener('timeupdate', () => {
            if (el.loop && el.duration && el.currentTime >= el.duration - 0.06) el.currentTime = 0;
        });
        el.addEventListener('ended', () => {
            if (el === bossMusicEl) {
                if (currentTrack === 'boss' || isBossMusicLocked()) {
                    currentTrack = 'boss';
                    el.loop = true;
                    el.currentTime = 0;
                    if (musicPlaying && !musicMuted) {
                        el.play().catch(error => handleMusicPlayError(el, error, el.dataset.audioRequestId));
                    }
                    if (typeof updateVolumeUI === 'function') updateVolumeUI();
                }
                return;
            }
            if (el === musicEl && currentTrack === 'main' && musicPlaying) {
                nextMainTrack();
                return;
            }
            if (el.loop) {
                el.currentTime = 0;
                el.play().catch(error => handleMusicPlayError(el, error, el.dataset.audioRequestId));
            }
        });
    }
    attachMusicListeners(musicEl, 'Música');
    attachMusicListeners(bossMusicEl, 'Boss');

    // Asignación robusta del src + carga explícita
    configureAudioSource(musicEl, mainTracks[currentMainTrackIndex]);
    configureAudioSource(bossMusicEl, bossTrack);
    bossMusicEl.volume = 0; // empieza silenciada

    applyMusicVolume();

    async function startMusic() {
        if (musicPlaying) return;
        applyMusicVolume();
        const el = activeMusicEl();
        const requestId = el.dataset.audioRequestId;
        try {
            await el.play();
            if (requestId && el.dataset.audioRequestId !== String(requestId)) return;
            musicPlaying = true;
            musicLoadError = null;
            if (typeof updateVolumeUI === 'function') updateVolumeUI();
        } catch (e) {
            handleMusicPlayError(el, e, requestId);
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

    function setMainTrack(index, autoplay = false) {
        const wasActiveMain = currentTrack === 'main';
        const shouldResume = autoplay && wasActiveMain && musicPlaying;
        currentMainTrackIndex = (index + mainTracks.length) % mainTracks.length;
        localStorage.setItem('flappy_music_track', String(currentMainTrackIndex));
        musicEl.pause();
        musicEl.currentTime = 0;
        const requestId = configureAudioSource(musicEl, mainTracks[currentMainTrackIndex]);
        musicEl.volume = wasActiveMain ? targetMusicLevel() : 0;
        musicLoadError = null;
        if (shouldResume) {
            musicEl.play()
                .then(() => {
                    if (musicEl.dataset.audioRequestId !== String(requestId)) return;
                    musicPlaying = true;
                    musicLoadError = null;
                    updateVolumeUI();
                })
                .catch(e => handleMusicPlayError(musicEl, e, requestId));
        } else {
            updateVolumeUI();
        }
    }

    function nextMainTrack() {
        if (isBossMusicLocked()) {
            if (currentTrack !== 'boss' && musicPlaying) crossfadeTo('boss', 500);
            if (typeof updateVolumeUI === 'function') updateVolumeUI();
            return;
        }
        setMainTrack(currentMainTrackIndex + 1, true);
    }

    function randomMainTrackIndex() {
        let index = Math.floor(Math.random() * mainTracks.length);
        if (mainTracks.length > 1 && index === currentMainTrackIndex) {
            index = (index + 1 + Math.floor(Math.random() * (mainTracks.length - 1))) % mainTracks.length;
        }
        return index;
    }

    function randomizeGameOverMusic() {
        if (isBossMusicLocked()) {
            if (currentTrack !== 'boss' && musicPlaying) {
                crossfadeTo('boss', 600);
            } else if (currentTrack === 'boss' && musicPlaying && bossMusicEl.paused && !musicMuted) {
                bossMusicEl.currentTime = 0;
                bossMusicEl.play().catch(error => handleMusicPlayError(bossMusicEl, error, bossMusicEl.dataset.audioRequestId));
            }
            updateVolumeUI();
            return;
        }
        const shouldPlay = musicPlaying;
        const index = randomMainTrackIndex();
        if (currentTrack === 'boss') {
            setMainTrack(index, false);
            if (shouldPlay) {
                crossfadeTo('main', 900);
            } else {
                bossMusicEl.pause();
                bossMusicEl.currentTime = 0;
                bossMusicEl.volume = 0;
                currentTrack = 'main';
                applyMusicVolume();
                updateVolumeUI();
            }
            return;
        }
        setMainTrack(index, shouldPlay);
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
        thunder: () => {
            ensureAudio();
            // Trueno ambiental muy bajo: solo textura grave durante la fase jefe.
            noise(0.72, 0.075, 260);
            blip(54, 0.9, 'sine', 0.045, 34);
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
    function zoneSelectorLayout() {
        const chipW = 52;
        const chipH = 34;
        const gap = 8;
        const totalW = chipW * MAX_ZONES + gap * (MAX_ZONES - 1);
        const y = Math.min(GROUND_Y - 72, 528);
        return {
            x: Math.round(W / 2 - totalW / 2),
            y: y,
            chipW: chipW,
            chipH: chipH,
            gap: gap
        };
    }

    function zoneAtPoint(x, y) {
        const l = zoneSelectorLayout();
        if (y < l.y || y > l.y + l.chipH) return 0;
        for (let i = 0; i < MAX_ZONES; i++) {
            const zx = l.x + i * (l.chipW + l.gap);
            if (x >= zx && x <= zx + l.chipW) return i + 1;
        }
        return 0;
    }

    function canvasPointFromEvent(e) {
        const src = e.touches && e.touches.length ? e.touches[0] : e;
        const rect = canvas.getBoundingClientRect();
        return {
            x: (src.clientX - rect.left) * (W / rect.width),
            y: (src.clientY - rect.top) * (H / rect.height)
        };
    }

    function handleCanvasPointer(e) {
        e.preventDefault();
        if (state === STATE.READY) {
            const p = canvasPointFromEvent(e);
            const zone = zoneAtPoint(p.x, p.y);
            if (zone) {
                ensureAudio();
                if (selectZone(zone, true)) sfx.swoop();
                return;
            }
        }
        flap();
    }

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

    canvas.addEventListener('mousedown', handleCanvasPointer);
    canvas.addEventListener('touchstart', handleCanvasPointer, { passive: false });
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
    const gameVolSlider = document.getElementById('game-vol-slider');
    const gameVolValue = document.getElementById('game-vol-value');
    const gameVolUpBtn = document.getElementById('game-vol-up');
    const gameVolDownBtn = document.getElementById('game-vol-down');
    const playMusicBtn = document.getElementById('play-music-btn');
    const nextTrackBtn = document.getElementById('next-track-btn');
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
        gameVolSlider.value = String(gameVolume);
        gameVolSlider.style.setProperty('--vol', gameVolume + '%');
        gameVolValue.textContent = gameVolume + '%';
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
                musicStatus.textContent = '♪ ' + activeMusicTitle();
                musicStatus.classList.add('ok');
            } else {
                musicStatus.textContent = '♪ ' + activeMusicTitle();
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

    function setGameVolume(v) {
        gameVolume = Math.max(0, Math.min(100, Math.round(v)));
        localStorage.setItem('flappy_game_volume', String(gameVolume));
        applyGameVolume();
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
    gameVolSlider.addEventListener('input', e => setGameVolume(parseInt(e.target.value, 10)));
    gameVolUpBtn.addEventListener('click', e => { e.stopPropagation(); setGameVolume(gameVolume + 10); });
    gameVolDownBtn.addEventListener('click', e => { e.stopPropagation(); setGameVolume(gameVolume - 10); });

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

    if (nextTrackBtn) {
        nextTrackBtn.addEventListener('click', e => {
            e.stopPropagation();
            ensureAudio();
            nextMainTrack();
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
        currentZone = selectedZone;
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
        isNight = currentZone === 1 && Math.random() < 0.3;
        dayCyclePhase = currentZone === 2 ? DAY_CYCLE_STAGE_DURATION * 1.4 : (isNight ? DAY_CYCLE_STAGE_DURATION * 2 : 0);
        rebuildBirdSprites();
        // Reset boss state
        bossActive = false;
        bossTime = 0;
        bossPhase = 0;
        bossMusicSwitched = false;
        bossEntranceTimer = 0;
        pipesFadingOut = false;
        bossPipeFadeStarted = false;
        bossFinalPipeFadeStarted = false;
        rays = [];
        raySpawnTimer = 0;
        stormThunderTimer = 0;
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

    function pipeCollisionSegments(p) {
        return [
            [p.topStart === null || p.topStart === undefined ? 0 : p.topStart, p.top],
            [p.bottom, p.bottomEnd === null || p.bottomEnd === undefined ? GROUND_Y : p.bottomEnd]
        ];
    }

    function birdHitsPipe(p) {
        const pWidth = getPipeWidth(p);
        if (bird.x + BIRD_HITBOX_R <= p.x || bird.x - BIRD_HITBOX_R >= p.x + pWidth) return false;
        const birdTop = bird.y - BIRD_HITBOX_R;
        const birdBottom = bird.y + BIRD_HITBOX_R;
        for (const seg of pipeCollisionSegments(p)) {
            const y0 = Math.min(seg[0], seg[1]);
            const y1 = Math.max(seg[0], seg[1]);
            if (y1 <= y0) continue;
            if (birdBottom > y0 && birdTop < y1) return true;
        }
        return false;
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
        // Desde 120 puntos los tubos empiezan a animarse. En la pelea del jefe suben a dificultad alta.
        let gap = PIPE_GAP;
        let width = PIPE_WIDTH;
        const difficulty = pipeDifficulty01();
        let topHeight = null;
        let topStart = null;
        let bottomEnd = null;
        if (state === STATE.BOSS && bossPhase === 1) {
            const bossRamp = clamp01(bossTime / BOSS_RAY_PHASE_AT);
            gap = Math.round((188 - bossRamp * 12 + Math.random() * 16) * _hRatio);
        } else if (state === STATE.BOSS && bossPhase === 2) {
            width = BOSS_RAY_PIPE_WIDTH;
            gap = Math.round((330 + Math.random() * 38) * _hRatio);
            const pipeLen = Math.round((92 + Math.random() * 30) * _hRatio);
            const rayTopMin = Math.round(92 * _hRatio);
            const rayTopMax = Math.max(
                rayTopMin + 18,
                Math.min(
                    GROUND_Y - gap - Math.round(132 * _hRatio),
                    Math.round(178 * _hRatio)
                )
            );
            topHeight = rayTopMin + Math.random() * Math.max(18, rayTopMax - rayTopMin);
            topStart = Math.max(0, topHeight - pipeLen);
            bottomEnd = Math.min(GROUND_Y, topHeight + gap + pipeLen);
        } else if (difficulty > 0) {
            gap = Math.round((190 - difficulty * 25 + Math.random() * 30) * _hRatio);
        }
        const minTop = _pipeMargin;
        const maxTop = GROUND_Y - gap - _pipeMargin;
        if (topHeight === null) {
            topHeight = minTop + Math.random() * Math.max(20, maxTop - minTop);
        }
        pipes.push({
            x: W + 20,
            width: width,
            top: topHeight,
            bottom: topHeight + gap,
            topStart: topStart,
            bottomEnd: bottomEnd,
            baseTop: topHeight,
            baseGap: gap,
            scored: false,
            pulse: Math.random() * Math.PI * 2,
            fadeOut: 1.0
        });
    }

    function spawnRay(targetY, sourceOffset, options = {}) {
        const margin = 70;
        const sc = boss.scale;
        const sw = BOSS_SPRITE_W * BOSS_PIXEL * sc;
        const aimedY = targetY !== undefined ? targetY : bird.y + (Math.random() - 0.5) * 150;
        const y = Math.max(margin, Math.min(GROUND_Y - margin, aimedY));
        const sx = boss.x - sw * 0.42;
        const sy = y;
        rays.push({
            sx: sx,
            sy: sy,
            ex: -30,
            ey: y,
            telegraphTime: options.telegraphTime || 0.78,
            fireTime: options.fireTime || 0.32,
            thickness: options.thickness || 28,
            hitRadius: options.hitRadius || 9,
            age: 0,
            phase: 0  // 0 telegraph, 1 firing, 2 dead
        });
        if (!options.silent) sfx.rayCharge();
        boss.eyeGlow = 1;
    }

    function spawnRayBurst() {
        const finalFury = bossPhase === 3;
        const count = finalFury ? 2 + Math.floor(Math.random() * 2) : 1;
        if (count === 1) {
            spawnRay(bird.y + (Math.random() - 0.5) * 150, -0.08, {
                telegraphTime: 0.78,
                fireTime: 0.32,
                thickness: 28,
                hitRadius: 9
            });
            return;
        }

        const minY = 80;
        const maxY = GROUND_Y - 86;
        const ys = [];
        for (let tries = 0; tries < 80 && ys.length < count; tries++) {
            const candidate = minY + Math.random() * (maxY - minY);
            if (ys.every(y => Math.abs(y - candidate) > 92)) ys.push(candidate);
        }
        while (ys.length < count) {
            ys.push(minY + ((ys.length + 1) / (count + 1)) * (maxY - minY));
        }
        ys.sort((a, b) => a - b);

        const offsets = count === 2 ? [-0.13, 0.1] : [-0.16, 0.0, 0.15];
        sfx.rayCharge();
        for (let i = 0; i < count; i++) {
            spawnRay(ys[i], offsets[i], {
                silent: true,
                telegraphTime: 0.96,
                fireTime: 0.36,
                thickness: 24,
                hitRadius: 8
            });
        }
        boss.eyeGlow = 1.2;
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
            updateBackground(dt, backgroundCameraX + PIPE_SPEED * dt);
            dayCyclePhase = (dayCyclePhase + dt) % DAY_CYCLE_DURATION;
            isNight = nightLevel() > 0.55;
        }

        if (screenShake > 0) screenShake = Math.max(0, screenShake - dt * 1.6);
        if (boss.eyeGlow > 0) boss.eyeGlow = Math.max(0, boss.eyeGlow - dt * 1.4);
        if (state === STATE.BOSS && bossAttackLevel() > 0.25) {
            stormThunderTimer -= dt;
            if (stormThunderTimer <= 0) {
                sfx.thunder();
                screenShake = Math.max(screenShake, 0.08);
                stormThunderTimer = 5.5 + Math.random() * 4.5;
            }
        }

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
            if (currentZone === 1 && !bossMusicSwitched && score >= BOSS_MUSIC_SCORE && currentTrack === 'main' && musicPlaying) {
                bossMusicSwitched = true;
                crossfadeTo('boss', 1500);
            }

            // Trigger pelea del jefe a 150 puntos.
            if (currentZone === 1 && state === STATE.PLAYING && score >= BOSS_FIGHT_SCORE) {
                state = STATE.BOSS;
                bossActive = true;
                bossTime = 0;
                bossPhase = 1;
                bossEntranceTimer = 0;
                bossPipeFadeStarted = false;
                bossFinalPipeFadeStarted = false;
                pipesFadingOut = false;
                raySpawnTimer = 0.5;
                stormThunderTimer = 0.8;
                screenShake = 1.0;
                sfx.bossRoar();
                if (currentTrack !== 'boss' && musicPlaying) crossfadeTo('boss', 800);
            }

            // Spawn de tubos (also during ray phase with wide gaps)
            const allowSpawn =
                state === STATE.PLAYING ||
                (state === STATE.BOSS && bossPhase < 3 && !pipesFadingOut);
            if (allowSpawn) {
                spawnTimer += dt;
                const difficulty = pipeDifficulty01();
                let interval = PIPE_INTERVAL * (1 - difficulty * 0.12);
                if (state === STATE.BOSS && bossPhase === 1) {
                    interval = PIPE_INTERVAL * 0.92;
                } else if (state === STATE.BOSS && bossPhase === 2) {
                    interval = PIPE_INTERVAL * 1.2;
                }
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
                if (isPipeAnimationActive() && !(state === STATE.BOSS && bossPhase >= 2) && !pipesFadingOut) {
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

                // Boss movement: sways during charge; in ray phases it becomes a huge launcher on the right.
                boss.bobPhase += dt * 1.4;
                boss.movePhase += dt * 0.6;
                if (bossPhase >= 2) {
                    const anchorX = W + (bossPhase === 3 ? 112 : 88);
                    const anchorY = H * (bossPhase === 3 ? 0.40 : 0.42);
                    const targetX = anchorX + Math.sin(boss.movePhase * 2.8) * (bossPhase === 3 ? 14 : 9);
                    const targetY = anchorY + Math.sin(boss.bobPhase * 2.2) * (bossPhase === 3 ? 22 : 16);
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
                const bossWingSpeed = bossPhase >= 2 ? (bossPhase === 3 ? 0.055 : 0.075) : 0.11;
                if (boss.wingTimer > bossWingSpeed) { boss.wingTimer = 0; boss.wing = (boss.wing + 1) % 3; }

                // Boss crece desde el segundo 0 hasta el minuto 1.
                const growProgress = Math.min(1, bossTime / BOSS_RAY_PHASE_AT);
                boss.targetScale = 1.0 + growProgress * (BOSS_RAY_SCALE - 1.0);
                if (bossPhase === 3) boss.targetScale = BOSS_FINAL_SCALE;
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

                // A los 60s: empieza la fase de rayos con tubos mas anchos y mas separados.
                if (bossTime >= BOSS_RAY_PHASE_AT && bossPhase === 1) {
                    bossPhase = 2;
                    pipes = [];
                    pipesFadingOut = false;
                    spawnTimer = PIPE_INTERVAL;
                    raySpawnTimer = 0.7;
                    screenShake = 0.85;
                    sfx.bossRoar();
                }

                // Antes de la furia final, los tubos desaparecen por completo.
                if (
                    bossPhase === 2 &&
                    !bossFinalPipeFadeStarted &&
                    bossTime >= BOSS_FINAL_PHASE_AT - BOSS_FINAL_PIPE_FADE_BEFORE
                ) {
                    bossFinalPipeFadeStarted = true;
                    pipesFadingOut = true;
                }

                if (bossTime >= BOSS_FINAL_PHASE_AT && bossPhase === 2) {
                    bossPhase = 3;
                    pipes = [];
                    pipesFadingOut = false;
                    spawnTimer = 0;
                    raySpawnTimer = 0.55;
                    screenShake = 1.0;
                    sfx.bossRoar();
                }

                // Spawnear rayos durante phases 2 y 3
                if (bossPhase >= 2) {
                    raySpawnTimer -= dt;
                    if (raySpawnTimer <= 0) {
                        spawnRayBurst();
                        raySpawnTimer = bossPhase === 3
                            ? 1.85 + Math.random() * 0.65
                            : 1.45 + Math.random() * 0.65;
                    }
                }

                // Actualizar rayos existentes
                let raySoundThisFrame = false;
                for (const r of rays) {
                    r.age += dt;
                    if (r.phase === 0 && r.age >= r.telegraphTime) {
                        r.phase = 1;
                        r.age = 0;
                        if (!raySoundThisFrame) {
                            sfx.rayFire();
                            raySoundThisFrame = true;
                        }
                        screenShake = Math.max(screenShake, bossPhase === 3 ? 0.62 : 0.4);
                    } else if (r.phase === 1 && r.age >= r.fireTime) {
                        r.phase = 2;
                    }
                }
                rays = rays.filter(r => r.phase < 2);

                // Victoria
                if (bossTime >= BOSS_FIGHT_DURATION) {
                    state = STATE.WIN;
                    winTimer = 0;
                    unlockZone(2);
                    selectZone(2, false);
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
                    if (birdHitsPipe(p)) {
                        killBird();
                        break;
                    }
                }
                // Rayos durante fase 2
                for (const r of rays) {
                    if (r.phase !== 1) continue;
                    if (distancePointToSegment(bird.x, bird.y, r.sx, r.sy, r.ex, r.ey) < BIRD_HITBOX_R + (r.hitRadius || 9)) {
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
                randomizeGameOverMusic();
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

    // ---------- Drawing: layered parallax background ----------
    const BACKGROUND_TILE_W = 512;
    const backgroundLayerCache = {};
    const BACKGROUND_STAGE_PALETTES = [
        {
            skyTop: '#4ec0ca', skyMid: '#7ed4dc', skyBot: '#bde7eb',
            star: '#ffffff', moonMask: '#4ec0ca',
            cloudShade: 'rgba(132, 198, 205, 0.62)', cloudMid: 'rgba(220, 247, 247, 0.86)', cloudLight: 'rgba(255, 255, 238, 0.92)',
            farCity: '#3b6174', farLine: 'rgba(94, 139, 158, 0.36)', farWindow: 'rgba(255, 224, 150, 0.20)',
            midWindow: 'rgba(255, 230, 166, 0.22)', windowAccent: 'rgba(255, 245, 188, 0.34)', windowGlow: 'rgba(255, 214, 126, 0.04)',
            farWindowModulo: 18, midWindowModulo: 16,
            midCity: '#4f7b84', treeTrunk: '#1f3f35', treeDark: '#326650', treeMid: '#4d8b60',
            bushDark: '#2f6738', bushMid: '#43894b', bushLight: '#65ad5b',
            grassDark: '#3d6e1a', grassMid: '#5fa83a', grassHi: '#7dd24a', grassDetail: '#4d8a30',
            hazeA: 'rgba(180, 232, 234, 0)', hazeB: 'rgba(180, 232, 234, 0.16)', hazeC: 'rgba(110, 174, 172, 0.05)'
        },
        {
            skyTop: '#f08a5d', skyMid: '#d66b7d', skyBot: '#ffd28f',
            star: '#ffe7b5', moonMask: '#f08a5d',
            cloudShade: 'rgba(141, 80, 101, 0.50)', cloudMid: 'rgba(255, 193, 159, 0.58)', cloudLight: 'rgba(255, 230, 178, 0.62)',
            farCity: '#493751', farLine: 'rgba(124, 91, 112, 0.34)', farWindow: 'rgba(255, 197, 104, 0.28)',
            midWindow: 'rgba(255, 205, 118, 0.34)', windowAccent: 'rgba(255, 235, 156, 0.48)', windowGlow: 'rgba(255, 146, 80, 0.06)',
            farWindowModulo: 13, midWindowModulo: 11,
            midCity: '#60445d', treeTrunk: '#34252f', treeDark: '#4f4c3a', treeMid: '#6c6843',
            bushDark: '#395530', bushMid: '#5f733b', bushLight: '#8a9649',
            grassDark: '#69702f', grassMid: '#8f8a3e', grassHi: '#b2a64d', grassDetail: '#6b7c32',
            hazeA: 'rgba(255, 171, 111, 0)', hazeB: 'rgba(255, 171, 111, 0.18)', hazeC: 'rgba(164, 95, 89, 0.06)'
        },
        {
            skyTop: '#071126', skyMid: '#0d1d3d', skyBot: '#173758',
            star: '#c8dcff', moonMask: '#071126',
            cloudShade: 'rgba(5, 18, 38, 0.42)', cloudMid: 'rgba(28, 54, 82, 0.38)', cloudLight: 'rgba(72, 101, 137, 0.30)',
            farCity: '#07152c', farLine: 'rgba(31, 58, 83, 0.42)', farWindow: 'rgba(245, 187, 87, 0.56)',
            midWindow: 'rgba(255, 207, 102, 0.68)', windowAccent: 'rgba(255, 238, 154, 0.84)', windowGlow: 'rgba(255, 176, 72, 0.13)',
            farWindowModulo: 8, midWindowModulo: 7,
            midCity: '#0c2636', treeTrunk: '#08141d', treeDark: '#0e2e34', treeMid: '#153c3d',
            bushDark: '#102c26', bushMid: '#184238', bushLight: '#24674a',
            grassDark: '#11391f', grassMid: '#1f5a2d', grassHi: '#2c7834', grassDetail: '#1a4b27',
            hazeA: 'rgba(95, 132, 166, 0)', hazeB: 'rgba(108, 154, 176, 0.12)', hazeC: 'rgba(55, 92, 93, 0.04)'
        },
        {
            skyTop: '#5da7cc', skyMid: '#92c7d4', skyBot: '#ffd3a0',
            star: '#ffffff', moonMask: '#5da7cc',
            cloudShade: 'rgba(126, 169, 184, 0.56)', cloudMid: 'rgba(225, 239, 230, 0.76)', cloudLight: 'rgba(255, 239, 196, 0.70)',
            farCity: '#36536d', farLine: 'rgba(85, 119, 138, 0.35)', farWindow: 'rgba(255, 220, 142, 0.22)',
            midWindow: 'rgba(255, 224, 154, 0.28)', windowAccent: 'rgba(255, 240, 174, 0.38)', windowGlow: 'rgba(255, 198, 111, 0.05)',
            farWindowModulo: 16, midWindowModulo: 14,
            midCity: '#496f7b', treeTrunk: '#213c36', treeDark: '#38624d', treeMid: '#5a8f62',
            bushDark: '#335d38', bushMid: '#4b8148', bushLight: '#74ad55',
            grassDark: '#587327', grassMid: '#7c9a36', grassHi: '#9fc64a', grassDetail: '#597d2d',
            hazeA: 'rgba(255, 211, 160, 0)', hazeB: 'rgba(255, 211, 160, 0.18)', hazeC: 'rgba(121, 168, 167, 0.05)'
        }
    ];
    const backgroundLayers = [
        { name: 'sky', speed: 0, draw: drawSkyLayer },
        {
            name: 'clouds',
            speed: 0.16,
            tileW: BACKGROUND_TILE_W * 2,
            density: 8,
            yHeightRange: [52, 178],
            scaleRange: [0.72, 1.34],
            alpha: 0.62,
            build: buildCloudLayer
        },
        { name: 'farCity', speed: 0.12, tileW: BACKGROUND_TILE_W, build: buildFarCityLayer },
        { name: 'midCityOrTrees', speed: 0.24, tileW: BACKGROUND_TILE_W, build: buildMidCityTreeLayer },
        { name: 'haze', speed: 0.18, draw: drawHazeLayer },
        { name: 'bushesMid', speed: 0.42, tileW: BACKGROUND_TILE_W, build: buildMidBushLayer },
        { name: 'grassFront', speed: 0.68, tileW: BACKGROUND_TILE_W, build: buildFrontGrassLayer }
    ];

    function updateBackground(deltaTime, cameraX) {
        backgroundCameraX = cameraX;
        cityOffset = cameraX * 0.12;
        starsOffset = (starsOffset + deltaTime * 1.35) % 10000;
    }

    function drawBackground(layerAlpha = 1) {
        for (const layer of backgroundLayers) drawLayer(ctx, layer, layerAlpha);
    }

    function drawLayer(ctxRef, layer, layerAlpha = 1) {
        if (layer.draw) {
            layer.draw(ctxRef, layer, layer.name === 'sky' ? 1 : layerAlpha);
            return;
        }
        const cycle = cycleInfo();
        drawLayerStage(ctxRef, layer, cycle.from, layerAlpha * (cycle.from === cycle.to ? 1 : 1 - cycle.blend));
        if (cycle.from !== cycle.to && cycle.blend > 0) {
            drawLayerStage(ctxRef, layer, cycle.to, layerAlpha * cycle.blend);
        }
    }

    function drawLayerStage(ctxRef, layer, stage, alpha) {
        if (alpha <= 0.001) return;
        const sprite = getBackgroundLayerSprite(layer, stage);
        const tileW = layer.tileW;
        const offset = Math.floor(((backgroundCameraX * layer.speed) % tileW + tileW) % tileW);
        ctxRef.save();
        ctxRef.globalAlpha *= alpha * (layer.alpha === undefined ? 1 : layer.alpha);
        for (let x = -offset - tileW; x < W + tileW; x += tileW) {
            ctxRef.drawImage(sprite, Math.round(x), 0);
        }
        ctxRef.restore();
    }

    function getBackgroundLayerSprite(layer, stage) {
        const key = layer.name + ':' + stage;
        if (backgroundLayerCache[key]) return backgroundLayerCache[key];
        const off = makePixelCanvas(layer.tileW, GROUND_Y);
        off.ctx.imageSmoothingEnabled = false;
        layer.build(off.ctx, layer.tileW, GROUND_Y, BACKGROUND_STAGE_PALETTES[stage], layer);
        backgroundLayerCache[key] = off.canvas;
        return off.canvas;
    }

    function drawSkyLayer(ctxRef) {
        const cycle = cycleInfo();
        const cur = BACKGROUND_STAGE_PALETTES[cycle.from];
        const next = BACKGROUND_STAGE_PALETTES[cycle.to];
        const top = mixHex(cur.skyTop, next.skyTop, cycle.blend);
        const mid = mixHex(cur.skyMid, next.skyMid, cycle.blend);
        const bot = mixHex(cur.skyBot, next.skyBot, cycle.blend);
        const g = ctxRef.createLinearGradient(0, 0, 0, GROUND_Y);
        g.addColorStop(0, top);
        g.addColorStop(0.45, mid);
        g.addColorStop(1, bot);
        ctxRef.fillStyle = g;
        ctxRef.fillRect(0, 0, W, GROUND_Y);

        ctxRef.save();
        const night = nightLevel();
        const dusk = duskLevel();
        const dawn = dawnLevel();
        for (let i = 0; i < 78; i++) {
            const sx = Math.floor((i * 83 + 19) % W);
            const sy = Math.floor(18 + (i * 47) % Math.max(80, GROUND_Y - 245));
            const tw = (Math.sin(starsOffset * 2.6 + i * 1.7) + 1) / 2;
            ctxRef.globalAlpha = night * (0.22 + tw * 0.34);
            ctxRef.fillStyle = i % 9 === 0 ? '#ffe8a8' : BACKGROUND_STAGE_PALETTES[2].star;
            ctxRef.fillRect(sx, sy, i % 13 === 0 ? 2 : 1, i % 13 === 0 ? 2 : 1);
        }

        const stage = cycleStage();
        const sunT = stage < 2 ? stage / 2 : Math.max(0, stage - 3) * 0.35;
        const sunX = W - 95 - sunT * 130;
        const sunY = 115 + Math.sin(sunT * Math.PI) * 55 + dusk * 42 - dawn * 22;
        const sunAlpha = Math.max(0, stage < 2 ? 1 - night * 0.85 : dawn * 0.95);
        if (sunAlpha > 0.05) {
            ctxRef.globalAlpha = sunAlpha;
            const sunGlow = ctxRef.createRadialGradient(sunX, sunY, 10, sunX, sunY, 100);
            sunGlow.addColorStop(0, 'rgba(255, 250, 200, 0.38)');
            sunGlow.addColorStop(1, 'rgba(255, 250, 200, 0)');
            ctxRef.fillStyle = sunGlow;
            ctxRef.fillRect(sunX - 100, sunY - 100, 200, 200);
            ctxRef.fillStyle = '#fff7c0';
            ctxRef.beginPath(); ctxRef.arc(sunX, sunY, 34, 0, Math.PI * 2); ctxRef.fill();
            ctxRef.fillStyle = '#ffe066';
            ctxRef.beginPath(); ctxRef.arc(sunX, sunY, 26, 0, Math.PI * 2); ctxRef.fill();
        }

        const moonX = W - 92;
        const moonY = 98;
        if (night > 0.12) {
            const glow = ctxRef.createRadialGradient(moonX, moonY, 8, moonX, moonY, 86);
            glow.addColorStop(0, 'rgba(205, 224, 255, ' + (0.20 * night) + ')');
            glow.addColorStop(1, 'rgba(205, 224, 255, 0)');
            ctxRef.globalAlpha = 1;
            ctxRef.fillStyle = glow;
            ctxRef.fillRect(moonX - 86, moonY - 86, 172, 172);
            ctxRef.globalAlpha = night;
            ctxRef.fillStyle = 'rgba(230, 238, 255, 0.74)';
            ctxRef.beginPath(); ctxRef.arc(moonX, moonY, 24, 0, Math.PI * 2); ctxRef.fill();
            ctxRef.fillStyle = top;
            ctxRef.beginPath(); ctxRef.arc(moonX - 9, moonY - 5, 22, 0, Math.PI * 2); ctxRef.fill();
        }
        ctxRef.restore();
    }

    function drawHazeLayer(ctxRef, layer, alpha) {
        ctxRef.save();
        ctxRef.globalAlpha *= alpha;
        const cycle = cycleInfo();
        const pal = BACKGROUND_STAGE_PALETTES[cycle.to];
        const baseY = GROUND_Y - 118;
        const haze = ctxRef.createLinearGradient(0, baseY - 55, 0, GROUND_Y);
        haze.addColorStop(0, pal.hazeA);
        haze.addColorStop(0.48, pal.hazeB);
        haze.addColorStop(1, pal.hazeC);
        ctxRef.fillStyle = haze;
        ctxRef.fillRect(0, Math.max(0, baseY - 55), W, 120);

        const glowX = ((backgroundCameraX * layer.speed * 0.35) % (W + 260) + W + 260) % (W + 260) - 130;
        ctxRef.fillStyle = 'rgba(130, 178, 192, 0.06)';
        ctxRef.fillRect(Math.floor(glowX), baseY, 180, 2);
        ctxRef.fillRect(Math.floor(glowX + 24), baseY + 7, 110, 2);
        ctxRef.restore();
    }

    function drawPixelCloudOval(ctxRef, x, y, w, h, color) {
        const px = Math.round(x);
        const py = Math.round(y);
        const pw = Math.max(4, Math.round(w));
        const ph = Math.max(4, Math.round(h));
        const stepX = Math.max(2, Math.round(pw * 0.16));
        const stepY = Math.max(2, Math.round(ph * 0.22));
        ctxRef.fillStyle = color;
        ctxRef.fillRect(px + stepX, py, pw - stepX * 2, ph);
        ctxRef.fillRect(px, py + stepY, pw, ph - stepY * 2);
        ctxRef.fillRect(px + Math.floor(stepX * 0.5), py + Math.floor(stepY * 0.5), pw - stepX, ph - stepY);
    }

    function drawCloudCluster(ctxRef, x, y, scale, pal, variant) {
        const s = Math.max(0.5, scale);
        const shapes = [
            [
                [2, 18, 36, 18], [24, 8, 42, 30], [58, 13, 35, 24],
                [84, 20, 28, 16], [16, 26, 82, 14]
            ],
            [
                [0, 16, 30, 17], [19, 6, 35, 26], [47, 12, 48, 24],
                [86, 18, 34, 18], [12, 25, 96, 15]
            ],
            [
                [4, 17, 26, 15], [22, 10, 30, 20], [49, 5, 34, 27],
                [78, 14, 38, 21], [103, 22, 22, 13], [18, 26, 92, 13]
            ]
        ];
        const puffs = shapes[variant % shapes.length];

        for (const p of puffs) {
            drawPixelCloudOval(ctxRef, x + p[0] * s, y + (p[1] + 5) * s, p[2] * s, Math.max(4, p[3] * 0.56 * s), pal.cloudShade);
        }
        for (const p of puffs) {
            drawPixelCloudOval(ctxRef, x + p[0] * s, y + p[1] * s, p[2] * s, p[3] * s, pal.cloudMid);
        }

        const hi = variant % 2 === 0
            ? [[28, 11, 22, 8], [63, 16, 18, 7]]
            : [[21, 9, 17, 7], [55, 14, 25, 8], [91, 20, 13, 5]];
        for (const h of hi) {
            drawPixelCloudOval(ctxRef, x + h[0] * s, y + h[1] * s, h[2] * s, h[3] * s, pal.cloudLight);
        }

        ctxRef.fillStyle = pal.cloudShade;
        ctxRef.fillRect(Math.round(x + 18 * s), Math.round(y + 37 * s), Math.round(68 * s), Math.max(1, Math.round(2 * s)));
    }

    function drawCloudWrapped(ctxRef, x, y, scale, pal, variant, tileW) {
        const templateW = [116, 124, 128][variant % 3];
        const w = Math.round(templateW * scale);
        drawCloudCluster(ctxRef, x, y, scale, pal, variant);
        if (x + w > tileW) drawCloudCluster(ctxRef, x - tileW, y, scale, pal, variant);
        if (x < 0) drawCloudCluster(ctxRef, x + tileW, y, scale, pal, variant);
    }

    function buildCloudLayer(ctxRef, tileW, tileH, pal, layer) {
        const count = Math.max(1, Math.round(layer.density || 6));
        const yMin = Math.max(20, layer.yHeightRange ? layer.yHeightRange[0] : 56);
        const yMax = Math.max(yMin + 1, layer.yHeightRange ? layer.yHeightRange[1] : 170);
        const sMin = layer.scaleRange ? layer.scaleRange[0] : 0.75;
        const sMax = layer.scaleRange ? layer.scaleRange[1] : 1.25;
        const spacing = tileW / count;

        for (let i = 0; i < count; i++) {
            const jitter = (((i * 79 + 31) % 97) - 48) * 0.74;
            const yStep = (i * 43 + 17) % (yMax - yMin);
            const scaleT = ((i * 37 + 11) % 100) / 100;
            const scale = sMin + (sMax - sMin) * scaleT;
            const x = Math.round(i * spacing + jitter);
            const y = Math.round(yMin + yStep);
            drawCloudWrapped(ctxRef, x, y, scale, pal, i, tileW);
        }
    }

    function drawBuilding(ctxRef, x, baseY, w, h, color, capType, windowColor, windowSeed, windowOptions = {}) {
        ctxRef.fillStyle = color;
        ctxRef.fillRect(x, baseY - h, w, h);
        if (capType === 1) ctxRef.fillRect(x + Math.floor(w * 0.25), baseY - h - 6, Math.max(4, Math.floor(w * 0.5)), 6);
        if (capType === 2) {
            ctxRef.beginPath();
            ctxRef.moveTo(x, baseY - h);
            ctxRef.lineTo(x + Math.floor(w / 2), baseY - h - 10);
            ctxRef.lineTo(x + w, baseY - h);
            ctxRef.closePath();
            ctxRef.fill();
        }
        if (capType === 3) ctxRef.fillRect(x + w - 3, baseY - h - 15, 2, 15);

        const modulo = windowOptions.modulo || 17;
        const accentColor = windowOptions.accentColor || windowColor;
        const glowColor = windowOptions.glowColor || null;
        for (let yy = baseY - h + 12; yy < baseY - 8; yy += 15) {
            for (let xx = x + 5; xx < x + w - 4; xx += 11) {
                const hash = Math.abs(xx * 5 + yy * 3 + windowSeed);
                if (hash % modulo === 0) {
                    if (glowColor) {
                        ctxRef.fillStyle = glowColor;
                        ctxRef.fillRect(xx - 1, yy - 1, 4, 5);
                    }
                    ctxRef.fillStyle = windowColor;
                    ctxRef.fillRect(xx, yy, 2, 3);
                    if (hash % (modulo * 3) === 0) {
                        ctxRef.fillStyle = accentColor;
                        ctxRef.fillRect(xx, yy, 2, 1);
                        ctxRef.fillStyle = windowColor;
                    }
                }
            }
        }
    }

    function buildFarCityLayer(ctxRef, tileW, tileH, pal) {
        const baseY = GROUND_Y - 16;
        ctxRef.fillStyle = pal.farCity;
        const buildings = [
            [0, 22, 82, 1], [25, 17, 58, 0], [45, 34, 108, 3], [83, 25, 72, 2],
            [112, 19, 94, 0], [136, 42, 122, 1], [182, 24, 74, 0], [209, 31, 101, 3],
            [244, 16, 66, 0], [264, 37, 116, 2], [305, 22, 88, 1], [331, 48, 136, 0],
            [383, 18, 69, 0], [406, 32, 105, 3], [442, 26, 78, 1], [472, 40, 119, 2]
        ];
        const windowOptions = {
            modulo: pal.farWindowModulo,
            accentColor: pal.windowAccent,
            glowColor: pal.windowGlow
        };
        for (let i = 0; i < buildings.length; i++) {
            const b = buildings[i];
            drawBuilding(ctxRef, b[0], baseY, b[1], b[2], pal.farCity, b[3], pal.farWindow, i * 23, windowOptions);
        }
        ctxRef.fillStyle = pal.farLine;
        ctxRef.fillRect(0, baseY - 3, tileW, 3);
    }

    function drawPixelTree(ctxRef, x, baseY, w, h, trunk, dark, mid) {
        ctxRef.fillStyle = trunk;
        ctxRef.fillRect(x + Math.floor(w * 0.45), baseY - Math.floor(h * 0.52), Math.max(3, Math.floor(w * 0.12)), Math.floor(h * 0.52));
        ctxRef.fillStyle = dark;
        ctxRef.fillRect(x + 2, baseY - h + 18, w - 4, h - 18);
        ctxRef.fillRect(x + Math.floor(w * 0.14), baseY - h + 6, Math.floor(w * 0.72), 18);
        ctxRef.fillRect(x + Math.floor(w * 0.28), baseY - h, Math.floor(w * 0.44), 12);
        ctxRef.fillStyle = mid;
        ctxRef.fillRect(x + Math.floor(w * 0.16), baseY - h + 20, Math.floor(w * 0.32), 14);
        ctxRef.fillRect(x + Math.floor(w * 0.52), baseY - h + 13, Math.floor(w * 0.28), 12);
    }

    function buildMidCityTreeLayer(ctxRef, tileW, tileH, pal) {
        const baseY = GROUND_Y - 9;
        const midBuildings = [
            [6, 26, 74, 0], [41, 20, 58, 1], [73, 38, 93, 0], [121, 28, 66, 2],
            [158, 44, 102, 1], [213, 23, 70, 0], [244, 35, 86, 3], [292, 27, 62, 1],
            [329, 46, 106, 0], [389, 29, 74, 2], [428, 39, 90, 1], [479, 24, 65, 0]
        ];
        const windowOptions = {
            modulo: pal.midWindowModulo || pal.farWindowModulo,
            accentColor: pal.windowAccent,
            glowColor: pal.windowGlow
        };
        for (let i = 0; i < midBuildings.length; i++) {
            const b = midBuildings[i];
            drawBuilding(ctxRef, b[0], baseY, b[1], b[2], pal.midCity, b[3], pal.midWindow || pal.farWindow, i * 29, windowOptions);
        }
        const trees = [
            [18, 50, 42, 76], [94, 42, 36, 61], [191, 56, 44, 82],
            [275, 47, 38, 67], [362, 58, 48, 80], [455, 44, 39, 62]
        ];
        for (const t of trees) drawPixelTree(ctxRef, t[0], baseY + 2, t[2], t[3], pal.treeTrunk, pal.treeDark, pal.treeMid);
        ctxRef.fillStyle = pal.farLine;
        ctxRef.fillRect(0, baseY - 1, tileW, 4);
    }

    function drawBushCluster(ctxRef, x, baseY, w, h, dark, mid, light, variant) {
        ctxRef.fillStyle = dark;
        ctxRef.beginPath();
        ctxRef.moveTo(x, baseY);
        ctxRef.lineTo(x + Math.floor(w * 0.08), baseY - Math.floor(h * 0.42));
        ctxRef.lineTo(x + Math.floor(w * 0.23), baseY - Math.floor(h * 0.78));
        ctxRef.lineTo(x + Math.floor(w * 0.39), baseY - Math.floor(h * 0.58));
        ctxRef.lineTo(x + Math.floor(w * 0.55), baseY - h);
        ctxRef.lineTo(x + Math.floor(w * 0.78), baseY - Math.floor(h * 0.62));
        ctxRef.lineTo(x + w, baseY);
        ctxRef.closePath();
        ctxRef.fill();

        ctxRef.fillStyle = mid;
        ctxRef.fillRect(x + Math.floor(w * 0.08), baseY - Math.floor(h * 0.45), Math.floor(w * 0.28), Math.floor(h * 0.42));
        ctxRef.fillRect(x + Math.floor(w * 0.34), baseY - Math.floor(h * 0.66), Math.floor(w * 0.25), Math.floor(h * 0.62));
        ctxRef.fillRect(x + Math.floor(w * 0.61), baseY - Math.floor(h * 0.50), Math.floor(w * 0.30), Math.floor(h * 0.47));

        ctxRef.fillStyle = light;
        if (variant % 2 === 0) {
            ctxRef.fillRect(x + Math.floor(w * 0.19), baseY - Math.floor(h * 0.62), 10, 6);
            ctxRef.fillRect(x + Math.floor(w * 0.66), baseY - Math.floor(h * 0.42), 8, 5);
        } else {
            ctxRef.fillRect(x + Math.floor(w * 0.43), baseY - Math.floor(h * 0.78), 9, 6);
            ctxRef.fillRect(x + Math.floor(w * 0.10), baseY - Math.floor(h * 0.34), 7, 5);
        }
    }

    function buildMidBushLayer(ctxRef, tileW, tileH, pal) {
        const baseY = GROUND_Y - 2;
        const clusters = [
            [0, 86, 54], [62, 72, 43], [121, 101, 68], [210, 68, 45],
            [257, 112, 73], [354, 77, 50], [421, 92, 63], [491, 78, 44]
        ];
        for (let i = 0; i < clusters.length; i++) {
            const b = clusters[i];
            drawBushCluster(ctxRef, b[0], baseY, b[1], b[2], pal.bushDark, pal.bushMid, pal.bushLight, i);
        }
        ctxRef.fillStyle = 'rgba(13, 30, 24, 0.36)';
        ctxRef.fillRect(0, baseY - 8, BACKGROUND_TILE_W, 10);
    }

    function buildFrontGrassLayer(ctxRef, tileW, tileH, pal) {
        const baseY = GROUND_Y;
        ctxRef.fillStyle = pal.grassDark;
        ctxRef.fillRect(0, baseY - 17, BACKGROUND_TILE_W, 17);
        ctxRef.fillStyle = pal.grassMid;
        ctxRef.fillRect(0, baseY - 15, BACKGROUND_TILE_W, 5);
        ctxRef.fillStyle = pal.grassHi;
        ctxRef.fillRect(0, baseY - 10, BACKGROUND_TILE_W, 3);

        const tufts = [
            [8, 10], [22, 16], [41, 8], [58, 19], [86, 13], [119, 18],
            [145, 11], [172, 20], [205, 14], [233, 9], [261, 17],
            [296, 12], [322, 21], [353, 10], [379, 16], [411, 13],
            [438, 19], [472, 11], [498, 15]
        ];
        for (let i = 0; i < tufts.length; i++) {
            const t = tufts[i];
            const x = t[0];
            const h = t[1];
            ctxRef.fillStyle = i % 3 === 0 ? pal.grassHi : pal.grassMid;
            ctxRef.fillRect(x, baseY - h, 3, h);
            ctxRef.fillRect(x + 4, baseY - Math.floor(h * 0.72), 2, Math.floor(h * 0.72));
            if (i % 2 === 0) ctxRef.fillRect(x - 4, baseY - Math.floor(h * 0.55), 2, Math.floor(h * 0.55));
        }

        ctxRef.fillStyle = pal.grassDetail;
        for (let x = 0; x < BACKGROUND_TILE_W; x += 23) {
            const y = baseY - 5 - ((x * 7) % 4);
            ctxRef.fillRect(x, y, 8, 2);
        }
    }

    function bossAttackLevel() {
        if (!bossActive || state === STATE.WIN) return 0;
        if (state !== STATE.BOSS && state !== STATE.DEAD && state !== STATE.GAMEOVER) return 0;
        return clamp01(bossEntranceTimer * 0.75 + bossTime * 0.08);
    }

    function drawLightningBolt(points, alpha) {
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.strokeStyle = 'rgba(97, 54, 155, 0.42)';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
        ctx.stroke();
        ctx.strokeStyle = '#9d77ff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
        ctx.stroke();
        ctx.strokeStyle = '#f0ecff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
        ctx.stroke();
        ctx.restore();
    }

    function drawBossStorm(alphaScale = 1) {
        const storm = bossAttackLevel() * alphaScale;
        if (storm <= 0.02) return;

        const t = performance.now() / 1000;
        const topH = Math.max(180, GROUND_Y * 0.46);
        ctx.save();

        const stormGradient = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
        stormGradient.addColorStop(0, 'rgba(4, 8, 18, ' + (0.62 * storm) + ')');
        stormGradient.addColorStop(0.48, 'rgba(12, 20, 35, ' + (0.42 * storm) + ')');
        stormGradient.addColorStop(1, 'rgba(24, 18, 28, ' + (0.15 * storm) + ')');
        ctx.fillStyle = stormGradient;
        ctx.fillRect(0, 0, W, GROUND_Y);

        // Techo de nubes pesadas: bloques pixelados y en movimiento lento.
        const cloudRows = [
            { y: 18, h: 58, step: 92, speed: 0.10, a: 0.54 },
            { y: 58, h: 72, step: 118, speed: 0.15, a: 0.46 },
            { y: 116, h: 56, step: 84, speed: 0.22, a: 0.32 }
        ];
        for (let r = 0; r < cloudRows.length; r++) {
            const row = cloudRows[r];
            const offset = ((backgroundCameraX * row.speed + t * (8 + r * 3)) % row.step + row.step) % row.step;
            for (let x = -row.step - offset; x < W + row.step; x += row.step) {
                const wobble = Math.floor(Math.sin(t * 0.7 + x * 0.03 + r) * 5);
                ctx.globalAlpha = storm * row.a;
                ctx.fillStyle = r === 0 ? '#111625' : (r === 1 ? '#1a2130' : '#273044');
                ctx.fillRect(Math.round(x), row.y + wobble, row.step + 34, row.h);
                ctx.fillRect(Math.round(x + 22), row.y - 14 + wobble, row.step - 18, Math.floor(row.h * 0.48));
                ctx.fillStyle = r === 0 ? '#242b3a' : '#333b4d';
                ctx.fillRect(Math.round(x + 8), row.y + row.h - 14 + wobble, row.step - 26, 12);
                ctx.fillRect(Math.round(x + 48), row.y + 8 + wobble, Math.floor(row.step * 0.42), 10);
            }
        }
        ctx.globalAlpha = 1;

        // Lluvia diagonal, barata de dibujar y detras del gameplay.
        ctx.save();
        ctx.globalAlpha = storm * 0.55;
        ctx.strokeStyle = 'rgba(155, 185, 220, 0.62)';
        ctx.lineWidth = 1;
        const rainCount = 72;
        const rainPhase = t * 360 + backgroundCameraX * 0.34;
        for (let i = 0; i < rainCount; i++) {
            const rx = Math.floor(((i * 47 + rainPhase) % (W + 130)) - 80);
            const ry = Math.floor((i * 91 + rainPhase * 1.7) % GROUND_Y);
            const len = 12 + (i % 4) * 5;
            ctx.beginPath();
            ctx.moveTo(rx, ry);
            ctx.lineTo(rx - 8, ry + len);
            ctx.stroke();
        }
        ctx.restore();

        // Relampagos visuales ocasionales, sin tapar el panel.
        const pulse = (Math.sin(t * 1.7) + Math.sin(t * 2.37 + 1.6) + 2) / 4;
        const flash = storm * clamp01((pulse - 0.86) / 0.14);
        if (flash > 0.02) {
            ctx.fillStyle = 'rgba(180, 200, 255, ' + (0.16 * flash) + ')';
            ctx.fillRect(0, 0, W, Math.min(GROUND_Y, topH + 80));
            const x0 = Math.floor(W * (0.22 + ((Math.floor(t * 1.7) % 3) * 0.22)));
            drawLightningBolt([
                [x0, 0],
                [x0 + 16, 42],
                [x0 - 12, 88],
                [x0 + 26, 132],
                [x0 + 6, 190],
                [x0 + 34, 240]
            ], flash);
            drawLightningBolt([
                [x0 + 6, 132],
                [x0 - 38, 168],
                [x0 - 26, 218]
            ], flash * 0.65);
        }

        ctx.restore();
    }

    function drawCityAttack(alphaScale = 1) {
        const attack = bossAttackLevel() * alphaScale;
        if (attack <= 0.02) return;

        const t = performance.now() / 1000;
        const baseY = GROUND_Y - 8;
        ctx.save();
        ctx.globalAlpha = Math.min(0.95, attack);

        // Tinte lejano integrado al skyline. Bajo contraste para que no parezca overlay.
        ctx.fillStyle = isNight ? 'rgba(96, 16, 28, 0.24)' : 'rgba(130, 36, 30, 0.18)';
        ctx.fillRect(0, Math.max(0, baseY - 145), W, 145);
        const fireGlow = ctx.createLinearGradient(0, baseY - 120, 0, baseY + 10);
        fireGlow.addColorStop(0, 'rgba(255, 92, 32, 0)');
        fireGlow.addColorStop(0.72, 'rgba(255, 92, 32, ' + (0.16 * attack) + ')');
        fireGlow.addColorStop(1, 'rgba(255, 184, 74, ' + (0.18 * attack) + ')');
        ctx.fillStyle = fireGlow;
        ctx.fillRect(0, baseY - 140, W, 150);

        const firePalette = ['#5b1414', '#a32316', '#ff5a1f', '#ff9c1a', '#ffd34d'];
        for (let i = 0; i < 16; i++) {
            const fx = Math.floor(((i * 61 - cityOffset * (0.48 + (i % 3) * 0.08)) % (W + 140) + W + 140) % (W + 140) - 70);
            const fy = Math.floor(baseY - 8 - (i % 5) * 17);
            const flicker = Math.floor((Math.sin(t * 9 + i * 1.7) + 1) * 1.5);
            const scale = 3 + (i % 2);
            const h = 5 + (i % 4) + flicker;

            // Sombra/brasas adheridas al edificio.
            ctx.fillStyle = firePalette[0];
            ctx.fillRect(fx - scale * 2, fy - h * scale + scale, scale * 5, h * scale);
            ctx.fillStyle = firePalette[1];
            ctx.fillRect(fx - scale, fy - (h - 1) * scale, scale * 3, (h - 1) * scale);

            // Llama pixel-art por columnas, sin curvas.
            for (let row = 0; row < h; row++) {
                const y = fy - row * scale;
                const rowWidth = Math.max(1, Math.floor((h - row + (i + row + flicker) % 2) / 2));
                for (let col = -rowWidth; col <= rowWidth; col++) {
                    const edge = Math.abs(col) + row * 0.55;
                    const pal = edge < h * 0.28 ? 4 : (edge < h * 0.48 ? 3 : 2);
                    ctx.fillStyle = firePalette[pal];
                    ctx.fillRect(fx + col * scale, y, scale, scale);
                }
            }
        }

        // Humo pixel-art: bloques semitransparentes que suben desde el skyline.
        for (let i = 0; i < 13; i++) {
            const sx = Math.floor(((i * 73 - cityOffset * 0.32) % (W + 160) + W + 160) % (W + 160) - 80);
            const sy = Math.floor(baseY - 48 - (i % 5) * 27 - Math.sin(t * 1.2 + i) * 7);
            const smoke = isNight ? 'rgba(15, 14, 24, 0.50)' : 'rgba(49, 52, 59, 0.38)';
            const smokeHi = isNight ? 'rgba(55, 48, 70, 0.30)' : 'rgba(95, 96, 104, 0.24)';
            for (let p = 0; p < 6; p++) {
                const block = 12 + ((i + p) % 3) * 5;
                const px0 = sx + p * 9 - 28 + Math.floor(Math.sin(t * 1.6 + i + p) * 4);
                const py0 = sy - p * 12;
                ctx.fillStyle = p % 2 === 0 ? smoke : smokeHi;
                ctx.fillRect(px0, py0, block + 8, block);
                ctx.fillRect(px0 + 6, py0 - 6, block, block);
            }
        }

        // Chispas cuadradas pequenas.
        for (let i = 0; i < 54; i++) {
            const sx = Math.floor(((i * 37 - t * 74 - cityOffset * 0.25) % (W + 80) + W + 80) % (W + 80) - 40);
            const sy = Math.floor(baseY - 165 + ((i * 41 + t * 58) % 145));
            const blink = (Math.sin(t * 10 + i) + 1) / 2;
            ctx.globalAlpha = attack * (0.35 + blink * 0.45);
            ctx.fillStyle = i % 4 === 0 ? '#ff9c1a' : '#ffd34d';
            ctx.fillRect(sx, sy, i % 5 === 0 ? 3 : 2, i % 5 === 0 ? 3 : 2);
        }

        ctx.globalAlpha = Math.min(0.86, attack);
        for (let i = 0; i < 22; i++) {
            const wx = Math.floor(((i * 43 - cityOffset * 0.55) % (W + 100) + W + 100) % (W + 100) - 50);
            const wy = Math.floor(baseY - 108 + (i * 19) % 92);
            const hot = (Math.sin(t * 5.5 + i) + 1) / 2;
            ctx.fillStyle = hot > 0.55 ? '#ff9c1a' : '#a32316';
            ctx.fillRect(wx, wy, 4, 5);
            if (hot > 0.78) {
                ctx.fillStyle = '#ffd34d';
                ctx.fillRect(wx + 1, wy, 2, 2);
            }
        }

        ctx.restore();
    }

    function desertProgress() {
        return state === STATE.WIN ? clamp01((winTimer - 1.15) / 2.2) : 0;
    }

    function zoneDesertLevel() {
        return Math.max(currentZone === 2 ? 1 : 0, desertProgress());
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

    function drawPipeSegment(x, y0, y1, width, startCap, endCap) {
        const top = Math.max(0, Math.min(GROUND_Y, Math.round(y0)));
        const bottom = Math.max(0, Math.min(GROUND_Y, Math.round(y1)));
        if (bottom - top <= 4) return;

        if (startCap) ctx.drawImage(pipeSprite.cap, x - 4, top, width + 8, PIPE_CAP_H);
        const bodyY = top + (startCap ? PIPE_CAP_H : 0);
        const bodyBottom = bottom - (endCap ? PIPE_CAP_H : 0);
        const bodyH = bodyBottom - bodyY;
        if (bodyH > 0) {
            ctx.drawImage(pipeSprite.body, 0, 0, PIPE_WIDTH, 1, x, bodyY, width, bodyH);
            ctx.fillStyle = '#243f0e';
            ctx.fillRect(x, bodyY, 2, bodyH);
            ctx.fillRect(x + width - 2, bodyY, 2, bodyH);
        }
        if (endCap) ctx.drawImage(pipeSprite.cap, x - 4, bottom - PIPE_CAP_H, width + 8, PIPE_CAP_H);
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

        const floating = p.topStart !== null && p.topStart !== undefined;
        drawPipeSegment(p.x, floating ? p.topStart : 0, p.top, pWidth, floating, true);
        drawPipeSegment(p.x, p.bottom, floating ? p.bottomEnd : GROUND_Y, pWidth, true, floating);

        if (currentZone === 2 || state === STATE.WIN) drawDesertPipeOrnaments(p.x, p.top, p.bottom, pWidth);
        ctx.restore();
    }

    function drawBossEnergyFX(drawX, drawY, sw, sh, sc) {
        if (state === STATE.WIN) return;
        const t = performance.now() / 1000;
        const phaseBoost = bossPhase >= 2 ? 1 : 0.45;

        // Cristales orbitando alrededor del jefe.
        ctx.save();
        for (let i = 0; i < 5; i++) {
            const a = t * (0.9 + i * 0.08) + i * 1.37;
            const rx = sw * (0.36 + (i % 2) * 0.08);
            const ry = sh * (0.22 + (i % 3) * 0.04);
            const px0 = drawX + Math.cos(a) * rx + Math.sin(t * 2 + i) * 4 * sc;
            const py0 = drawY + Math.sin(a * 1.25) * ry;
            const size = (4 + (i % 2) * 2) * sc * phaseBoost;
            ctx.globalAlpha = 0.35 + phaseBoost * 0.38;
            ctx.fillStyle = i % 2 === 0 ? '#8b28ff' : '#b45cff';
            ctx.beginPath();
            ctx.moveTo(px0, py0 - size);
            ctx.lineTo(px0 + size * 0.75, py0);
            ctx.lineTo(px0, py0 + size);
            ctx.lineTo(px0 - size * 0.75, py0);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = '#f2c8ff';
            ctx.fillRect(Math.floor(px0), Math.floor(py0 - size * 0.55), Math.max(1, Math.floor(sc)), Math.max(1, Math.floor(sc)));
        }
        ctx.restore();

        // Brillos dorados de los tanques superiores.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
            const px0 = drawX - sw * 0.15 + i * sw * 0.12;
            const py0 = drawY - sh * 0.43 + Math.sin(t * 5 + i) * 2 * sc;
            const r = (15 + Math.sin(t * 6 + i) * 4) * sc * phaseBoost;
            const g = ctx.createRadialGradient(px0, py0, 2, px0, py0, r);
            g.addColorStop(0, 'rgba(255, 209, 76, 0.55)');
            g.addColorStop(1, 'rgba(255, 209, 76, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(px0 - r, py0 - r, r * 2, r * 2);
        }
        ctx.restore();

        if (bossPhase >= 2) {
            ctx.save();
            ctx.globalAlpha = bossPhase === 3 ? 0.75 : 0.45;
            ctx.strokeStyle = bossPhase === 3 ? '#d88cff' : '#ff5160';
            ctx.lineWidth = Math.max(2, 2.5 * sc);
            for (let i = 0; i < (bossPhase === 3 ? 5 : 3); i++) {
                const y = drawY - sh * 0.2 + i * sh * 0.1 + Math.sin(t * 8 + i) * 6 * sc;
                ctx.beginPath();
                ctx.moveTo(drawX - sw * 0.37, y);
                ctx.lineTo(
                    drawX - sw * (0.46 + Math.sin(t * 9 + i) * 0.035),
                    y + Math.sin(t * 11 + i * 1.8) * 8 * sc
                );
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    function drawBossPanelLights(sc) {
        if (state === STATE.WIN) return;

        const t = performance.now() / 1000;
        const unit = BOSS_PIXEL * sc;
        const charge = bossPhase === 1 ? clamp01(bossTime / BOSS_RAY_PHASE_AT) : 1;
        const attackBoost = bossPhase >= 2 ? 1.0 : 0.45 + charge * 0.55;
        const panels = [
            { x: -20, y: -13, w: 5, h: 1, c: '#5ee8ff', rate: 1.4, seed: 1.1, on: 2 },
            { x: -10, y: -11, w: 3, h: 1, c: '#ffd34d', rate: 1.1, seed: 2.7, on: 3 },
            { x: 5, y: -9, w: 2, h: 2, c: '#b45cff', rate: 1.7, seed: 4.3, on: 2 },
            { x: 12, y: -4, w: 1, h: 3, c: '#ff5a1f', rate: 1.25, seed: 5.8, on: 2 },
            { x: -14, y: 8, w: 4, h: 1, c: '#ef1f2d', rate: 1.9, seed: 7.2, on: 3 },
            { x: -2, y: 5, w: 2, h: 2, c: '#8b28ff', rate: 1.55, seed: 8.5, on: 2 },
            { x: 11, y: 9, w: 2, h: 1, c: '#5ee8ff', rate: 1.35, seed: 9.8, on: 2 },
            { x: -2, y: -17, w: 2, h: 1, c: '#ffe27a', rate: 1.05, seed: 11.1, on: 3 }
        ];

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const p of panels) {
            const beat = Math.floor(t * p.rate + p.seed + Math.sin(t * 0.9 + p.seed) * 0.7) % 4;
            const strobe = bossPhase >= 2
                ? beat !== 0
                : beat < p.on && Math.sin(t * (2.0 + p.seed * 0.04) + p.seed) > -0.55;
            const alpha = strobe
                ? (0.35 + attackBoost * 0.55 + Math.sin(t * 7 + p.seed) * 0.08)
                : 0.12 + charge * 0.1;
            const px0 = p.x * unit;
            const py0 = p.y * unit;
            const pw = p.w * unit;
            const ph = p.h * unit;

            ctx.globalAlpha = 0.45;
            ctx.fillStyle = '#05030b';
            ctx.fillRect(px0 - unit * 0.35, py0 - unit * 0.35, pw + unit * 0.7, ph + unit * 0.7);

            ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
            ctx.fillStyle = p.c;
            ctx.fillRect(px0, py0, pw, ph);

            if (strobe) {
                ctx.globalAlpha = Math.max(0, Math.min(0.42, alpha * 0.45));
                ctx.fillRect(px0 - unit, py0 - unit, pw + unit * 2, ph + unit * 2);
            }
        }
        ctx.restore();
    }

    function drawBossEyeModule(x, y, w, h, color, hi, blink, lookY, sc) {
        const unit = BOSS_PIXEL * sc;
        const c = BOSS_COLORS;
        ctx.fillStyle = c.k;
        ctx.fillRect(x * unit, y * unit, w * unit, h * unit);

        if (blink) {
            ctx.fillStyle = color;
            ctx.globalAlpha *= 0.75;
            ctx.fillRect((x + 1) * unit, (y + Math.floor(h / 2)) * unit, (w - 2) * unit, unit);
            ctx.globalAlpha /= 0.75;
            return;
        }

        ctx.fillStyle = color;
        ctx.fillRect((x + 1) * unit, (y + 1) * unit, (w - 2) * unit, (h - 2) * unit);
        ctx.fillStyle = hi;
        ctx.fillRect((x + w - 3) * unit, (y + 1 + lookY) * unit, unit, Math.max(unit, 2 * unit));
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect((x + 1) * unit, (y + h - 2) * unit, (w - 2) * unit, unit);
    }

    function drawBossCoreModule(sc, t, lookY) {
        const unit = BOSS_PIXEL * sc;
        const c = BOSS_COLORS;
        const pulse = 0.65 + Math.sin(t * 6.5) * 0.22 + (bossPhase === 3 ? 0.22 : 0);
        ctx.fillStyle = c.k;
        ctx.fillRect(-4 * unit, -3 * unit, 9 * unit, 9 * unit);
        ctx.fillStyle = c.core;
        ctx.fillRect(-3 * unit, -2 * unit, 7 * unit, 7 * unit);
        ctx.fillStyle = c.blue;
        ctx.fillRect(0, (-1 + lookY) * unit, 3 * unit, 3 * unit);
        ctx.fillStyle = c.coreHi;
        ctx.fillRect(-1 * unit, -2 * unit, 2 * unit, 2 * unit);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.42 + pulse * 0.28;
        const glow = ctx.createRadialGradient(0, 0, 2 * unit, 0, 0, 13 * unit * pulse);
        glow.addColorStop(0, 'rgba(139, 40, 255, 0.72)');
        glow.addColorStop(1, 'rgba(139, 40, 255, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(-18 * unit, -18 * unit, 36 * unit, 36 * unit);
        ctx.restore();
    }

    function drawBossTubeGlow(sc, t) {
        if (state === STATE.WIN) return;
        const unit = BOSS_PIXEL * sc;
        const charge = bossPhase === 1 ? clamp01(bossTime / BOSS_RAY_PHASE_AT) : 1;
        const tubePositions = [-16, -5, 6];
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < tubePositions.length; i++) {
            const blink = (Math.sin(t * (9.5 + i) + i * 1.3) + 1) / 2;
            const power = 0.18 + charge * 0.55 + blink * 0.25 + (bossPhase >= 2 ? 0.25 : 0);
            const gx = tubePositions[i] * unit;
            const gy = -18 * unit;
            const r = (7 + power * 10) * unit;
            const glow = ctx.createRadialGradient(gx, gy, 1, gx, gy, r);
            glow.addColorStop(0, 'rgba(255, 211, 77, ' + Math.min(0.78, power) + ')');
            glow.addColorStop(1, 'rgba(255, 211, 77, 0)');
            ctx.fillStyle = glow;
            ctx.globalAlpha = Math.min(1, power);
            ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
        }
        ctx.restore();
    }

    function drawBossModules(sc, drawY) {
        const t = performance.now() / 1000;
        const finRot = Math.sin(t * 3.2 + boss.movePhase) * 0.24 + (bossPhase >= 2 ? -0.08 : 0);
        const tubeSway = Math.sin(t * 2.4) * 0.04;
        const legLift = Math.sin(t * 3.2) * 0.55;
        const blink = Math.sin(t * 2.1 + 0.4) > 0.975 || Math.sin(t * 4.7 + 1.9) > 0.985;
        const trackingY = Math.max(-1, Math.min(1, Math.round((bird.y - drawY) / Math.max(80, H * 0.22))));
        const c = BOSS_COLORS;
        const unit = BOSS_PIXEL * sc;
        const bodyBreath = Math.sin(t * 1.5 + boss.bobPhase) * 0.012;

        drawBossTubeGlow(sc, t);
        drawBossPart(bossParts.fin, 20.5 + Math.sin(t * 2.7) * 0.5, 1, sc, finRot);
        drawBossPart(bossParts.leg, -14.5, 16.4 + legLift, sc, -0.04);
        drawBossPart(bossParts.leg, 4.5, 16.2 - legLift * 0.65, sc, 0.04);
        ctx.save();
        ctx.scale(1 + bodyBreath, 1 - bodyBreath * 0.7);
        drawBossPart(bossParts.body, -5, 0, sc);
        ctx.restore();

        drawBossPanelLights(sc);

        drawBossPart(bossParts.tube, -16, -18.2 + Math.sin(t * 4) * 0.35, sc, -0.13 + tubeSway);
        drawBossPart(bossParts.tube, -5, -20.0 + Math.sin(t * 4 + 1.1) * 0.35, sc, tubeSway * 0.5);
        drawBossPart(bossParts.tube, 6, -18.3 + Math.sin(t * 4 + 2.2) * 0.35, sc, 0.13 + tubeSway);

        drawBossEyeModule(-25, -5, 8, 7, c.red, c.redHi, blink, 0, sc);
        drawBossEyeModule(-16, -5, 8, 7, c.red, c.redHi, blink, 0, sc);
        ctx.save();
        ctx.translate(-1 * unit, 2 * unit);
        drawBossCoreModule(sc, t, trackingY);
        ctx.restore();

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = bossPhase >= 2 ? 0.55 : 0.32;
        ctx.fillStyle = c.core;
        ctx.fillRect(21 * unit, 11 * unit, 2 * unit, 2 * unit);
        ctx.fillRect(25 * unit, 15 * unit, unit, unit);
        ctx.fillRect(23 * unit, -9 * unit, 2 * unit, 2 * unit);
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

        drawBossEnergyFX(drawX, drawY, sw, sh, sc);

        // Sombra debajo del jefe
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(drawX, drawY + sh * 0.4, sw * 0.4, 8 * sc, 0, 0, Math.PI * 2);
        ctx.fill();

        // Modular boss: body, fin, eyes, tubes, core and legs move separately.
        ctx.save();
        ctx.translate(drawX, drawY);
        ctx.rotate(tilt);
        drawBossModules(sc, drawY);
        ctx.restore();

        if (state !== STATE.WIN) {
            const pulse = 0.55 + Math.sin(performance.now() / 130) * 0.2 + (bossPhase === 3 ? 0.25 : 0);
            const coreX = drawX - sw * 0.02;
            const coreY = drawY + sh * 0.04;
            const coreR = (16 + 10 * pulse) * sc;
            const coreGlow = ctx.createRadialGradient(coreX, coreY, 2, coreX, coreY, coreR);
            coreGlow.addColorStop(0, 'rgba(190, 92, 255, ' + Math.min(0.85, pulse) + ')');
            coreGlow.addColorStop(1, 'rgba(190, 92, 255, 0)');
            ctx.fillStyle = coreGlow;
            ctx.fillRect(coreX - coreR, coreY - coreR, coreR * 2, coreR * 2);
        }

        // Brillo en los ojos cuando está cargando un rayo
        if (boss.eyeGlow > 0) {
            const glowR = 22 + boss.eyeGlow * 22;
            const eyeX = drawX - sw * 0.28;
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
                const thickness = (r.thickness || 28) * (1 - t * 0.4);
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
        const desert = zoneDesertLevel();
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
    function drawZoneLock(cx, cy) {
        ctx.save();
        ctx.strokeStyle = '#d5dbe4';
        ctx.fillStyle = '#d5dbe4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy - 2, 6, Math.PI, 0, false);
        ctx.stroke();
        roundedRect(cx - 7, cy - 1, 14, 11, 2);
        ctx.fill();
        ctx.fillStyle = '#202832';
        ctx.fillRect(cx - 1, cy + 3, 2, 4);
        ctx.restore();
    }

    function drawZoneSelector() {
        const l = zoneSelectorLayout();
        ctx.save();
        ctx.font = 'bold 15px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#3a2a1a';
        ctx.fillStyle = '#ffffff';
        const label = 'Zona actual: ' + selectedZone + ' - ' + zoneName(selectedZone);
        ctx.strokeText(label, W / 2, l.y - 22);
        ctx.fillText(label, W / 2, l.y - 22);

        for (let i = 0; i < MAX_ZONES; i++) {
            const zone = i + 1;
            const x = l.x + i * (l.chipW + l.gap);
            const open = isZoneUnlocked(zone);
            const selected = zone === selectedZone;
            roundedRect(x, l.y, l.chipW, l.chipH, 8);
            const bg = ctx.createLinearGradient(0, l.y, 0, l.y + l.chipH);
            if (selected) {
                bg.addColorStop(0, '#ffd34d');
                bg.addColorStop(1, '#f57c00');
            } else if (open) {
                bg.addColorStop(0, '#f5f1cf');
                bg.addColorStop(1, '#b9d45f');
            } else {
                bg.addColorStop(0, 'rgba(43, 50, 58, 0.92)');
                bg.addColorStop(1, 'rgba(26, 30, 36, 0.92)');
            }
            ctx.fillStyle = bg;
            ctx.fill();
            ctx.strokeStyle = selected ? '#7a3e00' : (open ? '#4b6a2b' : '#6b7280');
            ctx.lineWidth = selected ? 3 : 2;
            ctx.stroke();

            ctx.font = open ? 'bold 18px "Segoe UI", sans-serif' : 'bold 16px "Segoe UI", sans-serif';
            ctx.fillStyle = open ? '#3a2a1a' : '#d5dbe4';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (open) {
                ctx.fillText(String(zone), x + l.chipW / 2, l.y + l.chipH / 2 + 1);
            } else {
                ctx.fillText(String(zone), x + l.chipW / 2 - 9, l.y + l.chipH / 2 + 1);
                drawZoneLock(x + l.chipW / 2 + 12, l.y + l.chipH / 2 - 1);
            }
        }
        ctx.restore();
    }

    function drawReadyScreen() {
        drawTextWithShadow('Adventure Bird', W / 2, 130, 50, '#ffd34d');

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
        drawZoneSelector();
    }

    function drawHUDScore() {
        if (state === STATE.PLAYING || state === STATE.DEAD) {
            drawScore(score, W / 2, 80, 64);
        } else if (state === STATE.BOSS) {
            // Barra de espera: primero carga 1 minuto, luego sobrevives 60s de rayos.
            const phaseRemaining = bossPhase === 1
                ? Math.max(0, BOSS_RAY_PHASE_AT - bossTime)
                : Math.max(0, BOSS_FIGHT_DURATION - bossTime);
            const remaining = phaseRemaining;
            const mm = Math.floor(remaining / 60);
            const ss = Math.floor(remaining % 60);
            const timeStr = mm + ':' + String(ss).padStart(2, '0');
            const label = bossPhase === 1 ? 'JEFE FINAL' : (bossPhase === 2 ? 'RAYOS' : 'FURIA FINAL');
            drawTextWithShadow(label, W / 2, 50, 32, '#ff5160');
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
            if (bossPhase >= 2) {
                const pulse = (Math.sin(performance.now() / 120) + 1) / 2;
                ctx.globalAlpha = 0.65 + pulse * 0.35;
                drawTextWithShadow(
                    bossPhase === 3 ? '¡2-3 RAYOS!' : '¡ESQUIVA LOS RAYOS!',
                    W / 2,
                    by + barH / 2 + 105,
                    26,
                    '#ff5160'
                );
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

        drawTextWithShadow(winTimer > 1.2 ? 'Zona 2 desbloqueada' : 'Has derrotado al jefe final', W / 2, 185, 20, '#ffffff');

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
                { icon: '⚔', text: 'Sobreviviste 2:00 al jefe' },
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
            drawTextWithShadow('▶ IR A ZONA 2', W / 2, by + bh / 2 + 1, 20, '#ffffff');
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
            ctx.translate(px0 + pw - 128, py + 118);
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

        const dProg = zoneDesertLevel();
        drawBackground(1 - dProg);
        if (dProg > 0) {
            drawBossStorm(1 - dProg);
            drawCityAttack(1 - dProg);
            drawDesertScenery(dProg);
        } else {
            drawBossStorm();
            drawCityAttack();
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
