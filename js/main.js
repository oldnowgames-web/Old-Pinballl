
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ============================================================
// NEON PINBALL — 3D arcade table, custom sub-stepped physics
// ============================================================

const canvas = document.querySelector('#game-canvas');
const stage = document.querySelector('#game-stage');
const $ = (s) => document.querySelector(s);
const ui = {
  score: $('#score-value'), best: $('#best-value'), sideBest: $('#side-best'),
  multiplier: $('#multiplier-value'), lives: $('#lives-value'), toast: $('#toast'),
  start: $('#start-screen'), pause: $('#pause-screen'), gameover: $('#gameover-screen'),
  finalScore: $('#final-score'), startButton: $('#start-button'), resumeButton: $('#resume-button'),
  restartButton: $('#restart-button'), leftTouch: $('#left-touch'), rightTouch: $('#right-touch'),
  launchTouch: $('#launch-touch'), power: $('#power-meter'), powerFill: $('#power-fill'),
  laneDots: [...$('#lane-dots').children], targetDots: [...$('#target-dots').children],
  saveBadge: $('#save-badge'),
  coinBtn: $('#coin-button'), coinBtn2: $('#coin-button-2'), credit: $('#credit-status'), credit2: $('#credit-status-2'),
  coinFooter: $('#coin-footer'), coinFooterLabel: $('#coin-footer-label'),
  themeFooter: $('#theme-footer'), themeFooterLabel: $('#theme-footer-label')
};

const THREE_VERSION = '0.185.0';
// ---- Table layout (x: left/right, z: top(-)/bottom(+)) ----
const L = -4.55, R = 3.55, OUT = 4.55, CX = -0.5, TOPZ = -8.45, PLUNGER_Z = 7.95;
const LANE_X = 4.05, REST_Z = 7.72;
const SURFACE_Y = 1.02, BALL_R = 0.22, WALL_T = 0.06;
const GRAVITY = 6.6, MAX_SPEED = 21;
const BEST_KEY = 'neonPinballBest_v2';

let bestScore = 0;
try { bestScore = Number(localStorage.getItem(BEST_KEY) || localStorage.getItem('neonPinballBest_v1') || 0) || 0; } catch (e) {}
let score = 0, lives = 3, laneMult = 1, comboMult = 1, multiplier = 1;
let state = 'menu'; // menu | playing | paused | gameover
let ballLaunched = false;
let leftHeld = false, rightHeld = false;
let charging = false, plungerPower = 0, plungerTick = 0;
let cameraShake = 0, toastTimer = 0, comboTimer = 0, comboCount = 0;
let elapsed = 0, lastTime = performance.now();
let saveTimer = 0, hitsThisBall = 0, boostTimer = 0, stuckTimer = 0, stuckKicks = 0;
let tilted = false, nudgeLog = [];
let spinSpeed = 0;
// Ficha (token) system: one ficha = one game of 3 balls ("jogadas"). Only one ficha at a time.
const PLAYS_PER_FICHA = 3;
let ficha = false;
let coinAnim = null;        // { t, dur, returnTo } while the insert cinematic runs
let coinFlash = 0;
let lanesLit = [false, false, false], targetsLit = [false, false, false, false];

// ------------------------------------------------------------
// Table styles (themes): palette, playfield art, backglass, cabinet, lights
// ------------------------------------------------------------
const THEME_KEY = 'neonPinballTheme_v1';
const THEMES = [
  {
    id: 'classic', name: 'CLÁSSICO', title: ['OLD', 'PINBALL'], sub: 'FLIPERAMA • MESA Nº 001',
    css: { accent: '#f9b044', accent2: '#e54433', gold: '#ffbe49', text: '#fee6bc', bg: '#150e06', acc: '249,176,68', p1: '35,28,18', p2: '23,16,8', shadow: '#6e2216' },
    scene: { bg: '#1c130d', fog: 0.012, exposure: 1.12, env: 0.22, bloom: [0.1, 0.4, 0.95], hemi: ['#ffe7c4', '#2a1a10', 0.95], amb: ['#7d9dca', 0.3], key: ['#fff0d8', 2.8], rim: ['#c08a50', 1.6], fillA: '#ffb067', fillB: '#9fc4c0', floor: '#2e1f14', bumpEm: 0.3 },
    mats: { wood: true, dark: '#4a3220', frame: '#a8743f', steel: '#c4bfb2', metal: 0.8, rubber: '#1c1511', cyan: ['#efe2bd', '#cdb98a', 0.12], blue: ['#4d9a94', '#2f6f6b', 0.1], pink: ['#c8472f', '#b3402c', 0.1], gold: ['#d4a24a', '#8a5a14', 0.08], glow: '#f3e6c4' },
    pal: { light: '#efe2bd', gold: '#e2a838', teal: '#4d9a94', red: '#c8472f', ink: '#f3e6c4', sub: '#d9a77a' },
    field: { g: ['#2f625c', '#285651', '#1f4642'], glow1: 'rgba(255,240,200,.14)', glow2: 'rgba(190,70,50,.16)', fade: 'rgba(20,50,45,0)', grid: 'rgba(240,225,185,.09)', b1: 'rgba(235,205,140,.85)', b2: 'rgba(200,70,50,.75)', trace: 'rgba(240,225,185,.2)', traceDot: 'rgba(240,225,185,.4)', star: '240,225,185', deco: 'classic', traces: true, glow: false },
    bumpers: [{ hex: '#efe2bd', em: '#cdb98a', css: '#efe2bd' }, { hex: '#d6604a', em: '#b3402c', css: '#c8472f' }, { hex: '#e8b84a', em: '#8a5a14', css: '#e2a838' }],
    targets: [{ hex: '#4d9a94', em: '#2f6f6b', css: '#4d9a94' }, { hex: '#e8b84a', em: '#8a5a14', css: '#e2a838' }, { hex: '#d6604a', em: '#b3402c', css: '#c8472f' }, { hex: '#efe2bd', em: '#cdb98a', css: '#efe2bd' }],
    sling: { c: '#a63a2c', e: '#4a1a10' }, flipper: { c: '#e6dcc2', e: '#cdb98a' }, ball: { c: '#f2fbff', glow: '#ffd9a0', trail: '#d9c9a0' },
    glass: { tint: '#d6ccb0', bg: '#eadcb4', a: '#d9c48a', b: '#e6d6a6', rings: ['#a63a2c', '#e2a838', '#2f6f6b', '#efe2bd'], ink: '#3a2616', star: '#a63a2c' },
    sign: { bg: '#e6d9b4', ink: '#2a1b10' }
  },
  {
    id: 'neon', name: 'NEON CITY', title: ['NEON', 'PINBALL'], sub: 'CIDADE ELÉTRICA • MESA Nº 002',
    css: { accent: '#65eaff', accent2: '#ff4fd8', gold: '#ffd24a', text: '#e3f6ff', bg: '#050b17', acc: '101,234,255', p1: '14,20,44', p2: '8,12,28', shadow: '#7a1f6a' },
    scene: { bg: '#050a16', fog: 0.014, exposure: 1.0, env: 0.3, bloom: [0.7, 0.55, 0.78], hemi: ['#8fb4ff', '#0a0f24', 0.55], amb: ['#6a7dff', 0.35], key: ['#cfe0ff', 1.8], rim: ['#ff4fd8', 2.2], fillA: '#ff4fd8', fillB: '#65eaff', floor: '#070d1c', bumpEm: 0.9 },
    mats: { wood: false, dark: '#141c34', frame: '#1d2848', steel: '#9aa8c8', metal: 0.9, rubber: '#0b0e18', cyan: ['#65eaff', '#2fd6ff', 1.2], blue: ['#4a7dff', '#2f5cff', 0.8], pink: ['#ff4fd8', '#ff2fc0', 1.0], gold: ['#ffd24a', '#ff9a1f', 0.5], glow: '#bff6ff' },
    pal: { light: '#65eaff', gold: '#ffd24a', teal: '#4a7dff', red: '#ff4fd8', ink: '#eaffff', sub: '#ff9de8' },
    field: { g: ['#0b1230', '#0a1029', '#070b1f'], glow1: 'rgba(101,234,255,.16)', glow2: 'rgba(255,79,216,.16)', fade: 'rgba(5,10,25,0)', grid: 'rgba(101,234,255,.10)', b1: 'rgba(101,234,255,.9)', b2: 'rgba(255,79,216,.8)', trace: 'rgba(101,234,255,.25)', traceDot: 'rgba(255,79,216,.6)', star: '150,220,255', deco: 'neon', traces: true, glow: true },
    bumpers: [{ hex: '#65eaff', em: '#1fc8ff', css: '#65eaff' }, { hex: '#ff4fd8', em: '#ff2fc0', css: '#ff4fd8' }, { hex: '#ffd24a', em: '#ff9a1f', css: '#ffd24a' }],
    targets: [{ hex: '#65eaff', em: '#1fc8ff', css: '#65eaff' }, { hex: '#ffd24a', em: '#ff9a1f', css: '#ffd24a' }, { hex: '#ff4fd8', em: '#ff2fc0', css: '#ff4fd8' }, { hex: '#8f6bff', em: '#6a3cff', css: '#8f6bff' }],
    sling: { c: '#ff2fc0', e: '#ff4fd8' }, flipper: { c: '#d9f4ff', e: '#65eaff' }, ball: { c: '#f2fbff', glow: '#7fe8ff', trail: '#8feaff' },
    glass: { tint: '#ffffff', bg: '#0b1230', a: '#101a45', b: '#0b1230', rings: ['#ff4fd8', '#8f6bff', '#4a7dff', '#65eaff'], ink: '#eaffff', star: '#65eaff' },
    sign: { bg: '#0e1630', ink: '#65eaff' }
  },
  {
    id: 'space', name: 'COSMOS', title: ['COSMOS', 'PINBALL'], sub: 'ESTAÇÃO ORBITAL • MESA Nº 003',
    css: { accent: '#b78bff', accent2: '#ff8a3d', gold: '#ffd27a', text: '#efe6ff', bg: '#07040f', acc: '183,139,255', p1: '24,16,48', p2: '12,8,28', shadow: '#5a2a10' },
    scene: { bg: '#07040f', fog: 0.012, exposure: 1.05, env: 0.28, bloom: [0.45, 0.5, 0.85], hemi: ['#b9a6ff', '#120a24', 0.7], amb: ['#6a5bd6', 0.35], key: ['#f0e8ff', 2.2], rim: ['#ff8a3d', 1.6], fillA: '#ff8a3d', fillB: '#8f6bff', floor: '#0a0614', bumpEm: 0.6 },
    mats: { wood: false, dark: '#1d1733', frame: '#2c2450', steel: '#b8b3d4', metal: 0.85, rubber: '#120e1e', cyan: ['#e8dcff', '#b78bff', 0.6], blue: ['#6a5bd6', '#4a3cc8', 0.6], pink: ['#ff8a3d', '#ff6a1f', 0.6], gold: ['#ffd27a', '#c8861a', 0.4], glow: '#e8dcff' },
    pal: { light: '#e8dcff', gold: '#ffd27a', teal: '#8f6bff', red: '#ff8a3d', ink: '#f4eeff', sub: '#c8b0ff' },
    field: { g: ['#150a33', '#0d0724', '#070418'], glow1: 'rgba(160,120,255,.2)', glow2: 'rgba(255,138,61,.12)', fade: 'rgba(7,4,24,0)', grid: 'rgba(183,139,255,.06)', b1: 'rgba(200,170,255,.85)', b2: 'rgba(255,138,61,.7)', trace: 'rgba(183,139,255,.2)', traceDot: 'rgba(255,200,150,.5)', star: '235,225,255', deco: 'space', traces: false, glow: true },
    bumpers: [{ hex: '#e8dcff', em: '#b78bff', css: '#e8dcff' }, { hex: '#ff8a3d', em: '#ff6a1f', css: '#ff8a3d' }, { hex: '#ffd27a', em: '#c8861a', css: '#ffd27a' }],
    targets: [{ hex: '#8f6bff', em: '#6a3cff', css: '#8f6bff' }, { hex: '#ffd27a', em: '#c8861a', css: '#ffd27a' }, { hex: '#ff8a3d', em: '#ff6a1f', css: '#ff8a3d' }, { hex: '#e8dcff', em: '#b78bff', css: '#e8dcff' }],
    sling: { c: '#ff6a1f', e: '#ff8a3d' }, flipper: { c: '#e8e0ff', e: '#b78bff' }, ball: { c: '#f6f2ff', glow: '#c8b0ff', trail: '#b8a6ff' },
    glass: { tint: '#ffffff', bg: '#0d0724', a: '#150a33', b: '#0d0724', rings: ['#ff8a3d', '#ffd27a', '#6a5bd6', '#e8dcff'], ink: '#f4eeff', star: '#ffd27a' },
    sign: { bg: '#1a1236', ink: '#e8dcff' }
  },
  {
    id: 'ocean', name: 'OCEANO', title: ['OCEANO', 'PINBALL'], sub: 'FUNDO DO MAR • MESA Nº 004',
    css: { accent: '#4fe3d0', accent2: '#ff7a5c', gold: '#ffd27a', text: '#dffaf5', bg: '#031418', acc: '79,227,208', p1: '10,40,48', p2: '5,24,30', shadow: '#7a2a1a' },
    scene: { bg: '#04181e', fog: 0.016, exposure: 1.05, env: 0.25, bloom: [0.3, 0.45, 0.88], hemi: ['#9fe8e0', '#06242b', 0.85], amb: ['#4aa8c8', 0.4], key: ['#e4fff8', 2.3], rim: ['#4fe3d0', 1.4], fillA: '#ff7a5c', fillB: '#4fe3d0', floor: '#061a20', bumpEm: 0.35 },
    mats: { wood: true, dark: '#3b3a2e', frame: '#7a5a30', steel: '#d4b86a', metal: 0.85, rubber: '#0e1a1c', cyan: ['#dffaf5', '#4fe3d0', 0.3], blue: ['#2a8fb8', '#1f78a0', 0.3], pink: ['#ff7a5c', '#e8553a', 0.3], gold: ['#ffd27a', '#c8861a', 0.3], glow: '#dffaf5' },
    pal: { light: '#dffaf5', gold: '#ffd27a', teal: '#4fe3d0', red: '#ff7a5c', ink: '#e8fffa', sub: '#9fe8e0' },
    field: { g: ['#0a4f66', '#08405a', '#052d44'], glow1: 'rgba(150,255,240,.18)', glow2: 'rgba(255,122,92,.12)', fade: 'rgba(5,45,68,0)', grid: 'rgba(160,240,235,.06)', b1: 'rgba(255,210,122,.85)', b2: 'rgba(255,122,92,.7)', trace: 'rgba(160,240,235,.18)', traceDot: 'rgba(160,240,235,.4)', star: '200,255,250', deco: 'ocean', traces: false, glow: false },
    bumpers: [{ hex: '#dffaf5', em: '#4fe3d0', css: '#dffaf5' }, { hex: '#ff7a5c', em: '#e8553a', css: '#ff7a5c' }, { hex: '#ffd27a', em: '#c8861a', css: '#ffd27a' }],
    targets: [{ hex: '#4fe3d0', em: '#1fb8a4', css: '#4fe3d0' }, { hex: '#ffd27a', em: '#c8861a', css: '#ffd27a' }, { hex: '#ff7a5c', em: '#e8553a', css: '#ff7a5c' }, { hex: '#dffaf5', em: '#4fe3d0', css: '#dffaf5' }],
    sling: { c: '#e8553a', e: '#ff7a5c' }, flipper: { c: '#f0e2b8', e: '#ffd27a' }, ball: { c: '#f2fbff', glow: '#bff6ee', trail: '#a8e8e0' },
    glass: { tint: '#ffffff', bg: '#bfeee6', a: '#8fd8d0', b: '#b4ece4', rings: ['#e8553a', '#ffd27a', '#1f78a0', '#dffaf5'], ink: '#0a3040', star: '#e8553a' },
    sign: { bg: '#d8f4ee', ink: '#0a3040' }
  },
  {
    id: 'jungle', name: 'SELVA', title: ['SELVA', 'PINBALL'], sub: 'EXPEDIÇÃO TROPICAL • MESA Nº 005',
    css: { accent: '#9be34f', accent2: '#ff9a2f', gold: '#ffc24a', text: '#f0ffd8', bg: '#0a1406', acc: '155,227,79', p1: '26,38,16', p2: '14,22,8', shadow: '#7a3a10' },
    scene: { bg: '#0f1a0a', fog: 0.013, exposure: 1.1, env: 0.22, bloom: [0.15, 0.4, 0.93], hemi: ['#e8ffc4', '#142208', 0.95], amb: ['#9bc87a', 0.3], key: ['#fff6d8', 2.6], rim: ['#ff9a2f', 1.5], fillA: '#ffb347', fillB: '#9be34f', floor: '#16200c', bumpEm: 0.3 },
    mats: { wood: true, dark: '#4a3a1c', frame: '#9a6a2a', steel: '#b8b08a', metal: 0.7, rubber: '#17120a', cyan: ['#f0ffd8', '#cfe89a', 0.12], blue: ['#2f9a5a', '#1f7a40', 0.15], pink: ['#e8552a', '#c83f1a', 0.15], gold: ['#ffc24a', '#c8861a', 0.15], glow: '#f0ffd8' },
    pal: { light: '#f0ffd8', gold: '#ffc24a', teal: '#7ad65a', red: '#e8552a', ink: '#f6ffe0', sub: '#c8e89a' },
    field: { g: ['#1f5a28', '#184a22', '#0f3418'], glow1: 'rgba(230,255,170,.16)', glow2: 'rgba(255,154,47,.14)', fade: 'rgba(15,52,24,0)', grid: 'rgba(200,240,150,.07)', b1: 'rgba(255,194,74,.85)', b2: 'rgba(232,85,42,.75)', trace: 'rgba(200,240,150,.18)', traceDot: 'rgba(255,194,74,.4)', star: '220,255,170', deco: 'jungle', traces: false, glow: false },
    bumpers: [{ hex: '#ffc24a', em: '#c8861a', css: '#ffc24a' }, { hex: '#e8552a', em: '#c83f1a', css: '#e8552a' }, { hex: '#7ad65a', em: '#2f9a3a', css: '#7ad65a' }],
    targets: [{ hex: '#7ad65a', em: '#2f9a3a', css: '#7ad65a' }, { hex: '#ffc24a', em: '#c8861a', css: '#ffc24a' }, { hex: '#e8552a', em: '#c83f1a', css: '#e8552a' }, { hex: '#f0ffd8', em: '#cfe89a', css: '#f0ffd8' }],
    sling: { c: '#c83f1a', e: '#e8552a' }, flipper: { c: '#f2e8c0', e: '#ffc24a' }, ball: { c: '#f6fff0', glow: '#e8ffb0', trail: '#d0e8a0' },
    glass: { tint: '#ffffff', bg: '#d8f0a8', a: '#b8dc78', b: '#cfe896', rings: ['#c83f1a', '#ffc24a', '#1f7a40', '#f0ffd8'], ink: '#2a3a10', star: '#c83f1a' },
    sign: { bg: '#e4f2b8', ink: '#1f2c0a' }
  },
  {
    id: 'volcano', name: 'VULCÃO', title: ['VULCÃO', 'PINBALL'], sub: 'FORJA DE LAVA • MESA Nº 006',
    css: { accent: '#ff7a2f', accent2: '#ffd23a', gold: '#ffd23a', text: '#ffe8d4', bg: '#140604', acc: '255,122,47', p1: '42,20,14', p2: '24,10,6', shadow: '#5a1a08' },
    scene: { bg: '#150805', fog: 0.013, exposure: 1.1, env: 0.2, bloom: [0.5, 0.5, 0.85], hemi: ['#ffb88a', '#2a0e06', 0.7], amb: ['#c86a3a', 0.3], key: ['#ffe0c4', 2.3], rim: ['#ff4a1a', 2.0], fillA: '#ff5a1a', fillB: '#ffb040', floor: '#1a0a05', bumpEm: 0.7 },
    mats: { wood: false, dark: '#2a1a14', frame: '#3d2418', steel: '#a8988a', metal: 0.8, rubber: '#140a07', cyan: ['#ffe8c4', '#ffb040', 0.6], blue: ['#c8501a', '#a83a10', 0.5], pink: ['#ff4a1a', '#ff3a0a', 0.8], gold: ['#ffd23a', '#ff9a1a', 0.6], glow: '#ffe8c4' },
    pal: { light: '#ffe8c4', gold: '#ffd23a', teal: '#ff9a3a', red: '#ff4a1a', ink: '#fff0dc', sub: '#ffb888' },
    field: { g: ['#2a0e0a', '#1f0a07', '#140504'], glow1: 'rgba(255,140,60,.18)', glow2: 'rgba(255,60,20,.2)', fade: 'rgba(20,5,4,0)', grid: 'rgba(255,140,60,.05)', b1: 'rgba(255,170,70,.85)', b2: 'rgba(255,60,20,.8)', trace: 'rgba(255,140,60,.2)', traceDot: 'rgba(255,210,58,.5)', star: '255,200,140', deco: 'volcano', traces: false, glow: true },
    bumpers: [{ hex: '#ffd23a', em: '#ff9a1a', css: '#ffd23a' }, { hex: '#ff4a1a', em: '#ff3a0a', css: '#ff4a1a' }, { hex: '#ffe8c4', em: '#ffb040', css: '#ffe8c4' }],
    targets: [{ hex: '#ff9a3a', em: '#e8701a', css: '#ff9a3a' }, { hex: '#ffd23a', em: '#ff9a1a', css: '#ffd23a' }, { hex: '#ff4a1a', em: '#ff3a0a', css: '#ff4a1a' }, { hex: '#ffe8c4', em: '#ffb040', css: '#ffe8c4' }],
    sling: { c: '#ff3a0a', e: '#ff5a1a' }, flipper: { c: '#e8d8c8', e: '#ff9a3a' }, ball: { c: '#fff4ea', glow: '#ffb070', trail: '#ffa060' },
    glass: { tint: '#ffffff', bg: '#2a0e0a', a: '#3a140c', b: '#2a0e0a', rings: ['#ff3a0a', '#ff9a1a', '#ffd23a', '#ffe8c4'], ink: '#ffe8c4', star: '#ffd23a' },
    sign: { bg: '#2a140e', ink: '#ffb040' }
  }
];
let THEME = THEMES[0];
try { const sid = localStorage.getItem(THEME_KEY); THEME = THEMES.find((t) => t.id === sid) || THEMES[0]; } catch (e) {}
let PAL = THEME.pal;

