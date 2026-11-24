-- Budget actual recipe bytes with room for metadata, indexes and vote scores.
-- Short recipes can keep accumulating without reserving 48 KiB for each one.
DROP TRIGGER hung;
DROP TRIGGER unpinned;
ALTER TABLE board_size RENAME TO initial_post_limit;
CREATE TABLE board_size (id INTEGER PRIMARY KEY, bytes INTEGER NOT NULL,
  CONSTRAINT board_capacity CHECK(bytes BETWEEN 0 AND 230686720));
INSERT INTO board_size SELECT 1,coalesce(sum(length(CAST(scene AS BLOB))+3072),0) FROM posts;
DROP TABLE initial_post_limit;
CREATE TRIGGER hung AFTER INSERT ON posts BEGIN
  UPDATE board_size SET bytes=bytes+length(CAST(NEW.scene AS BLOB))+3072 WHERE id=1;
  INSERT INTO meter VALUES ('post',NEW.day,NEW.owner,NEW.network,100,5,18);
END;
CREATE TRIGGER unpinned AFTER DELETE ON posts BEGIN
  UPDATE board_size SET bytes=bytes-length(CAST(OLD.scene AS BLOB))-3072 WHERE id=1;
END;
