CREATE TABLE board_keys (id INTEGER PRIMARY KEY, salt TEXT NOT NULL);
INSERT INTO board_keys VALUES (1, lower(hex(randomblob(32))));

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  title TEXT NOT NULL,
  scene TEXT NOT NULL,
  created INTEGER NOT NULL,
  day TEXT NOT NULL,
  network TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX newest_posts ON posts(hidden,created DESC,id DESC);

CREATE TABLE votes (
  post TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  voter TEXT NOT NULL, day TEXT NOT NULL, week TEXT NOT NULL, network TEXT NOT NULL,
  PRIMARY KEY(post,voter,day)
) WITHOUT ROWID;
CREATE INDEX vote_expiry ON votes(day);
CREATE TABLE scores (
  period TEXT NOT NULL, post TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  total INTEGER NOT NULL, created INTEGER NOT NULL,
  PRIMARY KEY(period,post)
) WITHOUT ROWID;
CREATE INDEX podium ON scores(period,total DESC,created DESC,post DESC);

CREATE TABLE reports (
  post TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  voter TEXT NOT NULL, day TEXT NOT NULL, network TEXT NOT NULL,
  PRIMARY KEY(post,voter)
) WITHOUT ROWID;
CREATE VIEW moderation_queue AS SELECT p.id,p.title,count(*) AS reports
  FROM reports r JOIN posts p ON p.id=r.post WHERE p.hidden=0 GROUP BY p.id;

-- All three quotas and the triggering action commit or roll back together.
CREATE TABLE daily_usage (
  day TEXT NOT NULL, bucket TEXT NOT NULL, used INTEGER NOT NULL, ceiling INTEGER NOT NULL,
  PRIMARY KEY(day,bucket), CONSTRAINT board_daily_limit CHECK(used<=ceiling)
) WITHOUT ROWID;
CREATE VIEW meter AS SELECT '' kind,'' day,'' actor,'' network,0 site_max,0 actor_max,0 net_max;
CREATE TRIGGER charge INSTEAD OF INSERT ON meter BEGIN
  INSERT INTO daily_usage VALUES
    (NEW.day,NEW.kind,1,NEW.site_max),
    (NEW.day,NEW.kind||':u:'||NEW.actor,1,NEW.actor_max),
    (NEW.day,NEW.kind||':n:'||NEW.network,1,NEW.net_max)
  ON CONFLICT(day,bucket) DO UPDATE SET used=used+1;
END;
CREATE TABLE board_size (id INTEGER PRIMARY KEY, posts INTEGER NOT NULL,
  CONSTRAINT board_capacity CHECK(posts<=4000));
INSERT INTO board_size VALUES (1,0);
CREATE TRIGGER hung AFTER INSERT ON posts BEGIN
  UPDATE board_size SET posts=posts+1 WHERE id=1;
  INSERT INTO meter VALUES ('post',NEW.day,NEW.owner,NEW.network,100,5,18);
END;
CREATE TRIGGER unpinned AFTER DELETE ON posts BEGIN
  UPDATE board_size SET posts=posts-1 WHERE id=1;
END;
CREATE TRIGGER counted AFTER INSERT ON votes BEGIN
  INSERT INTO meter VALUES ('vote',NEW.day,NEW.voter,NEW.network,1500,30,120);
  INSERT INTO scores(period,post,total,created)
    SELECT periods.period,NEW.post,1,p.created FROM posts p
    CROSS JOIN (SELECT 'all' AS period UNION ALL SELECT 'd:'||NEW.day UNION ALL SELECT 'w:'||NEW.week) periods
    WHERE p.id=NEW.post
    ON CONFLICT(period,post) DO UPDATE SET total=total+1;
END;
CREATE TRIGGER reported AFTER INSERT ON reports BEGIN
  INSERT INTO meter VALUES ('report',NEW.day,NEW.voter,NEW.network,150,5,20);
END;