// ------------------------------------------------------------
// Renderer / scene
// ------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1c130d');
scene.fog = new THREE.FogExp2('#1c130d', 0.012);

const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
camera.position.set(0, 17.5, 21.2);
camera.lookAt(0, 0.25, -0.15);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

// Studio environment gives the chrome ball, rails and glossy playfield real reflections.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.22;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.1, 0.4, 0.95);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const tmpV = new THREE.Vector3();

function makeWoodTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512; const ctx = c.getContext('2d');
  ctx.fillStyle = '#6b4526'; ctx.fillRect(0, 0, 256, 512);
  let seed = 7; const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 150; i++) {
    const x = rand() * 256;
    ctx.strokeStyle = `rgba(${rand() > 0.5 ? '35,18,6' : '150,100,55'},${0.08 + rand() * 0.16})`;
    ctx.lineWidth = 0.6 + rand() * 2.2; ctx.beginPath(); ctx.moveTo(x, 0);
    for (let y = 0; y <= 512; y += 64) ctx.lineTo(x + Math.sin(y * 0.02 + i) * 5, y);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const woodTex = makeWoodTexture();
const mats = {
  darkMetal: new THREE.MeshStandardMaterial({ color: '#4a3220', map: woodTex, metalness: 0.05, roughness: 0.78 }),
  frame: new THREE.MeshStandardMaterial({ color: '#a8743f', map: woodTex, metalness: 0.05, roughness: 0.6 }),
  steel: new THREE.MeshStandardMaterial({ color: '#c4bfb2', metalness: 0.8, roughness: 0.4 }),
  rubber: new THREE.MeshStandardMaterial({ color: '#1c1511', metalness: 0.05, roughness: 0.9 }),
  cyan: new THREE.MeshStandardMaterial({ color: '#efe2bd', emissive: '#cdb98a', emissiveIntensity: 0.12, metalness: 0.05, roughness: 0.5 }),
  blue: new THREE.MeshStandardMaterial({ color: '#4d9a94', emissive: '#2f6f6b', emissiveIntensity: 0.1, metalness: 0.05, roughness: 0.5 }),
  pink: new THREE.MeshStandardMaterial({ color: '#c8472f', emissive: '#b3402c', emissiveIntensity: 0.1, metalness: 0.05, roughness: 0.5 }),
  gold: new THREE.MeshStandardMaterial({ color: '#d4a24a', emissive: '#8a5a14', emissiveIntensity: 0.08, metalness: 0.7, roughness: 0.4 }),
  whiteGlow: new THREE.MeshBasicMaterial({ color: '#f3e6c4' })
};

// ------------------------------------------------------------
// Procedural playfield artwork (no external assets)
// ------------------------------------------------------------
const SX = 1024 / 9.8, SY = 1792 / 18.0;
const PX = (x) => (x + 4.9) * SX;
const PY = (z) => (z + 9.06) * SY;

const BUMPER_DEFS = [
  { x: -1.9, z: -3.4, r: 0.78, hex: '#efe2bd', em: '#cdb98a', css: '#efe2bd', points: 250 },
  { x: 0.9, z: -3.4, r: 0.78, hex: '#d6604a', em: '#b3402c', css: '#c8472f', points: 250 },
  { x: CX, z: -5.3, r: 0.88, hex: '#e8b84a', em: '#8a5a14', css: '#e2a838', points: 500 }
];
const TARGET_DEFS = [
  { x: -3.6, z: -1.3, hex: '#4d9a94', em: '#2f6f6b', css: '#4d9a94' },
  { x: -3.6, z: 0.5, hex: '#e8b84a', em: '#8a5a14', css: '#e2a838' },
  { x: 2.6, z: -1.3, hex: '#d6604a', em: '#b3402c', css: '#c8472f' },
  { x: 2.6, z: 0.5, hex: '#efe2bd', em: '#cdb98a', css: '#efe2bd' }
];
const LANE_XS = [CX - 1.25, CX, CX + 1.25], LANE_Z = -7.3;
const SPIN_Z = -1.8;

// Per-style decorative artwork drawn on the playfield (behind the inserts)
function drawDeco(ctx) {
  const W = 1024, H = 1792, id = THEME.field.deco;
  let seed = 913; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (id === 'neon') {
    const sx = PX(CX), sy = PY(-3.4);
    const sg = ctx.createLinearGradient(0, sy - 330, 0, sy);
    sg.addColorStop(0, 'rgba(255,79,216,.30)'); sg.addColorStop(1, 'rgba(255,210,74,.10)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, 330, Math.PI, 0); ctx.fill();
    ctx.fillStyle = THEME.field.g[1];
    for (let k = 1; k <= 6; k++) ctx.fillRect(sx - 330, sy - k * 44, 660, k * 3.2);
    ctx.strokeStyle = 'rgba(101,234,255,.13)'; ctx.lineWidth = 2;
    for (let i = -9; i <= 9; i++) { ctx.beginPath(); ctx.moveTo(512 + i * 34, 1000); ctx.lineTo(512 + i * 210, H); ctx.stroke(); }
    for (let j = 0; j <= 10; j++) { const y = 1000 + Math.pow(j / 10, 2) * (H - 1000); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.fillStyle = 'rgba(101,234,255,.18)';
    for (const x of [96, 150, 874, 928]) for (let y = 220; y < 1500; y += 210) ctx.fillRect(x, y, 6, 90);
  } else if (id === 'space') {
    for (const [x, y, r, c] of [[PX(-3), PY(-5.5), 380, 'rgba(120,70,255,.22)'], [PX(2.4), PY(3.5), 420, 'rgba(255,120,60,.14)'], [PX(-1), PY(-0.5), 300, 'rgba(60,120,255,.12)']]) {
      const g = ctx.createRadialGradient(x, y, 10, x, y, r); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    const planet = (x, y, r, c1, c2, ring) => {
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r); g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.globalAlpha = 0.6; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (ring) { ctx.globalAlpha = 0.45; ctx.strokeStyle = ring; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(x, y, r * 1.75, r * 0.45, -0.35, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1;
    };
    planet(PX(-3.5), PY(-5.6), 68, '#ffb878', '#7a3a2a', '#ffd27a');
    planet(PX(2.6), PY(-6.4), 40, '#9fb4ff', '#2a2a7a', null);
    ctx.strokeStyle = 'rgba(183,139,255,.14)'; ctx.lineWidth = 3;
    for (const [x, y, r] of [[PX(CX), PY(1.2), 330], [PX(CX), PY(1.2), 420]]) { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.42, -0.25, 0, Math.PI * 2); ctx.stroke(); }
    for (let i = 0; i < 200; i++) { ctx.fillStyle = `rgba(235,225,255,${0.12 + rnd() * 0.5})`; ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 0.8 + rnd() * 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) { const x = rnd() * W, y = rnd() * H, s = 7 + rnd() * 9; ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke(); }
  } else if (id === 'ocean') {
    ctx.lineWidth = 3;
    for (let k = 0; k < 26; k++) {
      const y0 = 90 + k * 68; ctx.strokeStyle = `rgba(190,255,250,${0.05 + (k % 3) * 0.025})`; ctx.beginPath();
      for (let x = 0; x <= W; x += 16) { const y = y0 + Math.sin(x * 0.034 + k * 1.3) * 11; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(220,255,250,.22)'; ctx.lineWidth = 2;
    for (let i = 0; i < 46; i++) { ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 4 + rnd() * 15, 0, Math.PI * 2); ctx.stroke(); }
    const fish = (x, y, s, flip) => {
      ctx.save(); ctx.translate(x, y); ctx.scale(flip * s, s); ctx.fillStyle = 'rgba(255,210,122,.16)';
      ctx.beginPath(); ctx.ellipse(0, 0, 38, 17, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-32, 0); ctx.lineTo(-62, -18); ctx.lineTo(-62, 18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(223,250,245,.28)'; ctx.beginPath(); ctx.arc(20, -4, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    };
    fish(PX(-3.6), PY(-6.2), 1.1, 1); fish(PX(2.6), PY(-5.2), 0.8, -1); fish(PX(-3.8), PY(2.6), 0.9, 1); fish(PX(2.7), PY(2.2), 1, -1);
  } else if (id === 'jungle') {
    const leaf = (x, y, len, rot, a) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = `rgba(110,210,80,${a})`;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -len * 0.38, len, 0); ctx.quadraticCurveTo(len * 0.5, len * 0.38, 0, 0); ctx.fill();
      ctx.strokeStyle = `rgba(230,255,170,${a * 1.4})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.95, 0); ctx.stroke(); ctx.restore();
    };
    for (let i = 0; i < 34; i++) {
      const left = i % 2 === 0, y = 90 + (i / 34) * (H - 180) + rnd() * 40;
      leaf(left ? 70 : W - 70, y, 150 + rnd() * 120, (left ? -0.2 : Math.PI + 0.2) + (rnd() - 0.5) * 1.1, 0.1 + rnd() * 0.12);
    }
    ctx.strokeStyle = 'rgba(255,194,74,.13)'; ctx.lineWidth = 5;
    for (const sx of [1, -1]) { ctx.beginPath(); const x0 = sx > 0 ? 70 : W - 70; ctx.moveTo(x0, 80); for (let y = 80; y < H - 80; y += 120) ctx.quadraticCurveTo(x0 + sx * 60, y + 60, x0, y + 120); ctx.stroke(); }
    for (let i = 0; i < 22; i++) { ctx.fillStyle = `rgba(255,154,47,${0.1 + rnd() * 0.25})`; ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 5 + rnd() * 9, 0, Math.PI * 2); ctx.fill(); }
  } else if (id === 'volcano') {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.moveTo(0, 360); ctx.lineTo(150, 210); ctx.lineTo(260, 300); ctx.lineTo(420, 80); ctx.lineTo(540, 220); ctx.lineTo(650, 120); ctx.lineTo(790, 300); ctx.lineTo(900, 190); ctx.lineTo(W, 330); ctx.lineTo(W, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,110,30,.4)'; ctx.lineWidth = 5;
    if (THEME.field.glow) { ctx.shadowColor = '#ff5a1a'; ctx.shadowBlur = 16; }
    for (let k = 0; k < 9; k++) {
      let x = rnd() * W, y = 340 + rnd() * 1300; ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += (rnd() - 0.5) * 90; y += 40 + rnd() * 60; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(255,${150 + rnd() * 80 | 0},60,${0.15 + rnd() * 0.5})`; ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 1 + rnd() * 3, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

function drawPlayfield(ctx) {
  const W = 1024, H = 1792, T = THEME, F = T.field, C = T.pal;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, F.g[0]); g.addColorStop(0.5, F.g[1]); g.addColorStop(1, F.g[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const radial = ctx.createRadialGradient(PX(CX), PY(-2), 20, PX(CX), PY(-2), 760);
  radial.addColorStop(0, F.glow1); radial.addColorStop(1, F.fade);
  ctx.fillStyle = radial; ctx.fillRect(0, 0, W, H);
  const radial2 = ctx.createRadialGradient(PX(CX), PY(5), 10, PX(CX), PY(5), 520);
  radial2.addColorStop(0, F.glow2); radial2.addColorStop(1, F.fade);
  ctx.fillStyle = radial2; ctx.fillRect(0, 0, W, H);

  ctx.lineWidth = 2; ctx.strokeStyle = F.grid;
  for (let x = 64; x < W; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 64; y < H; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  drawDeco(ctx);
  ctx.save(); if (F.glow) { ctx.shadowColor = C.light; ctx.shadowBlur = 14; }
  ctx.strokeStyle = F.b1; ctx.lineWidth = 8; ctx.strokeRect(38, 38, W - 76, H - 76);
  ctx.restore();
  ctx.save(); if (F.glow) { ctx.shadowColor = C.red; ctx.shadowBlur = 12; }
  ctx.strokeStyle = F.b2; ctx.lineWidth = 4; ctx.strokeRect(63, 63, W - 126, H - 126);
  ctx.restore();

  // circuit traces
  if (F.traces) for (const side of [0, 1]) {
    ctx.save(); if (side) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.strokeStyle = F.trace; ctx.lineWidth = 4;
    for (let i = 0; i < 9; i++) {
      const y = 150 + i * 170;
      ctx.beginPath(); ctx.moveTo(84, y); ctx.lineTo(132, y); ctx.lineTo(132, y + 42); ctx.lineTo(182, y + 42); ctx.stroke();
      ctx.fillStyle = F.traceDot; ctx.beginPath(); ctx.arc(182, y + 42, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  const glow = (color, blur) => { ctx.shadowColor = color; ctx.shadowBlur = F.glow ? blur : 0; };
  const ring = (x, z, r, color, lw = 4, blur = 12, alpha = 1) => {
    ctx.save(); ctx.globalAlpha = alpha; glow(color, blur); ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.arc(PX(x), PY(z), r * SX, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  };
  const disc = (x, z, r, color, alpha = 0.2) => {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(PX(x), PY(z), r * SX, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  };
  const chevron = (x, z, size, color, rot = 0, alpha = 0.8) => {
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(PX(x), PY(z)); ctx.rotate(rot);
    glow(color, 10); ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-size, size * 0.5); ctx.lineTo(0, -size * 0.5); ctx.lineTo(size, size * 0.5); ctx.stroke(); ctx.restore();
  };
  const star = (x, z, r, color) => {
    ctx.save(); ctx.translate(PX(x), PY(z)); glow(color, 18); ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = (i % 2 ? r * 0.45 : r) * SX; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.stroke(); ctx.restore();
  };
  const text = (str, x, z, size, color, alpha = 0.85, blur = 18) => {
    ctx.save(); ctx.globalAlpha = alpha; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    glow(color, blur); ctx.fillStyle = color; ctx.font = `400 ${size}px "Alfa Slab One", Georgia, serif`; ctx.fillText(str, PX(x), PY(z)); ctx.restore();
  };
  const line = (x1, z1, x2, z2, color, lw = 4, alpha = 0.6, dash = null) => {
    ctx.save(); ctx.globalAlpha = alpha; glow(color, 8); ctx.strokeStyle = color; ctx.lineWidth = lw; if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(PX(x1), PY(z1)); ctx.lineTo(PX(x2), PY(z2)); ctx.stroke(); ctx.restore();
  };

  // bumper decals
  for (const b of BUMPER_DEFS) {
    disc(b.x, b.z, b.r * 2.0, b.css, 0.07);
    ring(b.x, b.z, b.r * 1.55, b.css, 4, 14, 0.55);
    ring(b.x, b.z, b.r * 1.9, b.css, 2, 8, 0.28);
  }
  // target decals
  for (const t of TARGET_DEFS) { disc(t.x, t.z, 0.7, t.css, 0.1); ring(t.x, t.z, 0.68, t.css, 3, 12, 0.6); }
  // top lane inserts
  for (const x of LANE_XS) { ring(x, LANE_Z, 0.34, C.light, 3, 10, 0.5); chevron(x, LANE_Z + 0.75, 20, C.light, Math.PI, 0.5); }
  text('ROTAS', CX, -8.0, 26, C.light, 0.7, 10);
  // spinner lane
  line(CX - 0.75, SPIN_Z - 1.0, CX - 0.75, SPIN_Z + 1.0, C.gold, 4, 0.5);
  line(CX + 0.75, SPIN_Z - 1.0, CX + 0.75, SPIN_Z + 1.0, C.gold, 4, 0.5);
  text('GIRO', CX, SPIN_Z + 1.3, 28, C.gold, 0.75, 12);
  // center path chevrons
  for (let i = 0; i < 4; i++) chevron(CX, 1.2 + i * 0.55, 36, C.teal, 0, 0.35 + i * 0.12);
  // title
  const fs = T.title.join(' ').length > 12 ? 54 : 62;
  text(T.title.join(' '), CX, 2.95, fs, C.ink, 0.9, 26);
  ctx.save(); ctx.globalAlpha = 0.7; ctx.textAlign = 'center'; glow(C.red, 10); ctx.fillStyle = C.sub;
  ctx.font = '400 24px "Alfa Slab One", Georgia, serif'; ctx.fillText(T.sub.replace('•', ' • '), PX(CX), PY(3.5)); ctx.restore();
  star(CX, 4.55, 0.42, C.gold);
  // inlane arrows
  for (const x of [-4.15, 3.15]) { ring(x, 4.2, 0.3, C.red, 3, 10, 0.6); chevron(x, 4.75, 20, C.red, Math.PI, 0.7); }
  text('CHUTE', -3.2, 4.15, 22, C.light, 0.55, 8);
  text('CHUTE', 2.2, 4.15, 22, C.red, 0.55, 8);
  // launch lane
  line(R + 0.25, -5.8, R + 0.25, 7.5, C.teal, 3, 0.25, [16, 20]);
  line(OUT - 0.25, -5.8, OUT - 0.25, 7.5, C.teal, 3, 0.25, [16, 20]);
  for (let z = 5.6; z > -5; z -= 2.0) chevron(LANE_X, z, 26, C.gold, 0, 0.65);
  text('LANÇAR', LANE_X, 6.55, 20, C.gold, 0.7, 8);
  // drain zone
  for (let i = -3; i <= 3; i++) chevron(CX + i * 0.45, 8.35, 14, C.red, Math.PI, 0.35);
  // decorative rings
  for (const [x, z, r] of [[CX, -1.0, 3.2], [CX, 4.0, 2.2]]) { ring(x, z, r, C.light, 3, 6, 0.1); ring(x, z, r - 0.18, C.red, 2, 4, 0.08); }
  ctx.shadowBlur = 0;

  // speckle
  let seed = 61; const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 260; i++) {
    const x = rand() * W, y = rand() * H, r = 1 + rand() * 2.2;
    ctx.fillStyle = `rgba(${F.star},${0.08 + rand() * 0.28})`; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

let fieldCtx = null, fieldTex = null;
function makePlayfieldTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1792;
  const ctx = fieldCtx = c.getContext('2d'); drawPlayfield(ctx);
  const tex = fieldTex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  // redraw once the display font is available
  if (document.fonts?.load) document.fonts.load('400 54px "Alfa Slab One"').then(() => redrawPlayfield()).catch(() => {});
  return tex;
}
function redrawPlayfield() { fieldCtx.clearRect(0, 0, 1024, 1792); drawPlayfield(fieldCtx); fieldTex.needsUpdate = true; }

let glassRedraw = null;
function makeBackglassTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 300; const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const G = THEME.glass;
    ctx.fillStyle = G.bg; ctx.fillRect(0, 0, 1024, 300);
    ctx.save(); ctx.translate(512, 300);
    for (let i = 0; i < 28; i++) {
      ctx.fillStyle = i % 2 ? G.a : G.b; ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.arc(0, 0, 760, Math.PI + (i / 28) * Math.PI, Math.PI + ((i + 1) / 28) * Math.PI); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    [245, 205, 165, 125].forEach((r, i) => { ctx.fillStyle = G.rings[i]; ctx.beginPath(); ctx.arc(512, 300, r, Math.PI, 0); ctx.fill(); });
    ctx.fillStyle = G.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '400 44px "Alfa Slab One", Georgia, serif'; ctx.fillText(THEME.title.join(' '), 512, 30);
    ctx.font = '400 22px "Alfa Slab One", Georgia, serif'; ctx.fillText(THEME.sub.split('•').pop().trim(), 512, 262);
    ctx.fillStyle = G.star;
    for (const x of [130, 250, 774, 894]) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 9 : 22; ctx.lineTo(x + Math.cos(a) * r, 150 + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = G.ink; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 1014, 290);
    tex.needsUpdate = true;
  };
  glassRedraw = draw;
  draw();
  if (document.fonts?.load) document.fonts.load('400 44px "Alfa Slab One"').then(draw).catch(() => {});
  return tex;
}

// ------------------------------------------------------------
// Helpers to build geometry
// ------------------------------------------------------------
function addBox(parent, size, pos, material, cast = true, receive = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  m.position.set(...pos); m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
}
function addCylinder(parent, rt, rb, h, pos, material, radial = 32) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, radial), material);
  m.position.set(...pos); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

const walls = [];
function createRail(a, b, { mat = mats.steel, th = 0.2, h = 0.6, led = true, ledMat = mats.cyan } = {}) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, rot = -Math.atan2(dz, dx);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(len, h, th), mat);
  rail.position.set(mx, SURFACE_Y + h / 2 - 0.035, mz); rail.rotation.y = rot;
  rail.castShadow = true; rail.receiveShadow = true; scene.add(rail);
  if (led) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(len * 0.94, 0.035, th * 0.45), ledMat);
    l.position.set(mx, SURFACE_Y + h + 0.005, mz); l.rotation.y = rot; scene.add(l);
  }
  for (const p of [a, b]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(th / 2, th / 2, h, 14), mat);
    cap.position.set(p.x, SURFACE_Y + h / 2 - 0.035, p.z); cap.castShadow = true; scene.add(cap);
  }
}
function addWall(a, b, opts = {}) {
  const { e = 0.6, kick = 0, visible = true, ...visual } = opts;
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  walls.push({ a, b, e, kick, cool: 0, flash: 0, nx: -(b.z - a.z) / len, nz: (b.x - a.x) / len });
  if (visible) createRail(a, b, visual);
  return walls[walls.length - 1];
}
const P = (x, z) => ({ x, z });

// ------------------------------------------------------------
// Lights
// ------------------------------------------------------------
const hemiLight = new THREE.HemisphereLight('#ffe7c4', '#2a1a10', 0.95); scene.add(hemiLight);
const ambLight = new THREE.AmbientLight('#7d9dca', 0.3); scene.add(ambLight);
const keyLight = new THREE.DirectionalLight('#fff0d8', 2.8);
keyLight.position.set(-5, 17, 8); keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
Object.assign(keyLight.shadow.camera, { left: -9, right: 9, top: 12, bottom: -12 });
keyLight.shadow.bias = -0.00025; keyLight.shadow.normalBias = 0.025;
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight('#c08a50', 1.6); rimLight.position.set(7, 9, -9); scene.add(rimLight);
const pinkFill = new THREE.PointLight('#ffb067', 9, 17, 2); pinkFill.position.set(-4, 5, 3); scene.add(pinkFill);
const blueFill = new THREE.PointLight('#9fc4c0', 7, 18, 2); blueFill.position.set(4, 6, -4); scene.add(blueFill);

// ------------------------------------------------------------
// Floor + machine cabinet
// ------------------------------------------------------------
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#2e1f14', metalness: 0.0, roughness: 0.85 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -1.35; floor.receiveShadow = true; scene.add(floor);
const floorGrid = new THREE.GridHelper(80, 64, '#163e5e', '#10233d'); floorGrid.position.y = -1.33;
floorGrid.visible = false;
const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(15, 24), new THREE.MeshBasicMaterial({ color: '#c9833a', transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending }));


const machine = new THREE.Group(); scene.add(machine);
addBox(machine, [10.7, 0.86, 18.9], [0, 0.15, 0], mats.darkMetal);
addBox(machine, [9.8, 0.42, 18.0], [0, 0.755, -0.06], mats.darkMetal);          // playfield body
addBox(machine, [10.35, 0.16, 18.5], [0, 0.6, 0], mats.steel);
// cabinet side blades with neon trim
for (const s of [-1, 1]) {
  addBox(machine, [0.3, 1.5, 19.3], [s * 5.2, 0.45, 0], mats.frame);
  addBox(machine, [0.08, 0.06, 18.6], [s * 5.03, 1.14, 0], s < 0 ? mats.cyan : mats.pink, false, false);
  addBox(machine, [0.06, 0.06, 18.6], [s * 5.36, 0.3, 0], s < 0 ? mats.pink : mats.cyan, false, false);
}
addBox(machine, [10.7, 1.1, 0.3], [0, 0.55, 9.5], mats.frame);                  // front apron
addBox(machine, [8.8, 0.05, 0.08], [0, 1.1, 9.35], mats.pink, false, false);
addBox(machine, [10.7, 1.4, 0.3], [0, 0.55, -9.4], mats.frame);                 // back rail

// ---- Coin door (entrada de fichas) on the front apron ----
const COIN_SLOT = { x: 0, y: 0.5, z: 9.66 };
const coinDoor = new THREE.Group(); scene.add(coinDoor);
addBox(coinDoor, [1.0, 1.0, 0.05], [COIN_SLOT.x, 0.55, 9.675], mats.steel);                 // metal plate
addBox(coinDoor, [0.86, 0.86, 0.02], [COIN_SLOT.x, 0.55, 9.7], mats.darkMetal, false, false); // inset
addBox(coinDoor, [0.13, 0.64, 0.03], [COIN_SLOT.x, COIN_SLOT.y, 9.715], mats.rubber, false, false); // slot
const coinSign = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.17), new THREE.MeshBasicMaterial({ map: makeSignTexture('FICHA', '#e2a838') }));
coinSign.position.set(COIN_SLOT.x, 0.93, 9.713); coinDoor.add(coinSign);
const coinLampMat = new THREE.MeshStandardMaterial({ color: '#3a2a1a', emissive: '#e54433', emissiveIntensity: 0.08, metalness: 0.1, roughness: 0.4 });
const coinLamp = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 20), coinLampMat);
coinLamp.rotation.x = Math.PI / 2; coinLamp.position.set(COIN_SLOT.x, 0.18, 9.72); coinDoor.add(coinLamp);

// The ficha (token) used in the insert animation
const coinPivot = new THREE.Group(); coinPivot.visible = false; scene.add(coinPivot);
const coinSpin = new THREE.Group(); coinPivot.add(coinSpin);
const coinMat = new THREE.MeshStandardMaterial({ color: '#e8b84a', emissive: '#8a5a14', emissiveIntensity: 0.4, metalness: 0.85, roughness: 0.28 });
const coinBody = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 40), coinMat);
coinBody.rotation.x = Math.PI / 2; coinBody.castShadow = true; coinSpin.add(coinBody);
for (const sz of [-1, 1]) {
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.014, 8, 36), new THREE.MeshStandardMaterial({ color: '#a8741f', metalness: 0.7, roughness: 0.4 }));
  rim.position.z = sz * 0.027; coinSpin.add(rim);
}
const coinLight = new THREE.PointLight('#ffcf80', 0, 7, 2); coinLight.position.set(0.2, 1.4, 10.9); scene.add(coinLight);
// legs
for (const x of [-4.7, 4.7]) for (const z of [-8.6, 8.6]) addBox(machine, [0.5, 1.6, 0.5], [x, -0.6, z], mats.darkMetal);
// corner screws
for (const x of [-5.0, 5.0]) for (const z of [-9.0, 9.0]) {
  const screw = addCylinder(machine, 0.11, 0.11, 0.06, [x, 1.2, z], mats.steel, 20);
  addBox(machine, [0.12, 0.014, 0.02], [x, 1.24, z], mats.darkMetal, false, false);
}
// backbox with a glowing skyline
const backbox = new THREE.Group(); backbox.position.set(0, 1.2, -9.55); scene.add(backbox);
addBox(backbox, [10.6, 3.1, 0.35], [0, 1.0, 0], mats.frame);
const glass = new THREE.Mesh(new THREE.PlaneGeometry(9.9, 2.9), new THREE.MeshBasicMaterial({ map: makeBackglassTexture(), color: '#d6ccb0' }));
glass.position.set(0, 1.0, 0.19); backbox.add(glass);
addBox(backbox, [10.0, 0.05, 0.08], [0, 2.52, 0.2], mats.cyan, false, false);

