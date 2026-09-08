// Audio lifecycle checks need no browser context, audio device, or network.
import { test, expect } from '@playwright/test';
import { audio } from '../js/audio.js';

class TestAudioContext {
  constructor() {
    this.currentTime = 1;
    this.state = 'suspended';
    this.destination = {};
    this.oscillators = [];
    this.gains = [];
  }
  createGain() {
    const node = {
      gain: { value: 0, events: [], setTargetAtTime(value, time, duration) { this.events.push({ value, time, duration }); } },
      connect(target) { this.target = target; },
      disconnect() { this.disconnected = true; },
    };
    this.gains.push(node);
    return node;
  }
  createOscillator() {
    const node = {
      frequency: { value: 0 },
      connect(target) { this.target = target; },
      disconnect() { this.disconnected = true; },
      start() { this.started = true; },
      stop(time) { this.stoppedAt = time; },
    };
    this.oscillators.push(node);
    return node;
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
}

function withSound(check) {
  const previousWindow = globalThis.window;
  globalThis.window = { AudioContext: TestAudioContext };
  try { check(new audio.constructor()); }
  finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

test('a solved buzzer signal waits for audio unlock and fades away on release', () => {
  withSound(sound => {
    sound.setBuzzer(0.08);
    expect(sound.ctx).toBeNull();
    expect(sound.buzzer).toBeNull();
    sound.resume();
    expect(sound.ctx.oscillators).toHaveLength(1);
    const tone = sound.buzzer;
    expect(tone.osc.started).toBe(true);
    expect(tone.gain.gain.events.at(-1).value).toBeGreaterThan(0);
    expect(tone.gain.gain.value).toBe(0); // starts silent, then ramps up
    const eventCount = tone.gain.gain.events.length;
    sound.setBuzzer(0.08);
    expect(tone.gain.gain.events).toHaveLength(eventCount);
    sound.setBuzzer(0);
    expect(sound.buzzer).toBeNull();
    expect(tone.gain.gain.events.at(-1).value).toBe(0);
    expect(tone.osc.stoppedAt).toBeGreaterThan(sound.ctx.currentTime);
    tone.osc.onended();
    expect(tone.osc.disconnected).toBe(true);
    expect(tone.gain.disconnected).toBe(true);
  });
});

test('muting gates the buzzer and unmuting resumes only a still-powered signal', () => {
  withSound(sound => {
    sound.enabled = false;
    sound.setBuzzer(0.08);
    sound.resume();
    expect(sound.ctx.oscillators).toHaveLength(0);
    sound.setEnabled(true);
    expect(sound.ctx.oscillators).toHaveLength(1);
    sound.setEnabled(false);
    expect(sound.master.gain.value).toBe(0);
    expect(sound.buzzer).toBeNull();
    sound.setBuzzer(0);
    sound.setEnabled(true);
    expect(sound.ctx.oscillators).toHaveLength(1);
    expect(sound.buzzer).toBeNull();
  });
});

test('invalid or negligible solved current cannot leave a buzzer sounding', () => {
  withSound(sound => {
    sound.resume();
    for (const value of [0, 0.00001, NaN, Infinity, undefined]) sound.setBuzzer(value);
    expect(sound.ctx.oscillators).toHaveLength(0);
    sound.setBuzzer(0.08);
    sound.setBuzzer(NaN);
    expect(sound.buzzer).toBeNull();
  });
});
