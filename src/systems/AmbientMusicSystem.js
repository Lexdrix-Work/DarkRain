import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * AmbientMusicSystem - Procedural generative dark-ambient music for Dark Rain.
 * S.T.A.L.K.E.R. vibes: tense, lonely, post-apocalyptic. No audio files -
 * everything is synthesized live with the WebAudio API.
 *
 * Layers (all persistent nodes, ~16 total - very low CPU):
 *   drone      - detuned low saws through a dark lowpass, the root of the Zone
 *   dissonance - a minor-2nd saw that swells in as tension rises
 *   pad        - slow minor-key chord progression (Am - F - C - G), seamless glides
 *   wind       - looped noise through a wandering bandpass, louder in bad weather
 *   pulse      - low heartbeat throb that fades in when danger is near
 *   motif      - sparse generative melancholic melody (lookahead scheduler + echo)
 *
 * A single "mood" value (0 = calm day, 1 = night combat / emission) is derived
 * from time of day, weather, emission phase and recent combat, and crossfades
 * every layer gain. The scheduler only runs while the AudioContext is running,
 * so music starts after the first user gesture (browser autoplay policy) and
 * the generative structure loops seamlessly forever.
 */
export class AmbientMusicSystem {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.game = audioManager.game;
        this.ctx = audioManager.audioContext;

        this.started = false;
        this.mood = 0.12;          // current, eased toward targetMood
        this.targetMood = 0.12;
        this.combatTimer = 0;      // seconds of "recent combat" remaining
        this.duck = 1.0;           // master duck multiplier (pause menu etc.)
        this.volume = 0.5;         // musicVolume * masterVolume, set by AudioManager

        // Chord progression state (Am - F - C - G), one chord every ~26s
        this.chords = [
            [110.00, 164.81, 220.00, 261.63], // Am
            [87.31, 130.81, 174.61, 220.00],  // F
            [98.00, 130.81, 164.81, 196.00],  // C
            [98.00, 146.83, 196.00, 246.94],  // G
        ];
        this.chordIndex = 0;
        this.chordTimer = 0;
        this.chordLength = 26;

        // Melancholic motif scale: A minor pentatonic over two octaves
        this.scale = [220.00, 261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
        // Chromatic tension notes, used more as mood rises
        this.tensionNotes = [233.08, 311.13, 466.16, 554.37];
        this.lastMotifDegree = 2;

        this.nodes = {};
        this.schedulerTimer = null;

        this.setupEvents();
    }

    setupEvents() {
        // Recent gunfire or damage marks the Zone as dangerous for a while
        globalEventBus.on(GameEvents.WEAPON_FIRE, () => {
            this.combatTimer = Math.max(this.combatTimer, 14);
        });
        globalEventBus.on(GameEvents.PLAYER_DAMAGE, () => {
            this.combatTimer = Math.max(this.combatTimer, 14);
        });
    }

    /**
     * Build the audio graph and start the generative engine.
     * Safe to call repeatedly; only the first call does anything.
     * Should be called from a user gesture (autoplay policy).
     */
    start() {
        if (this.started || !this.ctx) return;
        const ctx = this.ctx;
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }

        const N = (this.nodes = {});

        // Master music bus
        N.master = ctx.createGain();
        N.master.gain.value = this.volume * this.duck;
        N.master.connect(ctx.destination);

        // Echo for the motif (space, loneliness)
        N.delay = ctx.createDelay(1.5);
        N.delay.delayTime.value = 0.42;
        N.feedback = ctx.createGain();
        N.feedback.gain.value = 0.38;
        N.wet = ctx.createGain();
        N.wet.gain.value = 0.32;
        N.delay.connect(N.feedback);
        N.feedback.connect(N.delay);
        N.delay.connect(N.wet);
        N.wet.connect(N.master);

        // --- Drone: detuned low saws, dark lowpass ---
        N.droneFilter = ctx.createBiquadFilter();
        N.droneFilter.type = 'lowpass';
        N.droneFilter.frequency.value = 240;
        N.droneFilter.Q.value = 0.7;
        N.droneGain = ctx.createGain();
        N.droneGain.gain.value = 0.0;
        N.droneFilter.connect(N.droneGain);
        N.droneGain.connect(N.master);
        N.droneOsc = [];
        const droneDefs = [
            { f: 55.0, det: -6, g: 0.5 },
            { f: 55.0, det: 6, g: 0.5 },
            { f: 110.0, det: -4, g: 0.22 },
        ];
        for (const d of droneDefs) {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = d.f;
            o.detune.value = d.det;
            const g = ctx.createGain();
            g.gain.value = d.g;
            o.connect(g);
            g.connect(N.droneFilter);
            o.start();
            N.droneOsc.push(o);
        }
        // Slow breathing on the drone filter
        const droneLfo = ctx.createOscillator();
        droneLfo.type = 'sine';
        droneLfo.frequency.value = 0.05;
        const droneLfoDepth = ctx.createGain();
        droneLfoDepth.gain.value = 90;
        droneLfo.connect(droneLfoDepth);
        droneLfoDepth.connect(N.droneFilter.frequency);
        droneLfo.start();