// Playfield surface: glossy clear-coat, artwork also drives emissive for neon glow
const playTex = makePlayfieldTexture();
const playfield = new THREE.Mesh(new THREE.PlaneGeometry(9.8, 18.0), new THREE.MeshPhysicalMaterial({
  map: playTex, metalness: 0.0, roughness: 0.65, clearcoat: 0.1, clearcoatRoughness: 0.7
}));
playfield.rotation.x = -Math.PI / 2; playfield.position.set(0, SURFACE_Y - 0.055, -0.06); playfield.receiveShadow = true; machine.add(playfield);

// ------------------------------------------------------------
// Walls (visible rails + physics segments)
// ------------------------------------------------------------
const railOpts = { mat: mats.steel, th: 0.22, h: 0.66 };
addWall(P(L, 5.0), P(L, -6.4), railOpts);
addWall(P(L, -6.4), P(-2.5, TOPZ), railOpts);
addWall(P(-2.5, TOPZ), P(2.5, TOPZ), { ...railOpts, th: 0.2, h: 0.62 });
addWall(P(2.5, TOPZ), P(OUT, -6.2), railOpts);
addWall(P(OUT, -6.2), P(OUT, PLUNGER_Z), railOpts);
addWall(P(R, -6.0), P(R, PLUNGER_Z), { mat: mats.frame, th: 0.16, h: 0.5 });
addWall(P(R, PLUNGER_Z), P(OUT, PLUNGER_Z), { visible: false, e: 0.1 });         // plunger head
addWall(P(L, 5.0), P(-2.29, 6.19), { mat: mats.frame, th: 0.16, h: 0.42, ledMat: mats.pink });
addWall(P(R, 5.0), P(1.29, 6.19), { mat: mats.frame, th: 0.16, h: 0.42, ledMat: mats.cyan });

