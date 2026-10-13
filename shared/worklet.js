// worklet.js — the one AudioWorklet processor every Forte instrument can use.
// The page adds its engine module first (which sets globalThis[EngineName]),
// then this file, and creates
//   new AudioWorkletNode(ctx, 'forte-processor', { processorOptions: { engine: 'EngineName' }, … })
//
// Engine contract (the same class runs in Node for tests and renders):
//   new Engine(sampleRate)
//   process(L, R, n)              fill n samples (R may be a scratch buffer for mono pages)
//   noteOn(key, velocity, data)   velocity 0..1; data = whatever the page attached
//   noteOff(key)
//   setParams(P)                  full parameter object, or the page's engineParams(P)
//   setSustain?(on)   allNotesOff?()   handle?(msg)   (any other message type)
//   voiceCount?()                 shown in the CPU pill
//   engine.post(msg)              set by this wrapper: send a message to the page

const now = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

class ForteProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const name = options.processorOptions?.engine;
    const Engine = globalThis[name];
    if (!Engine) throw new Error(`engine ${name} not loaded`);
    this.engine = new Engine(sampleRate);
    this.engine.post = (m) => this.port.postMessage(m);
    this.port.onmessage = (e) => this.handle(e.data);
    this.busy = 0;
    this.blocks = 0;
    this.spare = new Float32Array(128);
  }

  handle(m) {
    const e = this.engine;
    try {
      switch (m.type) {
        case 'noteOn': e.noteOn(m.key, m.velocity, m.data); break;
        case 'noteOff': e.noteOff(m.key); break;
        case 'params': e.setParams(m.params); break;
        case 'sustain': e.setSustain?.(m.on); break;
        case 'panic': e.allNotesOff?.(); break;
        default: e.handle?.(m);
      }
    } catch (err) {
      this.port.postMessage({ type: 'error', message: err.message, key: m.key });
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    const L = out[0], R = out.length > 1 ? out[1] : this.spare;
    const t0 = now();
    this.engine.process(L, R, L.length);
    this.busy += now() - t0;
    if (++this.blocks >= 96) {
      const budget = (this.blocks * L.length * 1000) / sampleRate;
      this.port.postMessage({ type: 'stats', load: this.busy / budget, voices: this.engine.voiceCount?.() });
      this.busy = 0;
      this.blocks = 0;
    }
    return true;
  }
}

registerProcessor('forte-processor', ForteProcessor);
