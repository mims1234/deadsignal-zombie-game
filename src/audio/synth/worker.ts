/**
 * The engine's background synthesis, off the main thread: the sounds and loops nobody needs the moment a run starts
 * (`Engine.queueSynthesis`) are rendered here one job a message, so a long one (a few hundred ms) never holds up a
 * frame. The samples come back transferred; the engine only copies them into AudioBuffers.
 */
import type { LoopId, SoundId } from '../ids';
import { synthLoop, synthSound } from './registry';

export type SynthJob = { kind: 'sound'; id: SoundId; v: number; rate: number } | { kind: 'loop'; id: Exclude<LoopId, 'ambience'>; rate: number };
export type SynthDone = SynthJob & { data: Float32Array; sampleRate: number };

self.onmessage = (e: MessageEvent<SynthJob>): void => {
  const job = e.data;
  const { data, sampleRate } = job.kind === 'sound' ? synthSound(job.id, job.v, job.rate) : synthLoop(job.id, job.rate);
  const done: SynthDone = { ...job, data, sampleRate };
  (self as unknown as Worker).postMessage(done, [data.buffer]);
};
