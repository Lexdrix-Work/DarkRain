import * as THREE from 'three';
import { globalEventBus } from '../core/EventBus.js';
import { AmbientMusicSystem } from './AmbientMusicSystem.js';

/**
 * AudioManager - Handles all game audio (music, SFX, ambient)
 */
export class AudioManager {
    constructor(game) {
        this.game = game;
        
        // Audio context and listener
        this.listener = new THREE.AudioListener();
        this.audioContext = this.listener.context;
        
        // Audio pools
        this.sounds = new Map();
        this.music = new Map();
        this.ambience = new Map();
        
        // Active sounds for management
        this.activeSounds = new Set();
        this.currentMusic = null;
        this.currentAmbience = [];
        
        // Volume controls
        this.masterVolume = 1.0;
        this.musicVolume = 0.5;
        this.sfxVolume = 0.8;
        this.ambienceVolume = 0.6;
        
        // Music system
        this.musicFadeTime = 2.0;
        this.isMusicFading = false;
        this.musicSystem = null; // Procedural generative ambient music
        
        // Spatial audio settings
        this.maxDistance = 50;
        this.refDistance = 5;
        
        this.init();
    }

    init() {
        // Attach listener to camera
        if (this.game.player?.camera) {
            this.game.player.camera.add(this.listener);
        }
        
        // Setup event listeners
        this.setupEvents();
        
        // Procedurally synthesized Zone sounds (no audio assets needed)
        this.registerProceduralSounds();
        
        // Generative ambient music engine (WebAudio, no audio files)
        this.musicSystem = new AmbientMusicSystem(this);
        
        // Handle audio context state + start music after first user gesture
        // (browser autoplay policy: no audio before user interaction)
        const unlockAudio = () => {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            if (this.musicSystem && !this.musicSystem.started) {
                this.musicSystem.start();
            }
        };
        document.addEventListener('pointerdown', unlockAudio);
        document.addEventListener('keydown', unlockAudio);
        document.addEventListener('click', unlockAudio);
        // Also try on GAME_START event (New Game button)
        globalEventBus.on('game:start', unlockAudio);
        globalEventBus.on(GameEvents.GAME_START, unlockAudio);
    }

    setupEvents() {
        globalEventBus.on('audio:play', (data) => {
            this.playSound(data.sound, data);
        });
        
        globalEventBus.on('audio:stop', (data) => {
            this.stopSound(data.sound);
        });
        
        globalEventBus.on('audio:music', (data) => {
            this.playMusic(data.track, data.fade);
        });
    }

    /**
     * Register a sound effect
     * @param {string} name - Sound identifier
     * @param {AudioBuffer} buffer - Audio buffer
     * @param {Object} options - Sound options
     */
    registerSound(name, buffer, options = {}) {
        this.sounds.set(name, {
            buffer,
            options: {
                volume: options.volume || 1.0,
                loop: options.loop || false,
                spatial: options.spatial !== false,
                poolSize: options.poolSize || 5,
                ...options
            },
            pool: []
        });
    }

