DROP TRIGGER hung;
CREATE TRIGGER hung AFTER INSERT ON posts BEGIN
  UPDATE board_size SET bytes=bytes+length(CAST(NEW.scene AS BLOB))+3072 WHERE id=1;
  INSERT INTO meter VALUES ('post',NEW.day,NEW.owner,NEW.network,100,10,18);
END;

-- Existing daily counters keep their ceiling when the meter increments them.
UPDATE daily_usage SET ceiling=10 WHERE bucket GLOB 'post:u:*' AND ceiling=5;
