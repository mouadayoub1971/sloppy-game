import {Match} from '../dist/engine.js';
import {Store} from './store.js';
import {payload,infer,limitedText,DIRECTIONS} from './model.js';
const cookieName='__Host-double-bluff';
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const fresh=()=>({game:crypto.randomUUID(),match:new Match(),chats:{nova:[],vale:[]},decisions:{},lastAction:null});
function hydrate(state){state.match=Object.assign(new Match(1),state.match);return state}
const view=s=>({game:s.game,match:s.match.snapshot(),chats:s.chats,decisions:s.decisions});
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const enabled=env=>env.AI_ENABLED==='true' && typeof env.OPENROUTER_KEY==='string' && env.OPENROUTER_KEY.length>0 && /^deepseek\/[a-z0-9._-]+$/.test(env.OPENROUTER_MODEL||'') && env.VERIFIED_MODEL===env.OPENROUTER_MODEL && !!env.DB;
const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(x);
export function createWorker({fetcher=fetch,now=Date.now}={}){return {async fetch(request,env){
 const url=new URL(request.url);
 if(!url.pathname.startsWith('/api/'))return env.ASSETS?.fetch(request)??new Response('Static assets unavailable',{status:503});
 try {
  if(!enabled(env))return json({error:'AI is unavailable. Local play is ready.',code:'unavailable'},503);
  const store=new Store(env.DB);
  if(url.pathname==='/api/status'&&request.method==='GET')return json({available:await store.available()});
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(request.headers.get('Origin')!==url.origin||request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return json({error:'Invalid request origin or content type'},403);
  const body=JSON.parse(await limitedText(request,4096));
  if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Invalid request body'},400);
  const sid=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  const ip=await digest(request.headers.get('CF-Connecting-IP')||'local');
  let session=validId(sid)?await store.session(sid,now()):null;
  if(url.pathname==='/api/session'){
   if(!session){const state=fresh(),id=crypto.randomUUID();await store.create(id,ip,now(),state);return json(view(state),200,{'Set-Cookie':`${cookieName}=${id}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`})}
   return json(view(hydrate(JSON.parse(session.state))));
  }
  if(!session)return json({error:'Start a new AI session.',code:'session_required'},401);
  const state=hydrate(JSON.parse(session.state));
  if(!validId(body.id))return json({error:'Invalid request ID'},400);
  if(url.pathname==='/api/chat'){
   if(!['nova','vale'].includes(body.agent)||typeof body.message!=='string'||!body.message.trim()||body.message.length>800)return json({error:'Use a message of 1–800 characters.'},400);
   const fingerprint=await digest(JSON.stringify([body.agent,body.message,body.game,body.round]));
   const old=await store.request(session.id,body.id);
   if(old){if(old.fingerprint!==fingerprint)return json({error:'Request ID already used for another message.'},409);if(old.status==='complete')return json(JSON.parse(old.response));return json({error:'That request is pending or needs review. Local play is available.',code:'pending'},409)}
   if(body.game!==state.game||body.round!==state.match.round||state.match.phase!=='advice')return json({error:'This kick has changed. Refresh the session.'},409);
   const encoded=payload(env.OPENROUTER_MODEL,body.agent,state,body.message);
   await store.reserve(session.id,body.id,fingerprint,ip,now(),session.revision);
   const start=now();
   try {
    const {decision,actual}=await infer(env,encoded,fetcher);
    state.decisions[body.agent]=decision;
    state.chats[body.agent].push({role:'user',content:body.message},{role:'assistant',content:decision.dialogue});
    state.chats[body.agent]=state.chats[body.agent].slice(-20);
    state.match.advise(body.agent,decision.advice===null?null:DIRECTIONS.indexOf(decision.advice),decision.promise);
    const response={...view(state),decision,latencyMs:now()-start,costUsd:actual/1000000};
    await store.complete(session.id,session.revision,body.id,state,response,actual,now()-start);
    return json(response);
   }catch{
    // Never refund an attempted call; unknown costs stop further AI globally.
    await store.uncertain(session.id,body.id,now());
    return json({error:'AI paused because this request could not be verified. Local play is ready.',code:'unavailable'},503);
   }
  }
  if(!['/api/kick','/api/next','/api/reset'].includes(url.pathname))return json({error:'Not found'},404);
  if(state.lastAction?.id===body.id){if(state.lastAction.path!==url.pathname)return json({error:'Request ID conflict'},409);return json(view(state))}
  if(body.game!==state.game||body.round!==state.match.round)return json({error:'This kick has changed.'},409);
  if(url.pathname==='/api/kick'){
   if(state.match.phase!=='advice'||!state.decisions.nova||!state.decisions.vale)return json({error:'Talk to both players before the kick.'},409);
   state.match.kick(state.decisions);state.match.finish();
  }else if(url.pathname==='/api/next'){
   if(!state.match.next())return json({error:'Finish this kick first.'},409);
   state.decisions={};
  }else{const replacement=fresh();Object.assign(state,replacement)}
  state.lastAction={id:body.id,path:url.pathname};
  await store.save(session.id,session.revision,state);
  return json(view(state));
 }catch(error){
  const msg=String(error?.message||'');
  if(/rate_limit/.test(msg))return json({error:'A few too many messages. Try again in a minute.',code:'rate_limit'},429,{'Retry-After':'60'});
  if(/budget_exhausted|ai_stopped/.test(msg))return json({error:'AI play is paused. Local play is ready.',code:'budget'},503);
  if(/request_pending|state_conflict|UNIQUE/.test(msg))return json({error:'Another request is in progress.',code:'pending'},409);
  if(error instanceof SyntaxError||/body_too_large|context_too_large/.test(msg))return json({error:'Invalid or oversized request'},400);
  return json({error:'AI is unavailable. Local play is ready.',code:'unavailable'},503);
 }
}}}
export default createWorker();
