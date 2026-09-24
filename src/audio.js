/**
 * GTA: VICE CITY KAKKANAD (ഗ്രാൻഡ് തെഫ്റ്റ് ഓട്ടോ: കാക്കനാട്)
 * DOMAIN 7: WEB AUDIO SYNTHESIZER & 3 RADIO STATIONS
 * Zero external audio files! Pure Web Audio API engine sounds, horns, sirens, punches, and radio.
 */

class AudioRadioEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.initialized = false;
    this.currentStation = 0; // 0, 1, 2

    // Radio Sequencer State
    this.radioTimer = null;
    this.radioStep = 0;
    this.masterGain = null;
    this.radioGain = null;

    // Engine Nodes
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineFilter = null;
    this.engineGain = null;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.radioGain = this.ctx.createGain();
      this.radioGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      this.radioGain.connect(this.masterGain);

      this.setupEngineSound();
      this.startRadio();

      this.initialized = true;
    } catch (e) {
      console.warn("Web Audio initialization error:", e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.7, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  // --- 1. Vehicle Engine Synthesizer ---
  setupEngineSound() {
    this.engineOsc1 = this.ctx.createOscillator();
    this.engineOsc1.type = "sawtooth";
    this.engineOsc1.frequency.setValueAtTime(50, this.ctx.currentTime);

    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = "triangle";
    this.engineOsc2.frequency.setValueAtTime(100, this.ctx.currentTime);

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.setValueAtTime(400, this.ctx.currentTime);

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.engineOsc1.start();
    this.engineOsc2.start();
  }

  updateEngine(rpmRatio, isAuto = false) {
    if (!this.initialized || this.isMuted) return;
    const now = this.ctx.currentTime;

    if (rpmRatio <= 0.01) {
      this.engineGain.gain.setTargetAtTime(0.02, now, 0.05);
      return;
    }

    const baseFreq = isAuto ? (85 + rpmRatio * 320) : (50 + rpmRatio * 220);
    this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.04);
    this.engineOsc2.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.04);

    const filterCutoff = 350 + rpmRatio * 1500;
    this.engineFilter.frequency.setTargetAtTime(filterCutoff, now, 0.04);

    this.engineGain.gain.setTargetAtTime(0.12, now, 0.05);
  }

  // --- 2. Vehicle Horns & Sirens ---
  playHorn(type = "car") {
    if (!this.initialized || this.isMuted) return;
    const now = this.ctx.currentTime;

    if (type === "auto") {
      this.playTone(660, 0.09, now, 0.35);
      this.playTone(880, 0.09, now + 0.11, 0.35);
    } else if (type === "bus") {
      [523.25, 659.25, 783.99, 1046.5].forEach((f) => {
        this.playTone(f, 0.45, now, 0.25);
      });
    } else if (type === "siren") {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.linearRampToValueAtTime(950, now + 0.25);
      osc.frequency.linearRampToValueAtTime(450, now + 0.5);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.52);
    } else {
      this.playTone(440, 0.25, now, 0.3);
      this.playTone(554.37, 0.25, now, 0.3);
    }
  }

  // --- 3. Melee Punch & Hit Combat Sounds ---
  playPunchWhoosh() {
    if (!this.initialized || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.14);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playPunchImpact() {
    if (!this.initialized || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Melee smack transient
    const bufferSize = this.ctx.sampleRate * 0.12;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const out = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) out[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(150, now + 0.12);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.65, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now);

    // Deep chest thud
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.15);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.5, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  playVehicleDoor() {
    if (!this.initialized || this.isMuted) return;
    const now = this.ctx.currentTime;
    // Heavy car door slam / latch
    this.playTone(180, 0.08, now, 0.35);
    this.playTone(85, 0.15, now + 0.08, 0.45);
  }

  playCashPickup() {
    if (!this.initialized || this.isMuted) return;
    const now = this.ctx.currentTime;
    // Retro cha-ching chime
    this.playTone(987.77, 0.08, now, 0.25);
    this.playTone(1318.51, 0.18, now + 0.07, 0.3);
  }

  playPedestrianScream() {
    if (!this.initialized || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(580, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.3);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  playCrash(intensity = 1.0) {
    if (!this.initialized || this.isMuted) return;
    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.35;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const out = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) out[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900 * intensity, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7 * intensity, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now);
  }

  playTone(freq, dur, time, vol) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + dur);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  // --- 4. Three Radio Stations ---
  nextStation() {
    this.currentStation = (this.currentStation + 1) % window.KAKKANAD_CONFIG.RADIO.length;
    this.showRadioBanner();
  }

  showRadioBanner() {
    const banner = document.getElementById("radio-banner");
    const stName = document.getElementById("radio-station-name");
    const stGenre = document.getElementById("radio-genre");
    const station = window.KAKKANAD_CONFIG.RADIO[this.currentStation];

    if (stName) stName.textContent = station.name;
    if (stGenre) stGenre.textContent = station.genre.toUpperCase();

    if (banner) {
      banner.style.transform = "translateX(0)";
      banner.style.opacity = "1";
      setTimeout(() => {
        banner.style.opacity = "0.7";
      }, 3500);
    }
  }

  startRadio() {
    if (this.radioTimer) return;
    const tempo = 124;
    const intervalMs = (60 / tempo / 4) * 1000;

    const waveBass = [73.42, 73.42, 87.31, 98.0, 110.0, 98.0, 87.31, 65.41];
    const waveLead = [293.66, 349.23, 440.0, 523.25, 587.33, 523.25, 440.0, 349.23];

    const kochiBass = [110.0, 110.0, 130.81, 146.83, 164.81, 146.83, 130.81, 98.0];
    const kochiLead = [440.0, 523.25, 659.25, 523.25, 659.25, 783.99, 659.25, 523.25];

    const chillBass = [87.31, 87.31, 103.83, 116.54, 87.31, 77.78, 87.31, 103.83];
    const chillLead = [349.23, 392.0, 440.0, 523.25, 440.0, 392.0, 349.23, 293.66];

    this.radioTimer = setInterval(() => {
      if (this.isMuted || !this.ctx) return;
      const now = this.ctx.currentTime;

      let bassNote, leadNote;
      if (this.currentStation === 0) {
        bassNote = waveBass[Math.floor(this.radioStep / 2) % waveBass.length];
        leadNote = waveLead[this.radioStep % waveLead.length];
      } else if (this.currentStation === 1) {
        bassNote = kochiBass[Math.floor(this.radioStep / 2) % kochiBass.length];
        leadNote = kochiLead[this.radioStep % kochiLead.length];
      } else {
        bassNote = chillBass[Math.floor(this.radioStep / 4) % chillBass.length];
        leadNote = chillLead[this.radioStep % chillLead.length];
      }

      if (this.radioStep % 2 === 0) {
        this.playSynthNote(bassNote, "sawtooth", 0.12, 0.14, now, 600);
      }

      if (this.radioStep % 4 !== 3) {
        this.playSynthNote(leadNote, "triangle", 0.08, 0.12, now, 1800);
      }

      this.radioStep = (this.radioStep + 1) % 64;
    }, intervalMs);
  }

  playSynthNote(freq, type, duration, volume, time, filterCutoff) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterCutoff, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.radioGain);

    osc.start(time);
    osc.stop(time + duration + 0.05);
  }
}

window.soundEngine = new AudioRadioEngine();