    /**
     * Register procedurally synthesized Zone sounds.
     * Buffers are generated with the WebAudio API - no audio assets required.
     */
    registerProceduralSounds() {
        const ctx = this.audioContext;
        if (!ctx || typeof ctx.createBuffer !== 'function') return;

        const synth = (seconds, fn) => {
            const rate = ctx.sampleRate;
            const len = Math.max(1, Math.floor(seconds * rate));
            const buf = ctx.createBuffer(1, len, rate);
            const data = buf.getChannelData(0);
            fn(data, rate, len);
            return buf;
        };
        const noise = () => Math.random() * 2 - 1;
        const env = (t, a, d) => t < a ? t / a : Math.max(0, 1 - (t - a) / d);

        // Detector blip - short sine ping, faster near anomalies
        this.registerSound('detector_beep', synth(0.09, (d, rate, len) => {
            for (let i = 0; i < len; i++) {
                const t = i / rate;
                d[i] = Math.sin(2 * Math.PI * 1240 * t) * env(t, 0.005, 0.085) * 0.6;
            }
        }), { volume: 0.7, spatial: false, poolSize: 4 });

        // Detector blip for artifacts - distinct two-tone chirp
        this.registerSound('detector_beep_artifact', synth(0.16, (d, rate, len) => {
            for (let i = 0; i < len; i++) {
                const t = i / rate;
                const f = t < 0.08 ? 880 : 1318;
                d[i] = Math.sin(2 * Math.PI * f * t) * env(t, 0.005, 0.155) * 0.6;
            }
        }), { volume: 0.7, spatial: false, poolSize: 4 });

        // Emission air-raid siren - 6s loop, slow wail
        this.registerSound('emission_siren', synth(6.0, (d, rate, len) => {
            let lp = 0;
            for (let i = 0; i < len; i++) {
                const t = i / rate;
                const f = 420 + 380 * Math.sin(2 * Math.PI * t / 6.0);
                const v = Math.sin(2 * Math.PI * f * t) * 0.5 + noise() * 0.04;
                lp += 0.2 * (v - lp);
                const edge = Math.min(1, t / 0.5, (6.0 - t) / 0.5); // loop-safe fade
                d[i] = lp * edge * 0.8;
            }
        }), { volume: 0.8, spatial: false, loop: true, poolSize: 1 });

        // Emission blast wave - deep rumble swell
        this.registerSound('emission_blast', synth(3.0, (d, rate, len) => {
            let lp = 0;
            for (let i = 0; i < len; i++) {
                const t = i / rate;
                const swell = Math.sin(Math.PI * Math.min(1, t / 3.0));
                const v = Math.sin(2 * Math.PI * 38 * t) * 0.7 + noise() * 0.5;
                lp += 0.06 * (v - lp);
                d[i] = lp * swell * 1.4;
            }
        }), { volume: 0.9, spatial: false, poolSize: 2 });

        // Psy drone - eerie detuned loop for emission peak / psi fields
        this.registerSound('psy_drone', synth(4.0, (d, rate, len) => {
            for (let i = 0; i < len; i++) {
                const t = i / rate;
                const lfo = 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.25 * t);
                const edge = Math.min(1, t / 0.4, (4.0 - t) / 0.4);
                d[i] = (Math.sin(2 * Math.PI * 55 * t) * 0.4 +
                        Math.sin(2 * Math.PI * 58.3 * t) * 0.35 +
                        Math.sin(2 * Math.PI * 220.7 * t) * 0.12 * lfo) * edge * 0.7;
            }
        }), { volume: 0.65, spatial: false, loop: true, poolSize: 1 });