// Slingshots: rubber triangles with a kicking face
const slingMats = [];
function createSling(side) {
  const m = (x) => (side < 0 ? x : -1 - x); // mirror around CX
  const T = P(m(-3.75), 3.2), B = P(m(-3.75), 4.5), C = P(m(-2.75), 5.1);
  const shape = new THREE.Shape();
  shape.moveTo(T.x, T.z); shape.lineTo(B.x, B.z); shape.lineTo(C.x, C.z); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.04, bevelSegments: 3 });
  const color = side < 0 ? '#a63a2c' : '#a63a2c', em = side < 0 ? '#4a1a10' : '#b3402c';
  const mat = new THREE.MeshStandardMaterial({ color, emissive: em, emissiveIntensity: 0.1, metalness: 0.05, roughness: 0.65 });
  slingMats.push(mat);
  const mesh = new THREE.Mesh(geo, mat); mesh.rotation.x = Math.PI / 2; mesh.position.y = SURFACE_Y + 0.38;
  mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  for (const p of [T, B, C]) {
    const post = addCylinder(scene, 0.1, 0.1, 0.5, [p.x, SURFACE_Y + 0.22, p.z], mats.steel, 16);
    const rub = addCylinder(scene, 0.13, 0.13, 0.2, [p.x, SURFACE_Y + 0.12, p.z], mats.rubber, 16);
  }
  const strip = side < 0 ? mats.cyan : mats.pink;
  createRail(T, C, { mat: mats.rubber, th: 0.07, h: 0.3, led: true, ledMat: strip });
  addWall(B, T, { e: 0.5, visible: false });
  addWall(B, C, { e: 0.5, visible: false });
  const face = addWall(T, C, { e: 0.55, kick: 8.6, visible: false });
  face.mat = mat; face.baseEm = 0.1;
}
createSling(-1); createSling(1);

// ------------------------------------------------------------
// Bumpers
// ------------------------------------------------------------
const bumpers = [];
function createBumper(def) {
  const { x, z, r: radius } = def;
  const g = new THREE.Group(); g.position.set(x, SURFACE_Y, z); scene.add(g);
  const emat = new THREE.MeshStandardMaterial({ color: def.hex, emissive: def.em, emissiveIntensity: 0.3, metalness: 0.1, roughness: 0.5 });
  addCylinder(g, radius * 0.94, radius, 0.24, [0, 0.11, 0], mats.darkMetal, 40);
  const skirt = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.95, 0.07, 10, 48), mats.rubber);
  skirt.rotation.x = Math.PI / 2; skirt.position.y = 0.12; g.add(skirt);
  const ringM = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.78, 0.065, 10, 48), emat);
  ringM.rotation.x = Math.PI / 2; ringM.position.y = 0.26; g.add(ringM);
  addCylinder(g, radius * 0.68, radius * 0.78, 0.42, [0, 0.39, 0], emat, 40);
  const capMat = new THREE.MeshStandardMaterial({ color: '#eafcff', emissive: def.em, emissiveIntensity: 0.15, metalness: 0.1, roughness: 0.42 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.56, 32, 20), capMat);
  cap.scale.y = 0.38; cap.position.y = 0.61; cap.castShadow = true; g.add(cap);
  const top = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.48, 0.025, 8, 40), mats.whiteGlow);
  top.rotation.x = Math.PI / 2; top.position.y = 0.69; g.add(top);
  bumpers.push({ x, z, r: radius * 0.8, group: g, mats: [emat, capMat], baseEm: [0.3, 0.15], css: def.css, points: def.points, cool: 0, flash: 0 });
}
BUMPER_DEFS.forEach(createBumper);

// ------------------------------------------------------------
// Standup targets
// ------------------------------------------------------------
const targets = [];
TARGET_DEFS.forEach((def, i) => {
  const g = new THREE.Group(); g.position.set(def.x, SURFACE_Y, def.z); scene.add(g);
  addCylinder(g, 0.39, 0.46, 0.16, [0, 0.08, 0], mats.darkMetal, 32);
  addCylinder(g, 0.28, 0.36, 0.36, [0, 0.31, 0], mats.frame, 32);
  const fm = new THREE.MeshStandardMaterial({ color: def.hex, emissive: def.em, emissiveIntensity: 0.08, metalness: 0.1, roughness: 0.5 });
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.09, 32), fm);
  face.rotation.x = Math.PI / 2; face.position.set(0, 0.42, 0.0); face.scale.set(1, 1, 1); g.add(face);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), fm);
  dome.scale.y = 0.55; dome.position.y = 0.55; g.add(dome);
  targets.push({ x: def.x, z: def.z, r: 0.42, group: g, mat: fm, cool: 0, css: def.css, flash: 0, index: i });
});

// ------------------------------------------------------------
// Top rollover lanes, inlane rollovers & spinner
// ------------------------------------------------------------
function makeInsert(x, z, r, color) {
  const mat = new THREE.MeshStandardMaterial({ color: '#3a2a1a', emissive: color, emissiveIntensity: 0.05, metalness: 0.1, roughness: 0.5 });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 28), mat);
  m.position.set(x, SURFACE_Y + 0.0, z); m.receiveShadow = true; scene.add(m);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 8, 28), mats.steel);
  rim.rotation.x = Math.PI / 2; rim.position.set(x, SURFACE_Y + 0.02, z); scene.add(rim);
  return mat;
}
const laneSensors = LANE_XS.map((x, i) => ({ x, z: LANE_Z, r: 0.38, id: i, inside: false, mat: makeInsert(x, LANE_Z, 0.26, '#efe2bd') }));
const inlaneSensors = [-4.15, 3.15].map((x, i) => ({ x, z: 4.2, r: 0.4, id: i, inside: false, flash: 0, mat: makeInsert(x, 4.2, 0.24, '#c8472f') }));
const spinnerSensor = { x: CX, z: SPIN_Z, hw: 0.62, hh: 0.3, inside: false };

const spinner = new THREE.Group(); spinner.position.set(CX, SURFACE_Y + 0.12, SPIN_Z); scene.add(spinner);
addCylinder(spinner, 0.16, 0.2, 0.18, [0, 0.0, 0], mats.steel, 24);
addBox(spinner, [1.15, 0.1, 0.14], [0, 0.14, 0], mats.gold);
for (const [sx, m] of [[-0.58, mats.cyan], [0.58, mats.pink]]) {
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), m); tip.position.set(sx, 0.14, 0); spinner.add(tip);
}
// spinner guide posts
for (const sx of [-0.78, 0.78]) addCylinder(scene, 0.07, 0.07, 0.4, [CX + sx, SURFACE_Y + 0.17, SPIN_Z], mats.steel, 14);

