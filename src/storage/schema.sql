CREATE TABLE IF NOT EXISTS schema_version (
  version INT NOT NULL PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scans (
  id VARCHAR(26) NOT NULL PRIMARY KEY,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  sessions_scanned INT NOT NULL DEFAULT 0,
  findings_count INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS patterns (
  id VARCHAR(26) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium',
  category VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS findings (
  id VARCHAR(26) NOT NULL PRIMARY KEY,
  scan_id VARCHAR(26) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  source VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (scan_id) REFERENCES scans(id)
);

CREATE TABLE IF NOT EXISTS finding_patterns (
  finding_id VARCHAR(26) NOT NULL,
  pattern_id VARCHAR(26) NOT NULL,
  confidence FLOAT NOT NULL DEFAULT 1.0,
  PRIMARY KEY (finding_id, pattern_id),
  FOREIGN KEY (finding_id) REFERENCES findings(id),
  FOREIGN KEY (pattern_id) REFERENCES patterns(id)
);

CREATE TABLE IF NOT EXISTS suggestions (
  id VARCHAR(26) NOT NULL PRIMARY KEY,
  finding_id VARCHAR(26) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  action_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (finding_id) REFERENCES findings(id)
);