        // --- Dissonance: minor-2nd saw, swells with tension ---
        N.disFilter = ctx.createBiquadFilter();
        N.disFilter.type = 'lowpass';
        N.disFilter.frequency.value = 320;
        N.disGain = ctx.createGain();
        N.disGain.gain.value = 0.0;
        const disOsc = ctx.createOscillator();
        disOsc.type = 'sawtooth';
        disOsc.frequency.value = 58.27; // Bb1 against the A1 drone
        disOsc.detune.value = 5;
        disOsc.connect(N.disFilter);
        N.disFilter.connect(N.disGain);
        N.disGain.connect(N.master);
        disOsc.start();

        // --- Pad: slow minor chord progression ---
        N.padFilter = ctx.createBiquadFilter();
        N.padFilter.type = 'lowpass';
        N.padFilter.frequency.value = 850;
        N.padGain = ctx.createGain();
        N.padGain.gain.value = 0.0;
        N.padFilter.connect(N.padGain);
        N.padGain.connect(N.master);
        N.padOsc = [];
        for (let i = 0; i < 4; i++) {
            const o = ctx.createOscillator();
            o.type = 'triangle';
            o.frequency.value = this.chords[0][i];
            o.connect(N.padFilter);
            o.start();
            N.padOsc.push(o);
        }

        // --- Wind: looped noise through a wandering bandpass ---
        const noiseBuf = this.makeNoiseBuffer(4);
        N.windSrc = ctx.createBufferSource();
        N.windSrc.buffer = noiseBuf;
        N.windSrc.loop = true;
        N.windFilter = ctx.createBiquadFilter();
        N.windFilter.type = 'bandpass';
        N.windFilter.frequency.value = 520;
        N.windFilter.Q.value = 0.55;
        N.windGain = ctx.createGain();
        N.windGain.gain.value = 0.0;
        N.windSrc.connect(N.windFilter);
        N.windFilter.connect(N.windGain);
        N.windGain.connect(N.master);
        N.windSrc.start();
        const windLfo = ctx.createOscillator();
        windLfo.type = 'sine';
        windLfo.frequency.value = 0.07;
        const windLfoDepth = ctx.createGain();
        windLfoDepth.gain.value = 320;
        windLfo.connect(windLfoDepth);
        windLfoDepth.connect(N.windFilter.frequency);
        windLfo.start();
        const windLfo2 = ctx.createOscillator();
        windLfo2.type = 'sine';
        windLfo2.frequency.value = 0.113;
        const windLfo2Depth = ctx.createGain();
        windLfo2Depth.gain.value = 140;
        windLfo2.connect(windLfo2Depth);
        windLfo2Depth.connect(N.windFilter.frequency);
        windLfo2.start();

        // --- Pulse: low heartbeat throb for danger ---
        N.pulseGain = ctx.createGain();
        N.pulseGain.gain.value = 0.0;
        const pulseOsc = ctx.createOscillator();
        pulseOsc.type = 'sine';
        pulseOsc.frequency.value = 49;
        pulseOsc.connect(N.pulseGain);
        N.pulseGain.connect(N.master);
        pulseOsc.start();
        const pulseLfo = ctx.createOscillator();
        pulseLfo.type = 'sine';
        pulseLfo.frequency.value = 0.85;
        N.pulseDepth = ctx.createGain();
        N.pulseDepth.gain.value = 1.0;
        pulseLfo.connect(N.pulseDepth);
        N.pulseDepth.connect(N.pulseGain.gain);
        pulseLfo.start();

        // Shimmer removed: high-pitched ringing was unpleasant

        // Motif scheduler: lookahead scheduling, 220ms ticks
        this.schedulerTimer = setInterval(() => this.schedulerTick(), 220);