// Plaque
function makeSignTexture(text, accent = '#65eaff') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const ctx = c.getContext('2d');
  ctx.fillStyle = THEME.sign.bg; ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = accent; ctx.lineWidth = 4; ctx.strokeRect(5, 5, 502, 118);
  ctx.fillStyle = THEME.sign.ink;
  ctx.font = '400 40px "Alfa Slab One", Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 65);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.5), new THREE.MeshBasicMaterial({ map: makeSignTexture('OLD PINBALL', '#efe2bd') }));
plaque.rotation.x = -Math.PI / 2; plaque.position.set(CX, SURFACE_Y + 0.012, -7.95); scene.add(plaque);

// ------------------------------------------------------------
// Flippers
// ------------------------------------------------------------
function createFlipper(s) { // s = +1 left, -1 right
  const len = 1.5, x = s > 0 ? -2.35 : 1.35, z = 6.3;
  const rBase = 0.19, rTip = 0.12;
  const pivot = new THREE.Group(); pivot.position.set(x, SURFACE_Y + 0.16, z); scene.add(pivot);
  const color = s > 0 ? '#e6dcc2' : '#e6dcc2', em = s > 0 ? '#cdb98a' : '#b3402c';
  const mat = new THREE.MeshStandardMaterial({ color, emissive: em, emissiveIntensity: 0.06, metalness: 0.15, roughness: 0.42 });
  const xc = s > 0 ? len / 2 : -len / 2;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(rBase, rTip, len, 24), mat);
  body.rotation.z = s > 0 ? Math.PI / 2 : -Math.PI / 2; body.position.x = xc; body.castShadow = true; pivot.add(body);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(rTip, 18, 14), mat); tip.position.x = s > 0 ? len : -len; tip.castShadow = true; pivot.add(tip);
  const base = new THREE.Mesh(new THREE.SphereGeometry(rBase, 18, 14), mat); pivot.add(base);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(len * 0.7, 0.03, 0.05), mats.whiteGlow); stripe.position.set(xc, rBase * 0.95, 0); pivot.add(stripe);
  addCylinder(pivot, 0.27, 0.27, 0.2, [0, -0.04, 0], mats.steel, 28);
  const rest = s > 0 ? -0.42 : 0.42, fire = s > 0 ? 0.45 : -0.45;
  pivot.rotation.y = rest;
  return { s, x, z, len, rBase, rTip, rest, fire, ang: rest, w: 0, pivot, mat };
}
const leftFlipper = createFlipper(1), rightFlipper = createFlipper(-1);
const flippers = [leftFlipper, rightFlipper];
// rubber posts at flipper pivots
for (const f of flippers) addCylinder(scene, 0.17, 0.17, 0.5, [f.x + f.s * -0.0, SURFACE_Y + 0.08, f.z + 0.0], mats.rubber, 16).visible = false;

// ------------------------------------------------------------
// Ball, trail, plunger
// ------------------------------------------------------------
const ballMaterial = new THREE.MeshPhysicalMaterial({ color: '#f2fbff', metalness: 0.9, roughness: 0.2, clearcoat: 0, envMapIntensity: 0.9 });
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 40, 30), ballMaterial);
ballMesh.castShadow = true; ballMesh.receiveShadow = true; scene.add(ballMesh);
const ballGlow = new THREE.PointLight('#ffd9a0', 1.0, 2.6, 2); scene.add(ballGlow);
const ball = { x: LANE_X, z: REST_Z, vx: 0, vz: 0 };

const TRAIL_N = 16, trailPos = [], trailMeshes = [];
const trailGeo = new THREE.SphereGeometry(BALL_R * 0.8, 10, 8);
for (let i = 0; i < TRAIL_N; i++) {
  const m = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ color: '#d9c9a0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.visible = false; scene.add(m); trailMeshes.push(m);
}

const plunger = new THREE.Group(); plunger.position.set(LANE_X, SURFACE_Y, PLUNGER_Z); scene.add(plunger);
const plungerHead = addBox(plunger, [0.82, 0.2, 0.18], [0, 0.1, 0.09], mats.steel);
const plungerRod = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 14), mats.gold);
plungerRod.rotation.x = Math.PI / 2; plungerRod.position.set(0, 0.12, 0.7); plungerRod.castShadow = true; plunger.add(plungerRod);
const plungerKnob = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), mats.pink); plungerKnob.position.set(0, 0.12, 1.3); plunger.add(plungerKnob);
for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 8, 18), mats.steel); c.position.set(0, 0.12, 0.35 + i * 0.12); plunger.add(c); }

function setBallVisual() {
  ballMesh.position.set(ball.x, SURFACE_Y + BALL_R, ball.z);
  ballGlow.position.set(ball.x, SURFACE_Y + 0.65, ball.z);
}
setBallVisual();

// ------------------------------------------------------------
// Particles (pooled)
// ------------------------------------------------------------
const sparkGeo = new THREE.SphereGeometry(0.04, 6, 6);
const sparks = [];
for (let i = 0; i < 160; i++) {
  const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.visible = false; scene.add(m); sparks.push({ mesh: m, life: 0, max: 1, vx: 0, vy: 0, vz: 0 });
}
let sparkIdx = 0;
function spawnSparks(x, z, color = PAL.light, amount = 12, power = 1) {
  for (let i = 0; i < amount; i++) {
    const s = sparks[sparkIdx++ % sparks.length];
    s.mesh.material.color.set(color); s.mesh.visible = true;
    s.mesh.position.set(x + (Math.random() - 0.5) * 0.2, SURFACE_Y + 0.15 + Math.random() * 0.2, z + (Math.random() - 0.5) * 0.2);
    const a = Math.random() * Math.PI * 2, sp = (2 + Math.random() * 5) * power;
    s.vx = Math.cos(a) * sp; s.vz = Math.sin(a) * sp; s.vy = 1.5 + Math.random() * 4;
    s.max = s.life = 0.35 + Math.random() * 0.3;
  }
}
const ringGeo = new THREE.TorusGeometry(0.25, 0.035, 8, 40);
const rings = [];
for (let i = 0; i < 10; i++) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = Math.PI / 2; m.visible = false; scene.add(m); rings.push({ mesh: m, life: 0, max: 0.45 });
}
let ringIdx = 0;
function spawnRing(x, z, color = PAL.light) {
  const r = rings[ringIdx++ % rings.length];
  r.mesh.material.color.set(color); r.mesh.visible = true; r.mesh.position.set(x, SURFACE_Y + 0.12, z); r.mesh.scale.setScalar(1); r.life = r.max;
}
function updateParticles(dt) {
  for (const s of sparks) {
    if (s.life <= 0) continue;
    s.life -= dt;
    if (s.life <= 0) { s.mesh.visible = false; continue; }
    s.mesh.position.x += s.vx * dt; s.mesh.position.y += s.vy * dt; s.mesh.position.z += s.vz * dt; s.vy -= 9 * dt;
    s.mesh.material.opacity = s.life / s.max;
  }
  for (const r of rings) {
    if (r.life <= 0) continue;
    r.life -= dt;
    if (r.life <= 0) { r.mesh.visible = false; continue; }
    const t = 1 - r.life / r.max; r.mesh.scale.setScalar(1 + t * 4.5); r.mesh.material.opacity = 1 - t;
  }
}

// ------------------------------------------------------------
// Audio (synthesised mechanical sound effects, no music)
// ------------------------------------------------------------
const MUTE_KEY = 'oldPinballMuted_v1';
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}
let audioContext = null, sfxGain = null, noiseBuffer = null;
function ensureAudio() {
  if (!audioContext) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      audioContext = new AC();
      const comp = audioContext.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.12;
      sfxGain = audioContext.createGain(); sfxGain.gain.value = muted ? 0 : 1;
      sfxGain.connect(comp); comp.connect(audioContext.destination);
      noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate);
      const d = noiseBuffer.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
  }
  if (audioContext?.state === 'suspended') audioContext.resume();
}
function tone(freq = 440, dur = 0.09, type = 'sine', vol = 0.035, slide = 0, dest = null, when = 0) {
  if (!audioContext) return;
  const o = audioContext.createOscillator(), g = audioContext.createGain();
  const now = audioContext.currentTime + when;
  o.type = type; o.frequency.setValueAtTime(freq, now);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), now + dur);
  g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  o.connect(g); g.connect(dest || sfxGain); o.start(now); o.stop(now + dur + 0.02);
}
// Filtered noise burst: the building block for clicks, thwacks and rolling sounds.
function noise(dur = 0.05, { type = 'bandpass', freq = 1500, q = 1, vol = 0.1, when = 0, endFreq = 0, attack = 0.001 } = {}) {
  if (!audioContext || !noiseBuffer) return;
  const now = audioContext.currentTime + when;
  const src = audioContext.createBufferSource(); src.buffer = noiseBuffer; src.loop = true;
  const f = audioContext.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, now);
  if (endFreq) f.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + dur);
  const g = audioContext.createGain();
  g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(vol, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0005, now + dur);
  src.connect(f); f.connect(g); g.connect(sfxGain);
  src.start(now, Math.random() * 0.5); src.stop(now + dur + 0.03);
}
// Metal spring "boing": a sine with fast vibrato that decays
function twang(freq, dur, vol, when = 0) {
  if (!audioContext) return;
  const now = audioContext.currentTime + when;
  const o = audioContext.createOscillator(), g = audioContext.createGain();
  const lfo = audioContext.createOscillator(), lg = audioContext.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(freq, now);
  lfo.frequency.value = 34 + Math.random() * 8;
  lg.gain.setValueAtTime(freq * 0.045, now); lg.gain.exponentialRampToValueAtTime(0.5, now + dur);
  lfo.connect(lg); lg.connect(o.frequency);
  g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.0005, now + dur);
  o.connect(g); g.connect(sfxGain);
  o.start(now); lfo.start(now); o.stop(now + dur + 0.02); lfo.stop(now + dur + 0.02);
}
// Struck metal bell / chime: inharmonic partials that die away at different rates
function bell(freq, dur = 1.0, vol = 0.05, when = 0) {
  if (!audioContext) return;
  const now = audioContext.currentTime + when;
  const partials = [[1, 1, 1], [2.76, 0.42, 0.55], [5.4, 0.2, 0.32], [8.93, 0.09, 0.18]];
  for (const [ratio, gain, decayFrac] of partials) {
    const f = freq * ratio; if (f > 15000) continue;
    for (const det of (ratio === 1 ? [1, 1.0032] : [1])) {
      const o = audioContext.createOscillator(), g = audioContext.createGain();
      o.type = 'sine'; o.frequency.value = f * det;
      const v = vol * gain * (ratio === 1 ? 0.6 : 1);
      g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(v, now + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0005, now + dur * decayFrac);
      o.connect(g); g.connect(sfxGain); o.start(now); o.stop(now + dur * decayFrac + 0.03);
    }
  }
  noise(0.014, { type: 'bandpass', freq: Math.min(9000, freq * 3), q: 1.4, vol: vol * 2.5, when });   // the "tink" of the strike
}
const jit = (v, p = 0.06) => v * (1 + (Math.random() - 0.5) * 2 * p);
const sfx = {
  // pop bumper: rubber-ring snap + solenoid thump + a struck chime tuned per bumper
  bumper(i = 0, boosted = false) {
    noise(0.045, { type: 'lowpass', freq: 1100, q: 0.8, vol: 0.26 });
    noise(0.03, { type: 'bandpass', freq: jit(1900, 0.1), q: 1.5, vol: 0.2 });
    tone(jit(120), 0.13, 'sine', 0.2, -65);
    const f = [784, 988, 1319][i] || 988;
    bell(jit(f, 0.004), 1.5, 0.055);
    if (i === 2) bell(f / 2, 1.8, 0.04, 0.012);       // big bumper rings an octave lower too
    if (boosted) bell(f * 1.5, 1.0, 0.025, 0.05);
  },
  // flipper "tec": hard plastic/metal click + solenoid thunk
  flipper() {
    noise(0.014, { type: 'bandpass', freq: jit(3000, 0.12), q: 1.1, vol: 0.28 });
    noise(0.03, { type: 'bandpass', freq: jit(1300, 0.1), q: 2.2, vol: 0.16 });
    tone(jit(240), 0.055, 'sine', 0.13, -130);
    tone(jit(82), 0.1, 'sine', 0.14, -35);
  },
  // flipper release "tac": lighter return click
  flipperUp() {
    noise(0.011, { type: 'bandpass', freq: jit(2300, 0.12), q: 1.2, vol: 0.13 });
    tone(jit(170), 0.04, 'sine', 0.06, -80);
  },
  // plunger: grabbing the knob
  plungerGrab() { noise(0.03, { type: 'bandpass', freq: 900, q: 2, vol: 0.1 }); tone(150, 0.06, 'sine', 0.07, -50); },
  // plunger pull: ratchet tick that rises in pitch as the spring compresses
  ratchet(p = 0) {
    noise(0.016, { type: 'bandpass', freq: 2600 + p * 1800, q: 3.5, vol: 0.1 });
    tone(520 + p * 320, 0.03, 'triangle', 0.02, 40);
    tone(95, 0.04, 'sine', 0.03, -15);
  },
  // plunger release: spring thwack, thump, metallic twang and the ball rolling up the lane
  plungerRelease(p = 0.5) {
    const k = 0.55 + p * 0.45;
    noise(0.09, { type: 'lowpass', freq: 2200, q: 0.8, vol: 0.3 * k });
    noise(0.025, { type: 'highpass', freq: 3500, q: 0.7, vol: 0.18 * k });
    tone(140, 0.2, 'sine', 0.2 * k, -95);
    twang(jit(760), 0.55, 0.045 * k); twang(jit(1180), 0.4, 0.025 * k, 0.005); twang(jit(1760), 0.28, 0.012 * k, 0.01);
    noise(0.85, { type: 'lowpass', freq: 650, q: 0.9, vol: 0.07 * k, endFreq: 1500, attack: 0.08, when: 0.04 });
  },
  // ball falls down the outhole and thuds into the trough
  drain() {
    noise(0.5, { type: 'lowpass', freq: 900, q: 0.9, vol: 0.14, endFreq: 220, attack: 0.03 });
    tone(95, 0.22, 'sine', 0.2, -45, null, 0.32);
    noise(0.07, { type: 'lowpass', freq: 600, q: 0.8, vol: 0.2, when: 0.32 });
    noise(0.02, { type: 'bandpass', freq: 2200, q: 2, vol: 0.08, when: 0.4 });
  },
  // slingshot: rubber slap + metal kicker arm
  sling() {
    noise(0.05, { type: 'bandpass', freq: jit(1300, 0.1), q: 1.1, vol: 0.34 });
    noise(0.016, { type: 'highpass', freq: 3200, q: 0.7, vol: 0.16 });
    tone(jit(105), 0.12, 'sine', 0.2, -55);
  },
  // standup target: plastic "tak" and a small bright chime tuned per target
  target(i = 0) {
    noise(0.014, { type: 'bandpass', freq: jit(2400, 0.1), q: 3, vol: 0.22 });
    tone(jit(300), 0.05, 'sine', 0.1, -130);
    bell([1175, 1319, 1480, 1568][i % 4], 0.9, 0.032);
  },
  // lane rollover switch: light chime
  roll(i = 0) { noise(0.01, { type: 'bandpass', freq: 3000, q: 2, vol: 0.08 }); bell([1568, 1760, 1976][i % 3], 0.8, 0.03); },
  inlane() { noise(0.012, { type: 'bandpass', freq: 2000, q: 2, vol: 0.1 }); bell(1047, 1.1, 0.04); },
  // spinner flap: tiny plastic/metal rattle
  tick() { noise(0.012, { type: 'bandpass', freq: jit(2700, 0.15), q: 4, vol: 0.09 }); tone(jit(900), 0.015, 'triangle', 0.012); },
  // bonus / completed set: chime run
  jingle() { [784, 988, 1175, 1568].forEach((f, i) => bell(f, 1.6, 0.045, i * 0.12)); },
  // tilt: heavy knocker thumps
  tilt() {
    for (let i = 0; i < 3; i++) {
      tone(72, 0.16, 'sine', 0.26, -25, null, i * 0.11);
      noise(0.06, { type: 'lowpass', freq: 800, q: 0.8, vol: 0.26, when: i * 0.11 });
    }
  },
  // coin hitting the slot, then ringing on the metal
  clink() { noise(0.018, { type: 'bandpass', freq: 4200, q: 2, vol: 0.14 }); bell(3136, 0.3, 0.018); },
  coin() { bell(2349, 0.6, 0.022); bell(3520, 0.4, 0.012, 0.02); noise(0.05, { type: 'bandpass', freq: 5200, q: 2, vol: 0.05, when: 0.01 }); },
  // credit mechanism "ka-chunk"
  thunk() { tone(88, 0.16, 'sine', 0.24, -35); noise(0.07, { type: 'lowpass', freq: 700, q: 0.9, vol: 0.22 }); noise(0.015, { type: 'bandpass', freq: 2000, q: 2, vol: 0.1, when: 0.06 }); }
};

