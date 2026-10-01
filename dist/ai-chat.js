const $=id=>document.getElementById(id);
export class AIChat {
 constructor(hooks){
  this.hooks=hooks;this.active=false;this.busy=false;this.data=null;this.retry={};
  $('ai-mode').onclick=()=>this.active?this.local():this.enable();
  for(const name of ['nova','vale'])$(`${name}-chat`).onsubmit=e=>{e.preventDefault();this.send(name)};
 }
 async post(path,body){
  const response=await fetch(`/api/${path}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data)throw Error(data?.error||'AI is unavailable. You can play locally.');
  return data;
 }
 status(message){$('ai-status').textContent=message}
 lock(value){this.busy=value;$('ai-mode').disabled=value;$('play').disabled=value;$('restart').disabled=value;for(const name of ['nova','vale'])$(`${name}-chat`).querySelectorAll('button,textarea').forEach(el=>el.disabled=value||this.hooks.getMatch().phase!=='advice')}
 update(data,animate=false){this.data=data;this.hooks.sync(data,animate);this.renderChats()}
 renderChats(){for(const name of ['nova','vale']){const log=$(`${name}-messages`);log.replaceChildren();for(const line of this.data.chats[name]){const p=document.createElement('p');p.textContent=`${line.role==='user'?'You':name==='nova'?'Nova':'Vale'}: ${line.content}`;log.append(p)}log.scrollTop=log.scrollHeight}}
 async enable(){if(this.busy)return;this.lock(true);this.status('Connecting to the players…');try{const data=await this.post('session',{});this.active=true;$('agent-mode-label').textContent='Synthetic voices · AI character decisions';document.querySelector('.app').classList.add('ai-active');$('ai-mode').textContent='Play locally';$('ai-mode').setAttribute('aria-pressed','true');for(const name of ['nova','vale'])$(`${name}-chat`).hidden=false;this.update(data);this.status('AI chat · Talk privately with each player before the kick.')}catch(e){this.status(e.message)}finally{this.lock(false)}}
 local(){if(this.busy)return;this.active=false;$('agent-mode-label').textContent='Synthetic voices · Local strategy agents';this.data=null;this.retry={};document.querySelector('.app').classList.remove('ai-active');$('ai-mode').textContent='Try AI chat';$('ai-mode').setAttribute('aria-pressed','false');for(const name of ['nova','vale'])$(`${name}-chat`).hidden=true;this.hooks.resetLocal();this.status('Local play · A fresh match. No model calls.');this.lock(false)}
 async chat(name,message){
  const prior=this.retry[name],key=JSON.stringify([this.data.game,this.data.match.round,message]);
  const id=prior?.key===key?prior.id:crypto.randomUUID();this.retry[name]={key,id};
  const data=await this.post('chat',{id,agent:name,message,game:this.data.game,round:this.data.match.round});
  this.update(data);delete this.retry[name];return data;
 }
 async send(name){if(this.busy||!this.active)return;const field=$(`${name}-message`),message=field.value.trim();if(!message)return;this.lock(true);this.status(`${name==='nova'?'Nova':'Vale'} is thinking…`);try{await this.chat(name,message);field.value='';this.status('Message received. Keep talking, or let them play.')}catch(e){this.status(e.message)}finally{this.lock(false)}}
 async play(){if(this.busy)return;const phase=this.hooks.getMatch().phase;if(phase==='playing')return;this.lock(true);try{
  if(phase==='complete'){await this.action('reset');this.status('A new match. The shared AI allowance stays the same.');return}
  if(phase==='result'){await this.action('next');this.status('The next kick. What will you tell them?');return}
  this.status('Both players are choosing…');
  for(const name of ['nova','vale'])if(!this.data.decisions[name])await this.chat(name,'Make your own choice for this kick.');
  const data=await this.post('kick',{id:crypto.randomUUID(),game:this.data.game,round:this.data.match.round});this.update(data,true);this.status('AI decisions locked. Their explanations appear with the result.');
 }catch(e){this.status(e.message)}finally{this.lock(false)}}
 async action(path){const data=await this.post(path,{id:crypto.randomUUID(),game:this.data.game,round:this.data.match.round});this.retry={};this.update(data)}
 async restart(){if(this.busy)return;this.lock(true);try{await this.action('reset');this.status('A fresh match. The shared AI allowance stays the same.')}catch(e){this.status(e.message)}finally{this.lock(false)}}
}
