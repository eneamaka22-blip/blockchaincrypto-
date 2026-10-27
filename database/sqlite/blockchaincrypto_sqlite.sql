-- BlockchainCrypto database (SQLite)
PRAGMA foreign_keys = ON;


CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT  NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT     NOT NULL,            -- SHA-256 of username:password
  created_at    TEXT     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE operations (                          -- activity log (feeds Dashboard + Profile)
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  op_type     TEXT CHECK (op_type IN ('hash','sign','verify','merkle','proof','block')) NOT NULL,
  op_name     TEXT NOT NULL,
  duration_ms REAL NOT NULL DEFAULT 0,
  success     INTEGER NOT NULL DEFAULT 1,
  leaves      INTEGER NULL,
  depth       INTEGER NULL,
  tx_count    INTEGER NULL,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE signatures (                          -- public key only: private keys are never stored
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  public_key TEXT NOT NULL,
  tx_json    TEXT NOT NULL,
  tx_hash    TEXT NOT NULL,
  sig_r      TEXT NOT NULL,
  sig_s      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE merkle_trees (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  merkle_root TEXT NOT NULL,
  leaf_count  INTEGER NOT NULL,
  levels      INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE merkle_leaves (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id          INTEGER NOT NULL,
  position_no      INTEGER NOT NULL,
  transaction_text TEXT NOT NULL,
  leaf_hash        TEXT NOT NULL,
  UNIQUE (tree_id, position_no),
  FOREIGN KEY (tree_id) REFERENCES merkle_trees(id) ON DELETE CASCADE
);

CREATE TABLE blocks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  block_index INTEGER NOT NULL,
  prev_hash   TEXT NOT NULL,
  block_hash  TEXT NOT NULL,
  merkle_root TEXT NOT NULL,
  nonce       INTEGER NOT NULL,
  time_ms     INTEGER NOT NULL,                     -- timestamp used in the block hash
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, block_index),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE block_transactions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  block_id         INTEGER NOT NULL,
  position_no      INTEGER NOT NULL,
  transaction_text TEXT NOT NULL,
  FOREIGN KEY (block_id) REFERENCES blocks(id) ON DELETE CASCADE
);

-- Sample data
INSERT INTO users (username,email,password_hash,created_at) VALUES ('demo','demo@example.com','8e29edb732e3beae388031bdf35f16c9ac134027a7ebbf0be0cb4063ad0f04be','2026-10-22 02:54:22');
INSERT INTO operations (user_id,op_type,op_name,duration_ms,success,leaves,depth,tx_count,created_at) VALUES
 (1,'hash','SHA-256',0.200,1,NULL,NULL,NULL,'2026-10-22 06:25:46'),
 (1,'hash','Keccak-256',0.100,1,NULL,NULL,NULL,'2026-10-22 06:25:46'),
 (1,'sign','ECDSA sign',68.500,1,NULL,NULL,NULL,'2026-10-22 06:56:13'),
 (1,'verify','ECDSA verify',363.200,1,NULL,NULL,NULL,'2026-10-22 06:59:33'),
 (1,'merkle','Build tree',0.300,1,4,3,NULL,'2026-10-22 07:01:52'),
 (1,'proof','Merkle proof',0.200,1,NULL,2,NULL,'2026-10-22 07:04:10'),
 (1,'block','Create block',0.000,1,NULL,NULL,2,'2026-10-22 07:06:18');
INSERT INTO merkle_trees (user_id,merkle_root,leaf_count,levels,created_at) VALUES (1,'daa005733392b9689b8c07e599182b95ae23af1937a8b80532795c9048c491ad',4,3,'2026-10-22 07:01:52');
INSERT INTO merkle_leaves (tree_id,position_no,transaction_text,leaf_hash) VALUES
 (1,0,'G gives 2000 to H','3c87ccbf13ef3851e283a6d93aca8590bf16adc1c5e18029f4a4202e42c0a2eb'),
 (1,1,'J gives 4000 to P','f3cab21450c62701dc995873d9a58c8801e3e1034e47f753ee2e5f496c6a86b0'),
 (1,2,'W gives 5000 to I','8466e6184ba6b00cb872c9bccbab1ed1e9df3cbce387dc0f01f60fe42a38514e'),
 (1,3,'N gives 6000 to K','81fdd2501eab0f6d2fae57135dee9e4ea26b494655726b05ac3925767928d233');
INSERT INTO blocks (user_id,block_index,prev_hash,block_hash,merkle_root,nonce,time_ms,created_at) VALUES (1,1,'0000000000000000000000000000000000000000000000000000000000000000','6cccccf2c5000c72205e9161a5dc5dc4c9ac45bb656ebb01fa6d2b17fc70e9be','4e17811011ec217ac84a9e037a82758a7de318342886a88a37ebabf90f52af73',2083236893,1704049200000,'2023-12-31 19:00:00');
INSERT INTO block_transactions (block_id,position_no,transaction_text) VALUES (1,0,'Genesis block');
