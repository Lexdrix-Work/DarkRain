import * as THREE from 'three';
import { globalEventBus } from '../core/EventBus.js';

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
        
        // Handle audio context state
        document.addEventListener('click', () => {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
        }, { once: true });
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
    }

    dispose() {
        // Stop all sounds
        this.activeSounds.forEach(audio => {
            if (audio.isPlaying) audio.stop();
        });
        this.activeSounds.clear();
        
        // Stop music
        this.stopMusic(false);
        
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