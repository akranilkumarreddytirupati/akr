import sqlite3
from app.database import DB_PATH

def migrate_advances():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(advances)")
    cols = [r[1] for r in cursor.fetchall()]
    print("Current advances columns:", cols)
    if "payment_type" not in cols:
        cursor.execute("ALTER TABLE advances ADD COLUMN payment_type TEXT DEFAULT 'Cash'")
        conn.commit()
        print("Successfully added payment_type column to advances.")
    else:
        print("payment_type already exists.")
    conn.close()

if __name__ == "__main__":
    migrate_advances()
