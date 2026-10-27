BlockchainCrypto database
=========================
Tables (what each one stores)
  users               accounts: username, email, password_hash (SHA-256 of "username:password")
  operations          activity log used by the Dashboard and Profile pages
  signatures          signed transactions: public key, tx hash, signature r and s (private keys are never stored)
  merkle_trees        one row per built tree: root, leaf count, levels
  merkle_leaves       the transactions and their leaf hashes for each tree
  blocks              blockchain blocks: index, previous hash, block hash, Merkle root, nonce, time
  block_transactions  the transactions inside each block

Relationships: users 1-to-many operations, signatures, merkle_trees, blocks.
               merkle_trees 1-to-many merkle_leaves. blocks 1-to-many block_transactions.

Import (MySQL / phpMyAdmin / XAMPP)
  1. Start Apache and MySQL in XAMPP and open http://localhost/phpmyadmin
  2. Click Import, choose mysql/blockchaincrypto_mysql.sql, then click Import.
     This creates the database "blockchaincrypto" with all tables and sample data.

Import (SQLite)
  Open sqlite/blockchaincrypto.db directly in "DB Browser for SQLite".
  (sqlite/blockchaincrypto_sqlite.sql is the same database as a script.)

Sample login in the data: username demo, password Password123.

Note: the website in source_code/ currently keeps its data in the browser (localStorage).
This database is the matching server-side design for the same data.
