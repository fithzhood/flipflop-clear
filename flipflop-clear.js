/******************************************
 * FlipFlop
 * Puzzle "lights out": ogni tocco gira una carta e le quattro adiacenti.
 * Quando tutte le carte mostrano la stessa faccia hai vinto.
 ******************************************/
'use strict';

/******************************************
 * SEZIONE 1: COSTANTI E STATO
 ******************************************/
const MIN_SIZE = 3;
const MAX_SIZE = 10;
const DEFAULT_SIZE = 5;         // il gioco parte sempre da qui
const SCRAMBLE_MIN = 10;
const SCRAMBLE_MAX = 15;
const HUD_HEIGHT = 44;          // altezza della barra titolo/comandi
const SWAP_MS = 170;            // dissolvenza quando il puzzle cambia a vista
const HANDOVER_MS = 350;        // quanto prima della fine del lampo ricostruiamo la griglia

const el = {};
[
    'stage', 'grid', 'title', 'restart', 'menuToggle', 'sizeLabel', 'menu', 'scrim',
    'sizeButtons', 'newGame', 'victory', 'victoryCount'
].forEach(id => { el[id] = document.getElementById(id); });

const state = {
    size: DEFAULT_SIZE,
    cards: [],            // gli elementi .card, in ordine di indice
    locked: true          // true = i tocchi sulle carte sono ignorati
};

// geometria calcolata a ogni layout
let geom = { side: 0, card: 0, gap: 0, left: 0, top: 0 };

const timers = new Set();

/******************************************
 * SEZIONE 2: UTILITÀ
 ******************************************/
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function later(ms, fn) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
}

function clearTimers() {
    timers.forEach(clearTimeout);
    timers.clear();
}

/******************************************
 * SEZIONE 3: GEOMETRIA E DISEGNO
 ******************************************/
function computeGeometry() {
    const availW = el.stage.clientWidth;
    const availH = el.stage.clientHeight;
    const n = state.size;
    const gap = Math.max(2, Math.min(7, Math.round(Math.min(availW, availH) / (n * 26))));

    const fit = box => {
        const card = Math.max(1, Math.floor((box - gap * (n - 1)) / n));
        return { card, side: card * n + gap * (n - 1) };
    };

    const margin = 12;
    let g = fit(Math.min(availW, availH) - margin * 2);

    // La griglia è quadrata, lo schermo quasi mai: di solito resta parecchio
    // spazio libero per l'HUD. Se non ne resta, glielo ricaviamo dall'alto.
    const roomAtSides = (availW - g.side) / 2 >= 110;
    const roomAbove = (availH - g.side) / 2 >= HUD_HEIGHT;
    const offsetTop = (roomAtSides || roomAbove) ? 0 : HUD_HEIGHT;
    if (offsetTop) g = fit(Math.min(availW, availH - offsetTop) - margin * 2);

    geom = {
        side: g.side,
        card: g.card,
        gap,
        left: Math.round((availW - g.side) / 2),
        top: offsetTop + Math.round((availH - offsetTop - g.side) / 2)
    };
}

function applyGeometry() {
    const { side, card, gap, left, top } = geom;
    const n = state.size;
    el.grid.style.width = `${side}px`;
    el.grid.style.height = `${side}px`;
    el.grid.style.left = `${left}px`;
    el.grid.style.top = `${top}px`;
    el.grid.style.gap = `${gap}px`;
    el.grid.style.gridTemplateColumns = `repeat(${n}, ${card}px)`;
    el.grid.style.gridTemplateRows = `repeat(${n}, ${card}px)`;
    el.grid.style.setProperty('--card-radius', `${Math.max(3, Math.min(10, Math.round(card * 0.11)))}px`);
}

function relayout() {
    computeGeometry();
    applyGeometry();
}

/******************************************
 * SEZIONE 4: GRIGLIA E MOSSE
 ******************************************/
function buildGrid() {
    const total = state.size * state.size;
    el.grid.innerHTML = '';
    state.cards = [];

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < total; i++) {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.index = String(i);
        card.setAttribute('role', 'gridcell');

        const front = document.createElement('div');
        front.className = 'face face-front';
        const back = document.createElement('div');
        back.className = 'face face-back';

        card.append(front, back);
        fragment.appendChild(card);
        state.cards.push(card);
    }
    el.grid.appendChild(fragment);
}

function neighbours(index) {
    const n = state.size;
    const row = (index / n) | 0;
    const col = index % n;
    const list = [index];
    if (row > 0) list.push(index - n);
    if (row < n - 1) list.push(index + n);
    if (col > 0) list.push(index - 1);
    if (col < n - 1) list.push(index + 1);
    return list;
}

