export class Store {
 constructor(db){this.db=db}
 first(sql,...args){return this.db.prepare(sql).bind(...args).first()}
 run(sql,...args){return this.db.prepare(sql).bind(...args).run()}
 async session(id,now){return this.first('SELECT * FROM sessions WHERE id=? AND expires>?',id,now)}
 async create(id,ip,now,state){await this.run('INSERT INTO sessions(id,ip,created,expires,state) VALUES(?,?,?,?,?)',id,ip,now,now+86400000,JSON.stringify(state))}
 request(session,id){return this.first('SELECT * FROM requests WHERE session=? AND id=?',session,id)}
 async reserve(session,id,fingerprint,ip,now,revision){const r=await this.run("INSERT INTO requests(session,id,fingerprint,ip,created,expected_revision,reserve,status) SELECT ?,?,?,?,?,?,50000,'pending' FROM sessions WHERE id=? AND revision=?",session,id,fingerprint,ip,now,revision,session,revision);if(r.meta.changes!==1)throw Error('state_conflict')}
 async save(session,revision,state){const r=await this.run("UPDATE sessions SET state=?,revision=revision+1 WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM requests WHERE session=? AND status='pending')",JSON.stringify(state),session,revision,session);if(r.meta.changes!==1)throw Error('state_conflict')}
 async complete(session,revision,id,state,response,actual,latency){
  // SQLite triggers validate the expected revision and update the session atomically.
  const result=await this.run("UPDATE requests SET status='complete',response=?,actual=?,latency=?,next_state=? WHERE session=? AND id=? AND status='pending' AND expected_revision=?",JSON.stringify(response),actual,latency,JSON.stringify(state),session,id,revision);
  if(result.meta.changes!==1)throw Error('state_conflict');
 }

 async uncertain(session,id,now){await this.db.batch([
  this.db.prepare("UPDATE requests SET status='uncertain' WHERE session=? AND id=?").bind(session,id),
  this.db.prepare('INSERT INTO budget_stops(reason,created) VALUES(?,?)').bind('Upstream outcome or cost requires review',now)
 ])}
 async available(){return !await this.first('SELECT 1 FROM budget_stops LIMIT 1') && (await this.first('SELECT COALESCE(SUM(reserve),0) AS used FROM requests')).used<5000000}
}
