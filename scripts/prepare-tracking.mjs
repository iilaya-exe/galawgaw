import { cp, mkdir } from 'node:fs/promises';
const source = new URL('../node_modules/@mediapipe/tasks-vision/', import.meta.url);
const output = new URL('../public/tracking/', import.meta.url);
await mkdir(output, { recursive: true });
await cp(new URL('vision_bundle.mjs', source), new URL('vision_bundle.mjs', output));
await cp(new URL('wasm/', source), new URL('wasm/', output), { recursive: true });
console.log('Prepared local tracking runtime for background workers.');
