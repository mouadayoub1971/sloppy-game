const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {DB} from './d1.mjs';
import {createWorker} from '../worker/index.js';
let calls=0;
const model='deepseek/offline-test';
const worker=createWorker({fetcher:async()=>{calls++;return Response.json({model,usage:{cost:.001,prompt_tokens:100,completion_tokens:64},choices:[{finish_reason:'stop',message:{content:JSON.stringify({dialogue:'I will take the right side.',direction:'right',explanation:'Your confidence convinced me to choose right.',advice:'right',promise:false})}}]})}});
const env={DB:new DB(),AI_ENABLED:'true',OPENROUTER_KEY:'offline-test-placeholder',OPENROUTER_MODEL:model,VERIFIED_MODEL:model,ASSETS:{async fetch(req){const path=new URL(req.url).pathname;try{const data=await readFile(new URL('../dist'+(path==='/'?'/index.html':path),import.meta.url));return new Response(data,{headers:{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html'}})}catch{return new Response('Not found',{status:404})}}}};
const server=createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);const r=await worker.fetch(new Request(`http://127.0.0.1:${server.address().port}${req.url}`,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}),env);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()))});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.click('#ai-mode');await page.waitForFunction(()=>document.querySelector('.app').classList.contains('ai-active'));
 await page.fill('#nova-message','Shoot right, I trust your aim.');await page.click('#nova-chat button');await page.waitForFunction(()=>document.querySelector('#nova-messages').textContent.includes('Nova:'));
 await page.fill('#vale-message','Dive right.');await page.click('#vale-chat button');await page.waitForFunction(()=>document.querySelector('#vale-messages').textContent.includes('Vale:'));
 await page.click('#play');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).phase==='result');
 assert.equal(await page.locator('#result-title').textContent(),'SAVED.');assert((await page.locator('#nova-quote').textContent()).includes('Your confidence convinced me'));
 assert.equal(calls,2);
 await page.click('#play');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).phase==='advice');assert.equal(await page.locator('#nova-message').isEnabled(),true);
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/ai-mobile-review.png',fullPage:true});
 await page.click('#ai-mode');assert.equal(await page.locator('#nova-chat').isVisible(),false);
 await page.locator('[data-agent="nova"] button[data-value="0"]').click();await page.locator('[data-agent="vale"] button[data-value="0"]').click();await page.click('#play');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).phase==='result');assert.equal(calls,2);
 assert.deepEqual(errors,[]);
 console.log('PASS browser: separate chats, AI decision animation/explanation, next kick, mobile width, local fallback, no JS errors; 2 mocked calls, zero paid calls.');
}finally{await browser.close();server.close()}