        // Whisper - filtered noise syllables, for hallucinations
        this.registerSound('whisper', synth(1.8, (d, rate, len) => {
            let lp = 0, bp = 0;
            for (let i = 0; i < len; i++) {
                const t = i / rate;
                const syl = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3.1 * t + Math.sin(t * 7));
                const n = noise();
                lp += 0.35 * (n - lp);
                bp += 0.12 * ((n - lp) - bp);
                d[i] = (lp * 0.4 + bp * 1.6) * syl * env(t, 0.25, 1.55) * 0.55;
            }
        }), { volume: 0.75, spatial: false, poolSize: 3 });

        // Anomaly discharge - electrical crackle
        this.registerSound('anomaly_zap', synth(0.5, (d, rate, len) => {
            for (let i = 0; i < len; i++) {
                const t = i / rate;
                const f = 3200 - 2800 * (t / 0.5);
                const sq = Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.25;
                const crackle = noise() * (Math.random() < 0.3 ? 1 : 0.15);
                d[i] = (sq + crackle * 0.6) * env(t, 0.01, 0.49) * 0.7;
            }
        }), { volume: 0.85, poolSize: 4 });

        // Psy hit - dissonant cluster sting
        this.registerSound('psy_hit', synth(0.7, (d, rate, len) => {
            for (let i = 0; i < len; i++) {
                const t = i / rate;
                const trem = 0.6 + 0.4 * Math.sin(2 * Math.PI * 13 * t);
                d[i] = (Math.sin(2 * Math.PI * 110 * t) * 0.4 +
                        Math.sin(2 * Math.PI * 116.5 * t) * 0.4 +
                        Math.sin(2 * Math.PI * 233 * t) * 0.25) * trem * env(t, 0.02, 0.68) * 0.7;
            }
        }), { volume: 0.8, spatial: false, poolSize: 3 });

        // Artifact pickup - soft chime arpeggio
        this.registerSound('artifact_pickup', synth(0.9, (d, rate, len) => {
            const notes = [523.25, 659.25, 1046.5];
            for (let i = 0; i < len; i++) {
                const t = i / rate;
                let v = 0;
                notes.forEach((f, k) => {
                    const tt = t - k * 0.12;
                    if (tt > 0) v += Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt * 5) * 0.35;
                });
                d[i] = v;
            }
        }), { volume: 0.7, spatial: false, poolSize: 2 });

        // Bolt throw whoosh + landing clack
        this.registerSound('bolt_throw', synth(0.18, (d, rate, len) => {
            let lp = 0;
            for (let i = 0; i < len; i++) {
                const t = i / rate;
                lp += (0.1 + 0.8 * (t / 0.18)) * (noise() - lp);
                d[i] = lp * env(t, 0.03, 0.15) * 0.5;
            }
        }), { volume: 0.6, spatial: false, poolSize: 3 });
        this.registerSound('bolt_clack', synth(0.12, (d, rate, len) => {
            for (let i = 0; i < len; i++) {
                const t = i / rate;
                d[i] = (Math.sign(Math.sin(2 * Math.PI * 2150 * t)) * 0.3 + noise() * 0.35) *
                       Math.exp(-t * 45) * 0.7;
            }
        }), { volume: 0.7, poolSize: 3 });

        // Distant gunfire - muffled crack for far-away Zone firefights
        this.registerSound('gunshot_distant', synth(0.35, (d, rate, len) => {
            let lp = 0;
            for (let i = 0; i < len; i++) {
                const t = i / rate;
                const crack = noise() * Math.exp(-t * 30);
                lp += 0.08 * (crack - lp);
                const thump = Math.sin(2 * Math.PI * 90 * t) * Math.exp(-t * 18) * 0.8;
                d[i] = (lp * 1.2 + thump) * 0.6;
            }
        }), { volume: 0.55, poolSize: 4 });

        // Near gunshot - sharp crack with body
        this.registerSound('gunshot', synth(0.28, (d, rate, len) => {
            let lp = 0;
            for (let i = 0; i < len; i++) {
                const t = i / rate;
                const crack = noise() * Math.exp(-t * 55);
                lp += 0.25 * (crack - lp);
                const body = Math.sin(2 * Math.PI * 140 * t) * Math.exp(-t * 25) * 0.7;
                d[i] = (crack * 0.7 + lp * 0.8 + body) * 0.75;
            }
        }), { volume: 0.8, poolSize: 6 });

        // Mutant growl - FM synthesis
        this.registerSound('mutant_growl', synth(1.2, (d, rate, len) => {
            let phase = 0;
            for (let i = 0; i < len; i++) {
                const t = i / rate;
                const idx = 8 * env(t, 0.15, 1.05);
                phase += 2 * Math.PI * (68 + idx * 34 * Math.sin(2 * Math.PI * 31 * t)) / rate;
                d[i] = Math.sin(phase) * env(t, 0.15, 1.05) * 0.75;
            }
        }), { volume: 0.85, poolSize: 3 });
    }

    /**
     * Register music track
     * @param {string} name - Track identifier
     * @param {AudioBuffer} buffer - Audio buffer
     */
    registerMusic(name, buffer) {
        const audio = new THREE.Audio(this.listener);
        audio.setBuffer(buffer);
        audio.setLoop(true);
        audio.setVolume(0);
        this.music.set(name, audio);
    }

    /**
     * Register ambient sound
     * @param {string} name - Ambient identifier
     * @param {AudioBuffer} buffer - Audio buffer
     * @param {Object} options - Options
     */
    registerAmbience(name, buffer, options = {}) {
        this.ambience.set(name, {
            buffer,
            options: {
                volume: options.volume || 0.5,
                loop: true,
                ...options
            }
        });
    }

    /**
     * Play a sound effect
     * @param {string} name - Sound name
     * @param {Object} options - Playback options
     */
    playSound(name, options = {}) {
        const soundData = this.sounds.get(name);
        if (!soundData) {
            console.warn(`Sound not found: ${name}`);
            return null;
        }
        
        // Get or create audio from pool
        let audio = soundData.pool.find(a => !a.isPlaying);
        
        if (!audio) {
            if (soundData.pool.length < soundData.options.poolSize) {
                // Create new audio instance
                if (soundData.options.spatial && options.position) {
                    audio = new THREE.PositionalAudio(this.listener);
                    audio.setRefDistance(this.refDistance);
                    audio.setMaxDistance(this.maxDistance);
                    audio.setRolloffFactor(1);
                } else {
                    audio = new THREE.Audio(this.listener);
                }
                
                audio.setBuffer(soundData.buffer);
                soundData.pool.push(audio);
            } else {
                // Pool exhausted
                return null;
            }
        }
        
        // Configure audio
        const volume = (options.volume || soundData.options.volume) * this.sfxVolume * this.masterVolume;
        audio.setVolume(volume);
        audio.setLoop(options.loop || soundData.options.loop);
        
        // Position for spatial audio
        if (options.position && audio.panner) {
            audio.position.copy(options.position);
        }
        
        // Playback rate variation
        if (options.pitchVariation) {
            const variation = 1 + (Math.random() - 0.5) * options.pitchVariation;
            audio.setPlaybackRate(variation);
        }
        
        // Play
        if (audio.isPlaying) {
            audio.stop();
        }
        audio.play();
        
        this.activeSounds.add(audio);
        
        // Auto-cleanup
        audio.onEnded = () => {
            this.activeSounds.delete(audio);
        };
        
        return audio;
    }

    /**
     * Play a sound at a 3D position
     * @param {string} name - Sound name
     * @param {THREE.Vector3} position - World position
     * @param {Object} options - Additional options
     */
    playSoundAt(name, position, options = {}) {
        return this.playSound(name, { ...options, position });
    }

    /**
     * Stop a specific sound
     * @param {string} name - Sound name
     */
    stopSound(name) {
        const soundData = this.sounds.get(name);
        if (soundData) {
            soundData.pool.forEach(audio => {
                if (audio.isPlaying) {
                    audio.stop();
                }
            });
        }
    }

    /**
     * Play music track with crossfade
     * @param {string} name - Track name
     * @param {boolean} fade - Whether to fade transition
     */
    playMusic(name, fade = true) {
        const newTrack = this.music.get(name);
        if (!newTrack) {
            console.warn(`Music track not found: ${name}`);
            return;
        }
        
        const targetVolume = this.musicVolume * this.masterVolume;
        
        if (this.currentMusic && this.currentMusic !== newTrack) {
            if (fade) {
                // Crossfade
                this.fadeAudio(this.currentMusic, 0, this.musicFadeTime, () => {
                    this.currentMusic.stop();
                });
                
                newTrack.setVolume(0);
                if (!newTrack.isPlaying) newTrack.play();
                this.fadeAudio(newTrack, targetVolume, this.musicFadeTime);
            } else {
                this.currentMusic.stop();
                newTrack.setVolume(targetVolume);
                newTrack.play();
            }
        } else if (!this.currentMusic) {
            if (fade) {
                newTrack.setVolume(0);
                newTrack.play();
                this.fadeAudio(newTrack, targetVolume, this.musicFadeTime);
            } else {
                newTrack.setVolume(targetVolume);
                newTrack.play();
            }
        }
        
        this.currentMusic = newTrack;
    }

    /**
     * Stop current music
     * @param {boolean} fade - Whether to fade out
     */
    stopMusic(fade = true) {
        if (!this.currentMusic) return;
        
        if (fade) {
            this.fadeAudio(this.currentMusic, 0, this.musicFadeTime, () => {
                this.currentMusic.stop();
                this.currentMusic = null;
            });
        } else {
            this.currentMusic.stop();
            this.currentMusic = null;
        }
    }

    /**
     * Play ambient sound layer
     * @param {string} name - Ambience name
     */
    playAmbience(name) {
        const ambienceData = this.ambience.get(name);
        if (!ambienceData) return;
        
        // Check if already playing
        if (this.currentAmbience.some(a => a.name === name)) return;
        
        const audio = new THREE.Audio(this.listener);
        audio.setBuffer(ambienceData.buffer);
        audio.setLoop(true);
        audio.setVolume(ambienceData.options.volume * this.ambienceVolume * this.masterVolume);
        audio.play();
        
        this.currentAmbience.push({ name, audio });
    }

    /**
     * Stop ambient sound layer
     * @param {string} name - Ambience name
     * @param {boolean} fade - Whether to fade out
     */
    stopAmbience(name, fade = true) {
        const index = this.currentAmbience.findIndex(a => a.name === name);
        if (index === -1) return;
        
        const { audio } = this.currentAmbience[index];
        
        if (fade) {
            this.fadeAudio(audio, 0, 1.0, () => {
                audio.stop();
            });
        } else {
            audio.stop();
        }
        
        this.currentAmbience.splice(index, 1);
    }

    /**
     * Fade audio volume
     * @param {THREE.Audio} audio - Audio object
     * @param {number} targetVolume - Target volume
     * @param {number} duration - Fade duration in seconds
     * @param {Function} onComplete - Callback when complete
     */
    fadeAudio(audio, targetVolume, duration, onComplete) {
        const startVolume = audio.getVolume();
        const startTime = performance.now();
        
        const fade = () => {
            const elapsed = (performance.now() - startTime) / 1000;
            const t = Math.min(elapsed / duration, 1);
            
            audio.setVolume(THREE.MathUtils.lerp(startVolume, targetVolume, t));
            
            if (t < 1) {
                requestAnimationFrame(fade);
            } else if (onComplete) {
                onComplete();
            }
        };
        
        fade();
    }

    /**
     * Set master volume
     * @param {number} volume - Volume (0-1)
     */
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        this.updateAllVolumes();
    }

    /**
     * Set music volume
     * @param {number} volume - Volume (0-1)
     */
    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(1, volume));
        if (this.currentMusic) {
            this.currentMusic.setVolume(this.musicVolume * this.masterVolume);
        }
        if (this.musicSystem) {
            this.musicSystem.setVolume(this.musicVolume * this.masterVolume);
        }
    }

    /**
     * Set SFX volume
     * @param {number} volume - Volume (0-1)
     */
    setSFXVolume(volume) {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
    }

    /**
     * Set ambience volume
     * @param {number} volume - Volume (0-1)
     */
    setAmbienceVolume(volume) {
        this.ambienceVolume = Math.max(0, Math.min(1, volume));
        this.currentAmbience.forEach(({ audio, name }) => {
            const data = this.ambience.get(name);
            if (data) {
                audio.setVolume(data.options.volume * this.ambienceVolume * this.masterVolume);
            }
        });
    }

    updateAllVolumes() {
        // Update music
        if (this.currentMusic) {
            this.currentMusic.setVolume(this.musicVolume * this.masterVolume);
        }
        if (this.musicSystem) {
            this.musicSystem.setVolume(this.musicVolume * this.masterVolume);
        }
        
        // Update ambience
        this.currentAmbience.forEach(({ audio, name }) => {
            const data = this.ambience.get(name);
            if (data) {
                audio.setVolume(data.options.volume * this.ambienceVolume * this.masterVolume);
            }
        });
    }

    update(deltaTime) {
        // Update listener position to camera
        if (this.game.player?.camera) {
            // Listener is attached to camera, position updates automatically
        }
        // Drive the generative ambient music (mood, layers, scheduler)
        this.musicSystem?.update(deltaTime);
    }

    dispose() {
        // Stop all sounds
        this.activeSounds.forEach(audio => {
            if (audio.isPlaying) audio.stop();
        });
        this.activeSounds.clear();
        
        // Stop music
        this.stopMusic(false);
        this.musicSystem?.stop();
        
        // Stop ambience
        this.currentAmbience.forEach(({ audio }) => audio.stop());
        this.currentAmbience = [];
        
        // Dispose sound pools
        this.sounds.forEach(soundData => {
            soundData.pool.forEach(audio => {
                if (audio.isPlaying) audio.stop();
            });
        });
        
        // Dispose music
        this.music.forEach(audio => {
            if (audio.isPlaying) audio.stop();
        });
    }
}