// ------------------------------------------------------------
// Game logic
// ------------------------------------------------------------
function recalcMultiplier() { multiplier = Math.min(6, laneMult + (comboMult - 1)); }
function addScore(base, label = '') {
  const gained = Math.round(base * multiplier);
  score += gained;
  if (score > bestScore) { bestScore = score; try { localStorage.setItem(BEST_KEY, String(bestScore)); } catch (e) {} }
  updateHud();
  if (label) showToast(`${label}  +${gained.toLocaleString('pt-BR')}`);
  return gained;
}
function updateHud() {
  ui.score.textContent = String(score).padStart(7, '0');
  ui.best.textContent = String(bestScore).padStart(7, '0');
  ui.sideBest.textContent = String(bestScore).padStart(7, '0');
  ui.multiplier.textContent = `x${multiplier}`;
  [...ui.lives.children].forEach((d, i) => d.classList.toggle('off', i >= lives));
  ui.laneDots.forEach((d, i) => d.classList.toggle('on', lanesLit[i]));
  ui.targetDots.forEach((d, i) => d.classList.toggle('on', targetsLit[i]));
  refreshCoinUI();
}
function showToast(msg, dur = 1.45) { ui.toast.textContent = msg; ui.toast.classList.remove('hidden'); toastTimer = dur; }

function resetMissions(full = false) {
  lanesLit = [false, false, false]; targetsLit = [false, false, false, false];
  if (full) { laneMult = 1; comboMult = 1; boostTimer = 0; }
  recalcMultiplier(); updateHud();
}

function resetBall() {
  ballLaunched = false; charging = false; plungerPower = 0; tilted = false; nudgeLog = []; stuckTimer = 0; hitsThisBall = 0;
  ui.power.classList.add('hidden');
  ball.x = LANE_X; ball.z = REST_Z; ball.vx = 0; ball.vz = 0;
  ballMesh.rotation.set(0, 0, 0); trailPos.length = 0; setBallVisual();
  showToast('SEGURE ESPAÇO  ·  SOLTE PARA LANÇAR', 2.2);
}
function beginGame() {
  if (coinAnim) return;
  if (!ficha) { flashCreditMsg('INSIRA UMA FICHA PRIMEIRO'); return; }
  ensureAudio();
  score = 0; lives = PLAYS_PER_FICHA; comboCount = 0; comboTimer = 0; saveTimer = 0;
  resetMissions(true);
  state = 'playing'; leftHeld = rightHeld = false;
  ui.start.classList.add('hidden'); ui.pause.classList.add('hidden'); ui.gameover.classList.add('hidden');
  updateHud(); resetBall();
}
function endGame() {
  state = 'gameover'; ballLaunched = false;
  ficha = false; refreshCoinUI();   // the ficha is consumed after its 3 plays
  ui.finalScore.textContent = String(score).padStart(7, '0');
  ui.gameover.classList.remove('hidden');
  showToast(score >= bestScore && score > 0 ? 'NOVO RECORDE!' : 'FIM DE JOGO', 2.5);
}
// ------------------------------------------------------------
// Ficha (token) system + insert cinematic
// ------------------------------------------------------------
let creditMsgTimer = null, coinCamW = 0, baseFov = 36;
const COIN_START = new THREE.Vector3(-0.8, 1.55, 11.0);
const COIN_HOVER = new THREE.Vector3(0, COIN_SLOT.y, 10.2);
const CAM_CLOSE = new THREE.Vector3(0.45, 1.35, 12.9), LOOK_CLOSE = new THREE.Vector3(0, 0.6, 9.7);
const sm01 = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

function setText(el, txt) { if (el.textContent !== txt) el.textContent = txt; }
function refreshCoinUI() {
  const busy = !!coinAnim, inGame = state === 'playing' || state === 'paused';
  ui.coinBtn.classList.toggle('locked', ficha || busy);
  ui.coinBtn2.classList.toggle('locked', ficha || busy);
  ui.startButton.classList.toggle('locked', !ficha || busy);
  ui.restartButton.classList.toggle('locked', !ficha || busy);
  ui.coinFooter.classList.toggle('on', ficha);
  setText(ui.coinFooterLabel, ficha ? `FICHA ATIVA · ${inGame ? lives : PLAYS_PER_FICHA} JOGADAS` : 'ADICIONAR FICHA');
  if (creditMsgTimer === null) {
    setText(ui.credit, ficha ? `FICHA INSERIDA · ${PLAYS_PER_FICHA} JOGADAS` : 'SEM FICHA · 1 FICHA = 3 JOGADAS');
    setText(ui.credit2, ficha ? `FICHA INSERIDA · ${PLAYS_PER_FICHA} JOGADAS` : 'FICHA CONSUMIDA · INSIRA OUTRA');
    ui.credit.classList.toggle('on', ficha); ui.credit2.classList.toggle('on', ficha);
  }
}
function flashCreditMsg(msg) {
  clearTimeout(creditMsgTimer);
  setText(ui.credit, msg); setText(ui.credit2, msg);
  ui.credit.classList.add('on'); ui.credit2.classList.add('on');
  creditMsgTimer = setTimeout(() => { creditMsgTimer = null; refreshCoinUI(); }, 1800);
}
function insertCoin() {
  if (coinAnim) return;
  if (ficha) {                         // only one ficha at a time
    const msg = 'SÓ UMA FICHA POR VEZ';
    flashCreditMsg(msg); showToast(msg, 1.4); return;
  }
  ensureAudio();
  coinAnim = { t: 0, dur: 3.4, returnTo: state, clink: false, done: false };
  ui.start.classList.add('hidden'); ui.gameover.classList.add('hidden');
  coinPivot.visible = false;
  showToast('INSERINDO FICHA…', 3);
  refreshCoinUI();
}
function updateCoinAnim(dt) {
  if (coinFlash > 0) coinFlash = Math.max(0, coinFlash - dt * 1.4);
  if (!coinAnim) { coinCamW = 0; coinLight.intensity = coinFlash * 5; return; }
  const a = coinAnim; a.t += dt; const t = a.t;
  coinCamW = t < 2.6 ? sm01(t / 0.9) : 1 - sm01((t - 2.6) / 0.8);
  if (t < 0.45 || t >= 2.4) coinPivot.visible = false;
  else {
    coinPivot.visible = true;
    if (t < 1.35) {                                   // drop in with a coin-toss tumble
      const u = sm01((t - 0.45) / 0.9);
      coinPivot.position.lerpVectors(COIN_START, COIN_HOVER, u); coinPivot.position.y += Math.sin(u * Math.PI) * 0.35;
      coinPivot.rotation.set((1 - u) * Math.PI * 2, 0, 0);
    } else if (t < 1.95) {                            // turn edge-on to face the slot
      coinPivot.position.copy(COIN_HOVER); coinPivot.position.y += Math.sin((t - 1.35) * 9) * 0.015;
      coinPivot.rotation.set(0, sm01((t - 1.35) / 0.6) * Math.PI / 2, 0);
    } else {                                          // slide into the slot
      if (!a.clink) { a.clink = true; sfx.clink(); }
      coinPivot.position.set(COIN_HOVER.x, COIN_HOVER.y, COIN_HOVER.z + (9.3 - COIN_HOVER.z) * sm01((t - 1.95) / 0.45));
      coinPivot.rotation.set(0, Math.PI / 2, 0);
    }
  }
  if (t >= 2.45 && !a.done) {                         // ficha accepted
    a.done = true; ficha = true; coinFlash = 1; sfx.thunk(); sfx.coin();
    showToast(`FICHA INSERIDA · ${PLAYS_PER_FICHA} JOGADAS`, 2); refreshCoinUI();
  }
  coinLight.intensity = coinCamW * 7 + coinFlash * 6;
  if (t >= a.dur) {
    coinAnim = null; coinPivot.visible = false; coinCamW = 0;
    if (a.returnTo === 'gameover') ui.gameover.classList.remove('hidden'); else ui.start.classList.remove('hidden');
    refreshCoinUI();
  }
}
let screen = 'intro'; // intro | select | coin
const introEl = $('#splash'), selectEl = $('#select-screen');
function showScreen(name) {
  screen = name;
  introEl.classList.toggle('hidden', name !== 'intro');
  selectEl.classList.toggle('hidden', name !== 'select');
  ui.start.classList.toggle('hidden', name !== 'coin');
  ui.gameover.classList.add('hidden');
  ui.pause.classList.add('hidden'); leftHeld = rightHeld = false; charging = false; ui.power.classList.add('hidden');
  state = 'menu'; ballLaunched = false;
  if (name === 'select') buildCards();
  refreshCoinUI();
}
function buildCards() {
  const box = $('#table-cards'); box.innerHTML = '';
  THEMES.forEach((t) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'table-card' + (t.id === THEME.id ? ' current' : '');
    b.style.setProperty('--c', t.css.accent);
    b.innerHTML = `<div class="card-img"><img src="images/${t.id}.png" alt="Mesa ${t.name}" loading="lazy" onerror="this.onerror=null;this.src=this.src.replace(\'.png\',\'.jpg\')"><span class="glow"></span><span class="card-ball"></span><span class="shine"></span></div><div class="card-info"><b>${t.name}</b><small>${t.sub.split('•')[0].trim()}</small><span class="pick">ESCOLHER ▸</span></div>`;
    b.addEventListener('click', () => { applyTheme(t.id); ensureAudio(); sfx.tick(); showScreen('coin'); });
    box.appendChild(b);
  });
}
introEl.querySelector('#intro-button').addEventListener('click', () => { ensureAudio(); showScreen('select'); });
document.querySelectorAll('[data-action="select"]').forEach((b) => b.addEventListener('click', () => { if (!coinAnim) showScreen('select'); }));
function refreshSoundUI() {
  const b = $('#sound-button'); if (!b) return;
  b.classList.toggle('off', muted);
  $('#sound-icon').textContent = muted ? '🔇' : '🔊';
  $('#sound-label').textContent = muted ? 'SOM: OFF' : 'SOM: ON';
}
function toggleMute() {
  muted = !muted;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
  if (sfxGain) sfxGain.gain.value = muted ? 0 : 1;
  else if (!muted) ensureAudio();
  refreshSoundUI();
  if (!muted) sfx.tick();
}
function goHome() {
  if (coinAnim) return;
  if (state === 'playing') { pauseGame(); return; }
  ui.pause.classList.add('hidden'); leftHeld = rightHeld = false; charging = false; ui.power.classList.add('hidden');
  showScreen('intro');
}
$('#sound-button').addEventListener('click', toggleMute);
$('#home-button').addEventListener('click', goHome);
refreshSoundUI();
function tryStart() {
  if (coinAnim) return;
  if (!ficha) { flashCreditMsg('INSIRA UMA FICHA PRIMEIRO'); return; }
  beginGame();
}

function pauseGame() {
  if (state === 'playing') { state = 'paused'; ui.pause.classList.remove('hidden'); leftHeld = rightHeld = false; if (charging) { charging = false; ui.power.classList.add('hidden'); } }
  else if (state === 'paused') { state = 'playing'; ui.pause.classList.add('hidden'); showToast('DE VOLTA AO JOGO', 0.9); lastTime = performance.now(); }
}
function startCharge() {
  if (state !== 'playing' || ballLaunched || charging) return;
  ensureAudio(); charging = true; plungerPower = 0; plungerTick = 0; sfx.plungerGrab(); ui.power.classList.remove('hidden');
}
function releaseLaunch() {
  if (!charging) return;
  charging = false; ui.power.classList.add('hidden');
  if (state !== 'playing' || ballLaunched) return;
  ensureAudio();
  ballLaunched = true; ball.x = LANE_X; ball.z = REST_Z;
  ball.vx = (Math.random() - 0.5) * 0.2; ball.vz = -(14.9 + plungerPower * 6.1);
  saveTimer = 12; stuckTimer = 0;
  sfx.plungerRelease(plungerPower); cameraShake = Math.max(cameraShake, 0.05 + plungerPower * 0.08);
  showToast('BOLA EM JOGO', 0.8);
}
function loseBall() {
  if (state !== 'playing') return;
  sfx.drain(); spawnSparks(ball.x, 8.0, PAL.red, 18, 1.2);
  if (saveTimer > 0) {
    showToast('BOLA SALVA!', 1.6); sfx.jingle(); saveTimer = 0; resetBall(); return;
  }
  lives--;
  const bonus = hitsThisBall * 50 * laneMult;
  if (bonus > 0) { score += bonus; if (score > bestScore) { bestScore = score; try { localStorage.setItem(BEST_KEY, String(bestScore)); } catch (e) {} } }
  laneMult = 1; comboMult = 1; comboCount = 0; comboTimer = 0; resetMissions(); recalcMultiplier(); updateHud();
  if (lives <= 0) { endGame(); return; }
  resetBall();
  showToast(`BÔNUS +${bonus.toLocaleString('pt-BR')}  ·  ${lives} ${lives === 1 ? 'BOLA RESTANTE' : 'BOLAS RESTANTES'}`, 2.2);
}

