import {mkdir,copyFile,rm} from 'node:fs/promises';
// Emit the Worker without exposing its source alongside public assets.
await rm('build-worker',{recursive:true,force:true});
await mkdir('build-worker/worker',{recursive:true});
await mkdir('build-worker/dist',{recursive:true});
for(const file of ['index.js','store.js','model.js'])await copyFile(`worker/${file}`,`build-worker/worker/${file}`);
await copyFile('dist/engine.js','build-worker/dist/engine.js');
console.log('Worker ESM entry: build-worker/worker/index.js; public assets: dist/');
