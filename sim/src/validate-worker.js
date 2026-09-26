// #43: module worker — validator summary off the main thread. Message in: {id, recipe, ref, raw, stage, locale};
// out: first {id, ack: true}, then {id, recvAt, V, computeMs, validateMs} or {id, error}. main.js ignores results whose id is not the latest run.
import { validateJob } from './validate-job.js';

self.onmessage = (e) => {
  const { id } = e.data;
  const recvAt = performance.timeOrigin + performance.now();   // wall-clock receive time (headless timing, #43)
  self.postMessage({ id, ack: true });   // job received: main may now start its own heavy work (the wrap bake)
  try {
    self.postMessage({ id, recvAt, ...validateJob(e.data) });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.stack) || err) });
  }
};