function triggerCombo(base, label) {
  hitsThisBall++;
  if (comboTimer > 0) comboCount++; else comboCount = 1;
  comboTimer = 2.4;
  comboMult = comboCount >= 6 ? 3 : comboCount >= 3 ? 2 : 1;
  recalcMultiplier();
  addScore(base, label);
  if (comboCount >= 3) showToast(`${comboCount} COMBO  ·  x${multiplier}`, 1.1);
}

// ---- collision primitives ----
function closestOnSegment(p, a, b) {
  const abx = b.x - a.x, abz = b.z - a.z, ls = abx * abx + abz * abz;
  const t = ls > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.z - a.z) * abz) / ls)) : 0;
  return { x: a.x + abx * t, z: a.z + abz * t, t };
}
function collideWall(w) {
  const n = closestOnSegment(ball, w.a, w.b);
  let dx = ball.x - n.x, dz = ball.z - n.z;
  const d = Math.hypot(dx, dz), minD = BALL_R + WALL_T;
  if (d >= minD) return;
  let nx, nz;
  if (d < 1e-6) { nx = w.nx; nz = w.nz; } else { nx = dx / d; nz = dz / d; }
  const vn = ball.vx * nx + ball.vz * nz;
  if (vn < 0) {
    if (w.kick && w.cool <= 0 && -vn > 1.2) {
      const target = w.kick;
      ball.vx -= vn * nx; ball.vz -= vn * nz;
      ball.vx += target * nx; ball.vz += target * nz;
      w.cool = 0.22; w.flash = 1;
      triggerCombo(180, 'ESTILINGUE'); sfx.sling();
      spawnSparks(n.x, n.z, PAL.light, 10, 1); cameraShake = Math.max(cameraShake, 0.07);
    } else {
      ball.vx -= (1 + w.e) * vn * nx; ball.vz -= (1 + w.e) * vn * nz;
    }
  }
  ball.x = n.x + nx * (minD + 0.001); ball.z = n.z + nz * (minD + 0.001);
}
function collideFlipper(f) {
  const dirx = f.s * Math.cos(f.ang), dirz = -f.s * Math.sin(f.ang);
  const a = { x: f.x, z: f.z }, b = { x: f.x + dirx * f.len, z: f.z + dirz * f.len };
  const n = closestOnSegment(ball, a, b);
  const fr = f.rBase + (f.rTip - f.rBase) * n.t;
  const dx = ball.x - n.x, dz = ball.z - n.z, d = Math.hypot(dx, dz), minD = BALL_R + fr;
  if (d >= minD) return;
  let nx = 0, nz = -1;
  if (d > 1e-5) { nx = dx / d; nz = dz / d; }
  const lever = n.t * f.len;
  const svx = f.s * -Math.sin(f.ang) * lever * f.w, svz = f.s * -Math.cos(f.ang) * lever * f.w;
  const vn = (ball.vx - svx) * nx + (ball.vz - svz) * nz;
  if (vn < 0) {
    const e = Math.abs(f.w) > 1 ? 0.5 : 0.16;
    ball.vx -= (1 + e) * vn * nx; ball.vz -= (1 + e) * vn * nz;
    if (Math.abs(f.w) > 1 && -vn > 3) { spawnSparks(n.x, n.z, f.s > 0 ? PAL.light : PAL.red, 4, 0.5); hitsThisBall++; }
  }
  ball.x = n.x + nx * (minD + 0.002); ball.z = n.z + nz * (minD + 0.002);
}
function collideObjects() {
  for (const b of bumpers) {
    const dx = ball.x - b.x, dz = ball.z - b.z, d = Math.hypot(dx, dz), minD = BALL_R + b.r;
    if (d < minD) {
      const nx = dx / (d || 1), nz = dz / (d || 1);
      if (b.cool <= 0) {
        const sp = Math.hypot(ball.vx, ball.vz), imp = 9 + Math.min(sp * 0.28, 4);
        ball.vx = nx * imp + (Math.random() - 0.5) * 0.8; ball.vz = nz * imp;
        b.cool = 0.12; b.flash = 1; b.group.scale.setScalar(1.08);
        spawnSparks(b.x, b.z, b.css, 17, 1.25); spawnRing(b.x, b.z, b.css);
        triggerCombo(b.points * (boostTimer > 0 ? 2 : 1), boostTimer > 0 ? 'BUMPER x2' : 'BUMPER');
        sfx.bumper(bumpers.indexOf(b), boostTimer > 0); cameraShake = Math.max(cameraShake, 0.12);
      }
      ball.x = b.x + nx * (minD + 0.01); ball.z = b.z + nz * (minD + 0.01);
    }
  }
  for (const t of targets) {
    const dx = ball.x - t.x, dz = ball.z - t.z, d = Math.hypot(dx, dz), minD = BALL_R + t.r;
    if (d < minD) {
      const nx = dx / (d || 1), nz = dz / (d || 1), vn = ball.vx * nx + ball.vz * nz;
      if (vn < 0) { ball.vx -= 1.7 * vn * nx; ball.vz -= 1.7 * vn * nz; }
      ball.x = t.x + nx * (minD + 0.01); ball.z = t.z + nz * (minD + 0.01);
      if (t.cool <= 0) {
        t.cool = 0.4; t.flash = 1; t.group.rotation.y += 0.35;
        spawnSparks(t.x, t.z, t.css, 10, 0.8); spawnRing(t.x, t.z, t.css); sfx.target(t.index);
        if (!targetsLit[t.index]) {
          targetsLit[t.index] = true; triggerCombo(150, 'ALVO'); updateHud();
          if (targetsLit.every(Boolean)) {
            addScore(3000, 'ALVOS COMPLETOS'); boostTimer = 12; sfx.jingle(); showToast('ALVOS COMPLETOS · BUMPERS x2', 2);
            targetsLit = [false, false, false, false]; updateHud();
          }
        } else triggerCombo(50, 'ALVO');
      }
    }
  }
}
function checkSensors() {
  for (const s of laneSensors) {
    const inside = Math.hypot(ball.x - s.x, ball.z - s.z) < s.r;
    if (inside && !s.inside && !lanesLit[s.id]) {
      lanesLit[s.id] = true; sfx.roll(s.id); spawnRing(s.x, s.z, PAL.light); triggerCombo(100, 'ROTA');
      if (lanesLit.every(Boolean)) {
        laneMult = Math.min(5, laneMult + 1); recalcMultiplier(); addScore(2000, `ROTAS COMPLETAS · x${multiplier}`); sfx.jingle();
        lanesLit = [false, false, false];
      }
      updateHud();
    }
    s.inside = inside;
  }
  for (const s of inlaneSensors) {
    const inside = Math.hypot(ball.x - s.x, ball.z - s.z) < s.r;
    if (inside && !s.inside) { s.flash = 1; sfx.inlane(); spawnRing(s.x, s.z, PAL.red); triggerCombo(500, 'CORREDOR'); }
    s.inside = inside;
  }
  const inSpin = Math.abs(ball.x - spinnerSensor.x) < spinnerSensor.hw && Math.abs(ball.z - spinnerSensor.z) < spinnerSensor.hh;
  if (inSpin && !spinnerSensor.inside) {
    const sp = Math.hypot(ball.vx, ball.vz);
    spinSpeed = Math.min(40, spinSpeed + sp * 1.2); triggerCombo(100, 'GIRATÓRIO'); sfx.tick();
  }
  spinnerSensor.inside = inSpin;
}

function updateFlippers(h) {
  for (const f of flippers) {
    const pressed = !tilted && (f.s > 0 ? leftHeld : rightHeld);
    const target = pressed ? f.fire : f.rest, diff = target - f.ang, step = 15 * h;
    if (Math.abs(diff) <= step) { f.ang = target; f.w = 0; }
    else { f.ang += Math.sign(diff) * step; f.w = Math.sign(diff) * 15; }
    f.pivot.rotation.y = f.ang;
  }
}
function physicsStep(h) {
  updateFlippers(h);
  if (!ballLaunched) return;
  for (const w of walls) if (w.cool > 0) w.cool -= h;
  for (const b of bumpers) if (b.cool > 0) b.cool -= h;
  for (const t of targets) if (t.cool > 0) t.cool -= h;

  ball.vz += GRAVITY * h;
  ball.vx *= Math.pow(0.9985, h * 60); ball.vz *= Math.pow(0.9992, h * 60);
  const sp = Math.hypot(ball.vx, ball.vz);
  if (sp > MAX_SPEED) { ball.vx *= MAX_SPEED / sp; ball.vz *= MAX_SPEED / sp; }
  ball.x += ball.vx * h; ball.z += ball.vz * h;

  for (const w of walls) collideWall(w);
  collideObjects();
  for (const f of flippers) collideFlipper(f);
  for (const w of walls) collideWall(w);   // second pass keeps the ball out of corners
  checkSensors();

  if (ball.z > 7.55 && ball.x > L && ball.x < R - 0.05) { loseBall(); return; }
  if (ball.z > 8.4 && !(ball.x > R)) { loseBall(); return; }
  // ball back in the shooter lane: re-arm the plunger
  if (ball.x > R + 0.1 && ball.z > 7.0 && Math.hypot(ball.vx, ball.vz) < 1.4) {
    ballLaunched = false; ball.x = LANE_X; ball.z = REST_Z; ball.vx = ball.vz = 0; saveTimer = 0;
    showToast('SEGURE ESPAÇO  ·  SOLTE PARA LANÇAR', 1.8);
  }
}

function nudge(dir = 0) {
  if (state !== 'playing' || !ballLaunched || tilted) return;
  const now = elapsed;
  nudgeLog = nudgeLog.filter((t) => now - t < 5); nudgeLog.push(now);
  ball.vx += (dir || (Math.random() - 0.5) * 2) * 1.6; ball.vz -= 1.3;
  cameraShake = Math.max(cameraShake, 0.2);
  if (nudgeLog.length >= 5) {
    tilted = true; sfx.tilt(); cameraShake = 0.4; showToast('TILT!  FLIPPERS TRAVADOS', 2.5);
  } else showToast(nudgeLog.length >= 4 ? 'CUIDADO' : 'SACUDIDA', 0.5);
}

// ------------------------------------------------------------
// Visual updates
// ------------------------------------------------------------
function updateDecor(dt) {
  elapsed += dt;
  spinSpeed *= Math.exp(-1.6 * dt);
  spinner.rotation.y += (0.7 + spinSpeed) * dt;
  for (let i = 0; i < bumpers.length; i++) {
    const b = bumpers[i];
    b.flash *= Math.exp(-7 * dt);
    const boost = boostTimer > 0 ? 0.6 + Math.sin(elapsed * 12) * 0.4 : 0;
    b.mats.forEach((m, k) => { m.emissiveIntensity = b.baseEm[k] + b.flash * 1.3 + boost * 0.5; });
    b.group.scale.lerp(tmpV.set(1, 1, 1), 1 - Math.exp(-12 * dt));
    b.group.rotation.y += dt * (i % 2 ? -0.13 : 0.16);
  }
  for (const t of targets) {
    t.flash *= Math.exp(-6 * dt);
    t.mat.emissiveIntensity = (targetsLit[t.index] ? 0.9 + Math.sin(elapsed * 6 + t.index) * 0.1 : 0.08) + t.flash * 1.0;
    t.group.position.y = SURFACE_Y + Math.sin(elapsed * 2.2 + t.x) * 0.01;
  }
  for (const s of laneSensors) s.mat.emissiveIntensity = lanesLit[s.id] ? 1.1 : 0.05;
  for (const s of inlaneSensors) { s.flash *= Math.exp(-4 * dt); s.mat.emissiveIntensity = 0.05 + s.flash * 1.2; }
  for (const w of walls) if (w.mat) { w.flash *= Math.exp(-8 * dt); w.mat.emissiveIntensity = w.baseEm + w.flash * 0.9; }
  for (const f of flippers) f.mat.emissiveIntensity = 0.06;
  coinLampMat.emissive.set(ficha ? PAL.gold : PAL.red);
  coinLampMat.emissiveIntensity = (ficha ? 0.8 + Math.sin(elapsed * 4) * 0.2 : 0.1 + (coinAnim ? Math.abs(Math.sin(elapsed * 8)) * 0.7 : 0)) + coinFlash * 2;
      if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) ui.toast.classList.add('hidden'); }
  if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) { comboCount = 0; comboMult = 1; recalcMultiplier(); updateHud(); } }
  if (boostTimer > 0) { boostTimer -= dt; if (boostTimer <= 0) showToast('BUMPERS VOLTARAM AO NORMAL', 1); }
  if (saveTimer > 0 && ballLaunched) saveTimer -= dt;
  ui.saveBadge.classList.toggle('hidden', !(saveTimer > 0 && ballLaunched && state === 'playing'));
  if (cameraShake > 0) cameraShake = Math.max(0, cameraShake - dt * 0.8);
}
function updatePlunger(dt) {
  if (charging) {
    plungerPower = Math.min(1, plungerPower + dt * 1.15);
    const tickStep = Math.floor(plungerPower * 16);
    if (tickStep > plungerTick) { plungerTick = tickStep; sfx.ratchet(plungerPower); }
    ui.powerFill.style.height = `${Math.round(plungerPower * 100)}%`;
  }
  const pull = ballLaunched ? 0 : plungerPower * 0.5;
  plunger.position.z = PLUNGER_Z + pull;
  if (!ballLaunched) {
    ball.z = REST_Z + pull; ball.x = LANE_X;
    ballMesh.position.set(ball.x, SURFACE_Y + BALL_R + (charging ? 0 : Math.sin(elapsed * 3.4) * 0.012), ball.z);
    ballGlow.position.set(ball.x, SURFACE_Y + 0.65, ball.z);
  }
}
function updateBall(dt) {
  if (ballLaunched) {
    ballMesh.position.set(ball.x, SURFACE_Y + BALL_R, ball.z);
    ballGlow.position.set(ball.x, SURFACE_Y + 0.65, ball.z);
    ballMesh.rotation.x += ball.vz * dt / BALL_R; ballMesh.rotation.z -= ball.vx * dt / BALL_R;
    trailPos.unshift({ x: ball.x, z: ball.z }); if (trailPos.length > TRAIL_N) trailPos.pop();
  } else if (trailPos.length) trailPos.pop();
  const speed = Math.hypot(ball.vx, ball.vz);
  for (let i = 0; i < TRAIL_N; i++) {
    const m = trailMeshes[i], p = trailPos[i];
    if (!p || i < 2 || speed < 3) { m.visible = false; continue; }
    const k = 1 - i / TRAIL_N;
    m.visible = true; m.position.set(p.x, SURFACE_Y + BALL_R, p.z); m.scale.setScalar(0.25 + k * 0.7);
    m.material.opacity = k * Math.min(0.14, speed / 100);
  }
  // anti-stall: a ball that comes to rest on the playfield gets a gentle nudge
  const cradling = (leftHeld || rightHeld) && ball.z > 5.0;
  if (state === 'playing' && ballLaunched && speed < 0.6 && ball.z < 7.0 && ball.x < R && !cradling) {
    stuckTimer += dt;
    if (stuckTimer > 1.2) {
      stuckTimer = 0; stuckKicks++;
      if (stuckKicks >= 3) { stuckKicks = 0; showToast('BOLA REPOSICIONADA', 1.5); resetBall(); }
      else { ball.vx += (Math.random() < 0.5 ? -1 : 1) * (2.5 + Math.random() * 2); ball.vz -= 4.5; sfx.sling(); }
    }
  } else { stuckTimer = 0; if (speed > 3) stuckKicks = 0; }
}

