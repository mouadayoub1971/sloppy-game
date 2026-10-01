export const DIRECTIONS=['Left','Center','Right'];
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export class Match {
 constructor(seed=Date.now()){this.reset(seed)}
 reset(seed=Date.now()){this.seed=seed>>>0;this.round=1;this.goals=0;this.saves=0;this.phase='advice';this.history=[];this.last=null;this.agents={nova:this.agent(),vale:this.agent()};this.prepare();}
 agent(){return {trust:70,honest:0,lies:0,kept:0,broken:0,moves:[0,0,0],advice:null,promise:false}}
 random(){let t=this.seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}
 pick(a=[0,1,2]){return a[Math.floor(this.random()*a.length)]}
 common(a){let top=Math.max(...a);return this.pick(a.map((n,i)=>n===top?i:-1).filter(i=>i!==-1))}
 prepare(){for(const a of Object.values(this.agents)){a.advice=null;a.promise=false}const n=this.agents.nova,v=this.agents.vale,likelyDive=this.common(v.moves);this.plans={nova:this.history.length&&this.random()<.68?this.pick([0,1,2].filter(x=>x!==likelyDive)):this.pick(),vale:this.history.length&&this.random()<.68?this.common(n.moves):this.pick()};this.phase='advice';}
 advise(name,direction,promise=false){if(this.phase!=='advice')return false;if(!['nova','vale'].includes(name)||!(direction===null||[0,1,2].includes(direction)))throw new Error('Choose Nova or Vale and a valid direction.');const a=this.agents[name];a.advice=direction;a.promise=direction!==null&&Boolean(promise);return true}
 choose(name){const a=this.agents[name];let probability=clamp(a.trust/100+(a.promise?.09:0)-(a.broken*.03),.04,.94);if(a.trust<=30)probability=a.promise?.25:.08;const followed=a.advice!==null&&this.random()<probability;let move=this.plans[name];if(followed)move=a.advice;return {move,followed,probability,reason:a.advice===null?'instinct':followed?'trusted':a.trust<35?'distrust':'independent'}}
 kick(){if(this.phase!=='advice')return null;const nova=this.choose('nova'),vale=this.choose('vale');const result={round:this.round,plans:{...this.plans},nova,vale,goal:nova.move!==vale.move,reviews:{}};for(const name of ['nova','vale']){const a=this.agents[name],opponent=name==='nova'?'vale':'nova',before=a.trust;const truth=a.advice===null?null:(name==='nova'?a.advice!==result.vale.move:a.advice===result.nova.move);if(truth===true){a.honest++;if(a.promise)a.kept++;a.trust=clamp(a.trust+(a.promise?14:8),0,100)}if(truth===false){a.lies++;if(a.promise)a.broken++;a.trust=clamp(a.trust-(a.promise?29:19),0,100)}result.reviews[name]={truth,promise:a.promise,delta:a.trust-before,before,after:a.trust,advice:a.advice};a.moves[result[name].move]++}this.phase='playing';this.last=result;return result}
 finish(){if(this.phase!=='playing')return false;this.history.push(this.last);if(this.last.goal)this.goals++;else this.saves++;this.phase=this.round===5?'complete':'result';return true}
 next(){if(this.phase==='result'){this.round++;this.prepare();return true}return false}
 snapshot(){return {phase:this.phase,round:this.round,goals:this.goals,saves:this.saves,openingPlans:{...this.plans},agents:JSON.parse(JSON.stringify(this.agents)),last:this.last,history:this.history.map(r=>({round:r.round,shot:r.nova.move,dive:r.vale.move,goal:r.goal}))}}
}
