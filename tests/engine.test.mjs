import {Match} from '../dist/engine.js';
import assert from 'node:assert/strict';
const m=new Match(42);m.random=()=>0;
for(let i=0;i<5;i++){m.advise('nova',0,true);m.advise('vale',0,true);const r=m.kick();assert.equal(r.nova.move,0);assert.equal(r.vale.move,0);assert.equal(r.goal,false);assert.equal(r.nova.followed,true);assert.equal(r.vale.followed,true);assert.equal(m.kick(),null);assert(m.finish());assert.equal(m.finish(),false);if(i<4)assert(m.next())}
assert.equal(m.phase,'complete');assert.equal(m.saves,5);assert.equal(m.agents.nova.trust,0);assert.equal(m.agents.vale.trust,100);assert.equal(m.agents.nova.broken,5);assert.equal(m.next(),false);
m.reset(42);assert.equal(m.round,1);assert.equal(m.agents.nova.trust,70);assert.equal(m.history.length,0);m.random=()=>0;
for(let i=0;i<2;i++){m.advise('nova',m.plans.vale);m.kick();m.finish();m.next()}assert.equal(m.agents.nova.trust,32);m.advise('nova',(m.plans.vale+1)%3,true);m.kick();m.finish();assert.equal(m.agents.nova.trust,46);
const opposite=new Match(1);opposite.random=()=>0;opposite.advise('nova',2);opposite.advise('vale',0);assert.equal(opposite.kick().goal,true);
let followedLow=0,followedHigh=0;for(let s=1;s<=1000;s++){const a=new Match(s),b=new Match(s);a.agents.nova.trust=10;a.advise('nova',1);b.agents.nova.trust=90;b.advise('nova',1);followedLow+=a.kick().nova.followed;followedHigh+=b.kick().nova.followed}assert(followedLow<200);assert(followedHigh>750);
for(let s=0;s<100;s++){const a=new Match(s);for(let r=0;r<5;r++){const result=a.kick();assert([0,1,2].includes(result.nova.move));assert([0,1,2].includes(result.vale.move));assert.equal(result.goal,result.nova.move!==result.vale.move);a.finish();a.next()}assert.equal(a.history.length,5);assert.equal(a.goals+a.saves,5)}
console.log(`PASS: direct directions, same-side save/opposite-side goal, 5-kick loop, duplicate guard, promises, recovery, clean restart, 100 full matches. Low/high trust follow rates: ${followedLow}/1000 vs ${followedHigh}/1000.`);