const CAM_ELEV = THREE.MathUtils.degToRad(54), CAM_D = 27;   // elevation above the table plane (90 = straight down)
function resize() {
  const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
  camera.aspect = w / h;
  // tilted-from-above camera: fit the whole table (about 11 x 19.8) in both axes
  const vf = Math.max(2 * Math.atan(10.4 / CAM_D), 2 * Math.atan(5.6 / ((CAM_D - 5.7) * camera.aspect)));
  camera.fov = baseFov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vf), 22, 75);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false); composer.setSize(w, h);
}
window.addEventListener('resize', resize, { passive: true });

function render() {
  let cx = 0, cy = 1 + CAM_D * Math.sin(CAM_ELEV), cz = -0.2 + CAM_D * Math.cos(CAM_ELEV);
  if (cameraShake > 0) { cx += Math.sin(elapsed * 47) * cameraShake; cz += Math.cos(elapsed * 39) * cameraShake; }
  let lx = 0, ly = 1, lz = -0.2;
  const w = coinCamW;
  if (w > 0) {
    cx += (CAM_CLOSE.x - cx) * w; cy += (CAM_CLOSE.y - cy) * w; cz += (CAM_CLOSE.z - cz) * w;
    lx += (LOOK_CLOSE.x - lx) * w; ly += (LOOK_CLOSE.y - ly) * w; lz += (LOOK_CLOSE.z - lz) * w;
  }
  const wantFov = baseFov + (34 - baseFov) * w;
  if (Math.abs(camera.fov - wantFov) > 0.01) { camera.fov = wantFov; camera.updateProjectionMatrix(); }
  camera.position.set(cx, cy, cz);
  camera.lookAt(lx, ly, lz);
  composer.render();
}

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastTime) / 1000, 0.033); lastTime = now;
  if (state === 'playing' || state === 'menu' || state === 'gameover') {
    const steps = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / steps;
    if (state === 'playing') for (let i = 0; i < steps; i++) physicsStep(h);
    else updateFlippers(dt);
  }
  updateCoinAnim(dt);
  if (state !== 'paused') {
    updateParticles(dt); updateDecor(dt);
    if (state === 'playing' || state === 'menu') updatePlunger(dt);
    updateBall(dt);
  }
  render();
}

// ------------------------------------------------------------
// Controls
// ------------------------------------------------------------
function setFlipper(which, pressed) {
  if (state !== 'playing') return;
  const was = which === 'left' ? leftHeld : rightHeld;
  if (which === 'left') leftHeld = pressed; else rightHeld = pressed;
  if (pressed && !was) { ensureAudio(); if (!tilted) sfx.flipper(); }
  else if (!pressed && was && !tilted) sfx.flipperUp();
}
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  const menuLike = state === 'menu' || state === 'gameover';
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (state === 'menu' && screen !== 'coin') { if (screen === 'intro' && (e.code === 'Enter' || e.code === 'Space')) showScreen('select'); return; }
  if (e.code === 'Space' || e.code === 'ArrowDown') { if (menuLike) { if (!ficha && !coinAnim) insertCoin(); else tryStart(); } else startCharge(); }
  if (e.code === 'Enter' && menuLike) { if (!ficha && !coinAnim) insertCoin(); else tryStart(); }
  if (e.code === 'KeyC') insertCoin();
  if (e.code === 'KeyT' && state === 'gameover') showScreen('select');
  if (e.code === 'KeyA' || e.code === 'ArrowLeft' || e.code === 'ShiftLeft') setFlipper('left', true);
  if (e.code === 'KeyD' || e.code === 'ArrowRight' || e.code === 'ShiftRight') setFlipper('right', true);
  if (e.code === 'ArrowUp' || e.code === 'KeyW') nudge();
  if (e.code === 'KeyP' || e.code === 'Escape') pauseGame();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowDown') releaseLaunch();
  if (e.code === 'KeyA' || e.code === 'ArrowLeft' || e.code === 'ShiftLeft') setFlipper('left', false);
  if (e.code === 'KeyD' || e.code === 'ArrowRight' || e.code === 'ShiftRight') setFlipper('right', false);
});
window.addEventListener('blur', () => { leftHeld = rightHeld = false; if (state === 'playing') pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pauseGame(); });

function bindHold(btn, which) {
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); btn.classList.add('pressed'); setFlipper(which, true); });
  const rel = (e) => { e.preventDefault?.(); btn.classList.remove('pressed'); setFlipper(which, false); };
  btn.addEventListener('pointerup', rel); btn.addEventListener('pointercancel', rel); btn.addEventListener('lostpointercapture', rel);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}
bindHold(ui.leftTouch, 'left'); bindHold(ui.rightTouch, 'right');
ui.launchTouch.addEventListener('pointerdown', (e) => { e.preventDefault(); ui.launchTouch.setPointerCapture?.(e.pointerId); ui.launchTouch.classList.add('pressed'); startCharge(); });
const relLaunch = () => { ui.launchTouch.classList.remove('pressed'); releaseLaunch(); };
ui.launchTouch.addEventListener('pointerup', relLaunch);
ui.launchTouch.addEventListener('pointercancel', relLaunch);
ui.startButton.addEventListener('click', tryStart);
ui.resumeButton.addEventListener('click', pauseGame);
ui.restartButton.addEventListener('click', tryStart);
ui.coinBtn.addEventListener('click', insertCoin);
ui.coinBtn2.addEventListener('click', insertCoin);
ui.coinFooter.addEventListener('click', insertCoin);
stage.addEventListener('pointerdown', () => canvas.focus?.());
canvas.tabIndex = 0;

// ------------------------------------------------------------
// Apply a table style (recolors everything live)
// ------------------------------------------------------------
function applyTheme(id, save = true) {
  const T = THEMES.find((t) => t.id === id) || THEMES[0];
  THEME = T; PAL = T.pal;
  const S = T.scene, M = T.mats;
  if (save) { try { localStorage.setItem(THEME_KEY, T.id); } catch (e) {} }

  // scene, lights, post-processing
  scene.background.set(S.bg); scene.fog.color.set(S.bg); scene.fog.density = S.fog;
  renderer.toneMappingExposure = S.exposure; scene.environmentIntensity = S.env;
  bloomPass.strength = S.bloom[0]; bloomPass.radius = S.bloom[1]; bloomPass.threshold = S.bloom[2];
  hemiLight.color.set(S.hemi[0]); hemiLight.groundColor.set(S.hemi[1]); hemiLight.intensity = S.hemi[2];
  ambLight.color.set(S.amb[0]); ambLight.intensity = S.amb[1];
  keyLight.color.set(S.key[0]); keyLight.intensity = S.key[1];
  rimLight.color.set(S.rim[0]); rimLight.intensity = S.rim[1];
  pinkFill.color.set(S.fillA); blueFill.color.set(S.fillB);
  floor.material.color.set(S.floor);

  // cabinet materials
  for (const k of ['darkMetal', 'frame']) { mats[k].map = M.wood ? woodTex : null; mats[k].needsUpdate = true; }
  mats.darkMetal.color.set(M.dark); mats.frame.color.set(M.frame);
  mats.steel.color.set(M.steel); mats.steel.metalness = M.metal;
  mats.rubber.color.set(M.rubber);
  for (const k of ['cyan', 'blue', 'pink', 'gold']) { const [c, e, i] = M[k]; mats[k].color.set(c); mats[k].emissive.set(e); mats[k].emissiveIntensity = i; }
  mats.whiteGlow.color.set(M.glow);

  // game pieces
  T.bumpers.forEach((d, i) => {
    Object.assign(BUMPER_DEFS[i], d);
    const b = bumpers[i]; b.css = d.css; b.baseEm = [S.bumpEm, S.bumpEm / 2];
    b.mats[0].color.set(d.hex); b.mats[0].emissive.set(d.em); b.mats[1].emissive.set(d.em);
  });
  T.targets.forEach((d, i) => {
    Object.assign(TARGET_DEFS[i], d);
    const t = targets[i]; t.css = d.css; t.mat.color.set(d.hex); t.mat.emissive.set(d.em);
  });
  slingMats.forEach((m) => { m.color.set(T.sling.c); m.emissive.set(T.sling.e); });
  flippers.forEach((f) => { f.mat.color.set(T.flipper.c); f.mat.emissive.set(T.flipper.e); });
  ballMaterial.color.set(T.ball.c); ballGlow.color.set(T.ball.glow);
  trailMeshes.forEach((m) => m.material.color.set(T.ball.trail));
  laneSensors.forEach((s) => s.mat.emissive.set(PAL.light));
  inlaneSensors.forEach((s) => s.mat.emissive.set(PAL.red));

  // artwork
  redrawPlayfield(); glassRedraw(); glass.material.color.set(T.glass.tint);
  plaque.material.map.dispose(); plaque.material.map = makeSignTexture('OLD PINBALL', PAL.light); plaque.material.needsUpdate = true;
  coinSign.material.map.dispose(); coinSign.material.map = makeSignTexture('FICHA', PAL.gold); coinSign.material.needsUpdate = true;

  // page chrome
  const root = document.documentElement.style, C = T.css;
  root.setProperty('--cyan', C.accent); root.setProperty('--pink', C.accent2); root.setProperty('--gold', C.gold);
  root.setProperty('--text', C.text); root.setProperty('--bg', C.bg); root.setProperty('--acc', C.acc);
  root.setProperty('--p1', C.p1); root.setProperty('--p2', C.p2); root.setProperty('--tshadow', C.shadow);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', C.bg);
  document.title = 'Old Pinball';
  const nt = document.querySelector('.start-panel .neon-title'); if (nt) nt.innerHTML = 'OLD<br /><span>PINBALL</span>';
  const sc = document.querySelector('.strip-center'); if (sc) sc.innerHTML = `OLD PINBALL <span>™</span> <b>—</b> 2026`;
  document.querySelectorAll('.theme-dot').forEach((b) => b.classList.toggle('on', b.dataset.id === T.id));
  document.querySelectorAll('.theme-name').forEach((el) => { el.textContent = `ESTILO · ${T.name}`; });
  if (ui.themeFooterLabel) ui.themeFooterLabel.textContent = `ESTILO: ${T.name}`;
}
function canChangeTheme() { return !coinAnim && state === 'gameover'; }
function setTheme(id) { if (!$('#table-cards')) return;
  if (id === THEME.id) return;
  if (!canChangeTheme()) { showToast('TROQUE O ESTILO NO MENU', 1.2); return; }
  applyTheme(id); sfx.tick();
}
function cycleTheme(dir = 1) {
  const i = THEMES.findIndex((t) => t.id === THEME.id);
  setTheme(THEMES[(i + dir + THEMES.length) % THEMES.length].id);
}
function buildThemePickers() {
  document.querySelectorAll('.theme-picker').forEach((box) => {
    box.innerHTML = '';
    THEMES.forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'theme-dot'; b.dataset.id = t.id; b.title = t.name; b.setAttribute('aria-label', `Estilo ${t.name}`);
      b.style.setProperty('--a', t.css.accent); b.style.setProperty('--b', t.css.accent2);
      b.addEventListener('click', () => { setTheme(t.id); b.blur(); });
      box.appendChild(b);
    });
  });
}
ui.themeFooter.addEventListener('click', () => { if (state === 'menu' || state === 'gameover') showScreen('select'); });
applyTheme(THEME.id, false);

updateHud();
resize();
requestAnimationFrame(animate);

window.__NEON_PINBALL__ = { get score() { return score; }, get lives() { return lives; }, get state() { return state; }, threeVersion: THREE_VERSION };

  

// ------------------------------------------------------------
// Modo captura: abra index.html?capture no navegador e ele baixa um print real de cada mesa
// (classic.png, neon.png, space.png, ocean.png, jungle.png, volcano.png) -> coloque em /images
// ------------------------------------------------------------
if (new URLSearchParams(location.search).has('capture')) runCapture();
async function runCapture() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  [introEl, selectEl, ui.start, ui.gameover, ui.pause].forEach((e) => e.classList.add('hidden'));
  ui.toast.classList.add('hidden');
  stage.style.cssText = 'position:fixed;left:0;top:0;width:720px;height:960px;z-index:200;border-radius:0';
  renderer.setPixelRatio(1); resize();
  await (document.fonts?.ready || Promise.resolve());
  const msg = document.createElement('div');
  msg.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:300;padding:10px 14px;background:#000c;color:#fff;font:14px sans-serif;border-radius:8px';
  document.body.appendChild(msg);
  for (const t of THEMES) {
    msg.textContent = `Capturando ${t.name}…`;
    applyTheme(t.id, false); await wait(1600);
    ball.x = 0.7; ball.z = -0.6; ball.vx = ball.vz = 0; ballLaunched = true;
    bumpers.forEach((b, i) => { b.flash = i === 0 ? 1 : 0.35; });
    targetsLit = [true, false, true, false]; lanesLit = [true, true, false]; updateHud();
    spawnSparks(bumpers[0].x, bumpers[0].z, bumpers[0].css, 18, 1.2); spawnRing(bumpers[0].x, bumpers[0].z, bumpers[0].css);
    updateDecor(0.016); updateBall(0.016); updateParticles(0.05);
    render();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${t.id}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    ballLaunched = false; await wait(700);
  }
  msg.textContent = 'Pronto! Mova os 6 arquivos .png baixados para a pasta images/ e abra o jogo normalmente.';
}
