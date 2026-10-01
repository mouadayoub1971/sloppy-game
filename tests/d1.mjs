import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
// Real SQLite executes the production SQL; this adapter only mirrors D1's result shape.
export class DB {
 constructor(){this.sqlite=new DatabaseSync(':memory:');this.sqlite.exec(readFileSync(new URL('../migrations/0001_ai.sql',import.meta.url),'utf8'))}
 prepare(sql){
  const db=this;
  return {bind(...args){return {
   async first(){return db.sqlite.prepare(sql).get(...args)||null},
   async run(){const r=db.sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}}
  }}};
 }
 async batch(statements){this.sqlite.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.run());this.sqlite.exec('COMMIT');return rows}catch(e){this.sqlite.exec('ROLLBACK');throw e}}
}
