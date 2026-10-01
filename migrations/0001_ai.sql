-- Apply once to the existing shared DB. Never reset this ledger for a new match/deploy.
CREATE TABLE sessions (
 id TEXT PRIMARY KEY,
 ip TEXT NOT NULL,
 created INTEGER NOT NULL,
 expires INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL
);
CREATE INDEX sessions_ip_created ON sessions(ip, created);
CREATE TABLE requests (
 session TEXT NOT NULL REFERENCES sessions(id),
 id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 expected_revision INTEGER NOT NULL,
 ip TEXT NOT NULL,
 created INTEGER NOT NULL,
 reserve INTEGER NOT NULL CHECK(reserve = 50000),
 status TEXT NOT NULL CHECK(status IN ('pending','complete','uncertain')),
 actual INTEGER CHECK(actual IS NULL OR (typeof(actual)='integer' AND actual>=0 AND actual<=reserve)),
 latency INTEGER,
 response TEXT,
 next_state TEXT,
 PRIMARY KEY(session,id)
);
CREATE INDEX requests_created ON requests(created);
CREATE INDEX requests_ip_created ON requests(ip,created);
CREATE TABLE budget_stops (reason TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TRIGGER reserve_guard BEFORE INSERT ON requests BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM budget_stops) THEN RAISE(ABORT,'ai_stopped') END;
 SELECT CASE WHEN COALESCE((SELECT SUM(reserve) FROM requests),0)+NEW.reserve>5000000 THEN RAISE(ABORT,'budget_exhausted') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM requests WHERE session=NEW.session AND status='pending') THEN RAISE(ABORT,'request_pending') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM requests WHERE created>NEW.created-60000)>=20 THEN RAISE(ABORT,'global_rate_limit') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM requests WHERE ip=NEW.ip AND created>NEW.created-60000)>=6 THEN RAISE(ABORT,'rate_limit') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM requests WHERE session=NEW.session AND created>NEW.created-60000)>=4 THEN RAISE(ABORT,'rate_limit') END;
END;
CREATE TRIGGER session_guard BEFORE INSERT ON sessions BEGIN
 SELECT CASE WHEN (SELECT COUNT(*) FROM sessions WHERE ip=NEW.ip AND created>NEW.created-3600000)>=5 THEN RAISE(ABORT,'session_rate_limit') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM sessions WHERE created>NEW.created-60000)>=60 THEN RAISE(ABORT,'global_rate_limit') END;
END;

-- Commit the model response and new session state in the same SQLite statement.
CREATE TRIGGER complete_guard BEFORE UPDATE OF status ON requests
WHEN NEW.status='complete' BEGIN
 SELECT CASE WHEN OLD.status!='pending' OR NEW.actual IS NULL OR NEW.response IS NULL OR NEW.next_state IS NULL
  OR NOT EXISTS(SELECT 1 FROM sessions WHERE id=NEW.session AND revision=NEW.expected_revision)
  THEN RAISE(ABORT,'state_conflict') END;
END;
CREATE TRIGGER complete_session AFTER UPDATE OF status ON requests
WHEN NEW.status='complete' BEGIN
 UPDATE sessions SET state=NEW.next_state,revision=revision+1 WHERE id=NEW.session AND revision=NEW.expected_revision;
END;
