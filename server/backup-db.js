const fs = require('fs');
const path = require('path');
const { DatabaseSync, backup } = require('node:sqlite');
const { SQLITE_PATH, getAllData } = require('./db');

const BACKUP_DIR = process.env.OMG_BACKUP_DIR || path.join(__dirname, 'backups');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  getAllData();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const target = path.join(BACKUP_DIR, `omg-${timestamp()}.sqlite`);
  const db = new DatabaseSync(SQLITE_PATH);

  try {
    await backup(db, target);
    console.log(target);
  } finally {
    db.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