        this.started = true;
    }

    makeNoiseBuffer(seconds) {
        const ctx = this.ctx;
        const rate = ctx.sampleRate;
        const len = Math.max(1, Math.floor(seconds * rate));
        const buf = ctx.createBuffer(1, len, rate);
        const data = buf.getChannelData(0);
        let lp = 0;
        for (let i = 0; i < len; i++) {
            // Pinkish noise: heavily lowpassed white noise, loop-safe-ish
            lp += 0.08 * ((Math.random() * 2 - 1) - lp);
            const edge = Math.min(1, i / (rate * 0.2), (len - i) / (rate * 0.2));
            data[i] = lp * 2.2 * edge;
        }
        return buf;
    }

    schedulerTick() {
        if (!this.started || this.ctx.state !== 'running') return;
        const now = this.ctx.currentTime;
        // Sparse, lonelier when calm; more insistent when tense
        const p = 0.13 + this.mood * 0.34;
        if (Math.random() < p) {
            const t = now + 0.1 + Math.random() * 0.7;
            this.playMotifNote(t);
        }
    }

    playMotifNote(time) {
        const ctx = this.ctx;
        const N = this.nodes;
        const t = Math.max(time, ctx.currentTime + 0.05);

        // Random walk on the scale keeps phrases coherent; tension pulls chromatic
        let degree = this.lastMotifDegree + Math.floor(Math.random() * 5) - 2;
        degree = Math.max(0, Math.min(this.scale.length - 1, degree));
        this.lastMotifDegree = degree;
        let freq;
        if (this.mood > 0.55 && Math.random() < 0.3) {
            freq = this.tensionNotes[Math.floor(Math.random() * this.tensionNotes.length)];
        } else {
            freq = this.scale[degree];
        }

        const vel = (0.10 + Math.random() * 0.08) * (0.7 + this.mood * 0.6);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vel, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.0);
        g.connect(N.master);
        g.connect(N.delay); // echo send

        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = freq;
        o.connect(g);
        const o2 = ctx.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = freq / 2;
        const g2 = ctx.createGain();
        g2.gain.value = 0.25;
        o2.connect(g2);
        g2.connect(g);
        o.start(t);
        o.stop(t + 3.2);
        o2.start(t);
        o2.stop(t + 3.2);
    }

    /**
     * Volume from AudioManager: musicVolume * masterVolume (0..1)
     */
    setVolume(v) {
        this.volume = Math.max(0, Math.min(1, v));
        if (this.started && this.nodes.master) {
            this.nodes.master.gain.setTargetAtTime(
                this.volume * this.duck, this.ctx.currentTime, 0.2
            );
        }
    }

    computeTargetMood() {
        const g = this.game;
        if (!g || g.gameState !== 'playing') return 0.10; // menus stay calm

        let m = 0.12;

        // Night is lonelier and more dangerous
        try {
            if (g.dayNightCycle && g.dayNightCycle.isNight()) m += 0.28;
        } catch (_) {}

        // Weather pressure
        const w = g.weatherSystem ? g.weatherSystem.currentWeather : null;
        const weatherMood = {
            cloudy: 0.04, overcast: 0.08, rain: 0.14, heavy_rain: 0.20,
            thunderstorm: 0.30, fog: 0.18, emission: 0.45,
        };
        if (w && weatherMood[w]) m += weatherMood[w];

        // Emissions are the Zone at its angriest
        const phase = g.emissionSystem ? g.emissionSystem.phase : null;
        if (phase === 'warning') m += 0.30;
        else if (phase === 'emission') m += 0.55;
        else if (phase === 'aftermath') m += 0.15;

        // Recent combat keeps tension high, then releases slowly
        if (this.combatTimer > 0) m += 0.45 * (this.combatTimer / 14);

        return Math.max(0, Math.min(1, m));
    }

    weatherWind() {
        const w = this.game && this.game.weatherSystem
            ? this.game.weatherSystem.currentWeather : null;
        const wind = {
            rain: 0.15, heavy_rain: 0.25, thunderstorm: 0.35,
            fog: 0.10, emission: 0.30,
        };
        return (w && wind[w]) || 0;
    }

    update(deltaTime) {
        if (!this.started) return;
        const dt = Math.min(deltaTime, 0.5);

        // Combat tension decays
        if (this.combatTimer > 0) {
            this.combatTimer = Math.max(0, this.combatTimer - dt);
        }

        // Ease mood toward target: tension rises fast, releases slowly
        this.targetMood = this.computeTargetMood();
        this.mood += (this.targetMood - this.mood) * Math.min(1, dt * (this.targetMood > this.mood ? 1.4 : 0.5));

        const m = this.mood;
        const N = this.nodes;
        const k = Math.min(1, dt * 1.6); // layer crossfade speed
        const ease = (param, target) => {
            param.value += (target - param.value) * k;
        };

        let night = false;
        try { night = !!(this.game.dayNightCycle && this.game.dayNightCycle.isNight()); } catch (_) {}

        ease(N.droneGain.gain, 0.30 + 0.20 * m);
        ease(N.disGain.gain, Math.max(0, m - 0.45) * 0.45);
        ease(N.padGain.gain, 0.26 * (1 - 0.55 * m));
        ease(N.windGain.gain, 0.16 + this.weatherWind() + (night ? 0.08 : 0) + m * 0.10);
        ease(N.pulseGain.gain, Math.max(0, m - 0.50) * 0.55);

        // Duck when paused
        const duckTarget = (this.game && this.game.isPaused) ? 0.35 : 1.0;
        this.duck += (duckTarget - this.duck) * Math.min(1, dt * 3);
        N.master.gain.value = this.volume * this.duck;

        // Advance the chord progression with seamless glides
        this.chordTimer += dt;
        if (this.chordTimer >= this.chordLength) {
            this.chordTimer = 0;
            this.chordIndex = (this.chordIndex + 1) % this.chords.length;
            const chord = this.chords[this.chordIndex];
            const now = this.ctx.currentTime;
            for (let i = 0; i < N.padOsc.length; i++) {
                N.padOsc[i].frequency.setTargetAtTime(chord[i], now, 2.5);
            }
        }
    }

    stop() {
        if (!this.started) return;
        this.started = false;
        if (this.schedulerTimer) {
            clearInterval(this.schedulerTimer);
            this.schedulerTimer = null;
        }
        try {
            if (this.nodes.master) this.nodes.master.disconnect();
        } catch (_) {}
        this.nodes = {};
    }
}