function applyMove(index) {
    neighbours(index).forEach(i => state.cards[i].classList.toggle('flipped'));
}

function isSolved() {
    const first = state.cards[0].classList.contains('flipped');
    return state.cards.every(card => card.classList.contains('flipped') === first);
}

function scramble() {
    const last = state.cards.length - 1;
    const moves = randInt(SCRAMBLE_MIN, SCRAMBLE_MAX);
    for (let i = 0; i < moves; i++) applyMove(randInt(0, last));
    // mosse ripetute possono annullarsi a vicenda: una griglia già risolta non è una partita
    let guard = 0;
    while (isSolved() && guard++ < 30) applyMove(randInt(0, last));
}

function setLocked(locked) {
    state.locked = locked;
    el.grid.classList.toggle('locked', locked);
}

/******************************************
 * SEZIONE 5: PARTITA E VITTORIA
 ******************************************/
/**
 * Costruisce il puzzle successivo in un colpo solo e senza animazioni: nessuna
 * carta deve animarsi mentre la griglia si rimonta.
 */
function startRound() {

    el.grid.classList.add('instant');
    state.cards.forEach(card => card.classList.remove('flipped'));
    relayout();
    scramble();
    void el.grid.offsetWidth;                 // forza il reflow prima di riattivare le transizioni
    el.grid.classList.remove('instant');

    setLocked(false);
}

/** Come startRound, ma con una breve dissolvenza: serve quando il cambio è a vista. */
function swapRound() {
    setLocked(true);
    el.grid.classList.add('fading');
    later(SWAP_MS, () => {
        startRound();
        el.grid.classList.remove('fading');
    });
}

function newGame() {
    clearTimers();
    hideVictory();
    swapRound();
}

function onCardClick(event) {
    if (state.locked) return;
    const card = event.target.closest('.card');
    if (!card) return;
    applyMove(Number(card.dataset.index));
    if (isSolved()) win();
}

function win() {
    setLocked(true);
    showVictory();
}

function showVictory() {
    const seconds = 1.2;
    document.body.classList.add('rewarding');

    // un lampo di conferma e via con la prossima
    el.victoryCount.textContent = '★';
    el.victoryCount.classList.add('show');
    el.victory.hidden = false;

    // il puzzle nuovo viene montato mentre il lampo è ancora sopra
    later(seconds * 1000 - HANDOVER_MS, startRound);
    later(seconds * 1000, hideVictory);
}

function hideVictory() {
    document.body.classList.remove('rewarding');
    el.victory.hidden = true;
    el.victoryCount.classList.remove('show');
}

/******************************************
 * SEZIONE 6: INTERFACCIA
 ******************************************/
function setSize(size) {
    state.size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, size));
    el.sizeLabel.textContent = `${state.size}×${state.size}`;
    el.sizeButtons.querySelectorAll('.size-btn').forEach(btn => {
        btn.setAttribute('aria-pressed', String(Number(btn.dataset.size) === state.size));
    });

    clearTimers();
    hideVictory();
    buildGrid();
    relayout();
    startRound();
}

function buildSizeButtons() {
    const fragment = document.createDocumentFragment();
    for (let size = MIN_SIZE; size <= MAX_SIZE; size++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'size-btn';
        btn.dataset.size = String(size);
        btn.textContent = `${size}×${size}`;
        btn.setAttribute('aria-pressed', 'false');
        fragment.appendChild(btn);
    }
    el.sizeButtons.appendChild(fragment);
}

function setMenuOpen(open) {
    el.menu.hidden = !open;
    el.scrim.hidden = !open;
    el.menuToggle.setAttribute('aria-expanded', String(open));
}

/******************************************
 * SEZIONE 7: EVENTI
 ******************************************/
el.grid.addEventListener('click', onCardClick);

el.restart.addEventListener('click', () => newGame());

el.menuToggle.addEventListener('click', () => setMenuOpen(el.menu.hidden));
el.scrim.addEventListener('click', () => setMenuOpen(false));

el.newGame.addEventListener('click', () => {
    setMenuOpen(false);
    newGame();
});

el.sizeButtons.addEventListener('click', event => {
    const btn = event.target.closest('.size-btn');
    if (!btn) return;
    setMenuOpen(false);
    setSize(Number(btn.dataset.size));
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setMenuOpen(false);
});

let resizeFrame = 0;
function onViewportChange() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(relayout);
}
window.addEventListener('resize', onViewportChange);
window.addEventListener('orientationchange', onViewportChange);
if (window.visualViewport) window.visualViewport.addEventListener('resize', onViewportChange);

/******************************************
 * SEZIONE 8: AVVIO
 ******************************************/
if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
    document.body.classList.add('capacitor');
}

buildSizeButtons();
setSize(DEFAULT_SIZE);
