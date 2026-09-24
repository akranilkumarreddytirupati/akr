import sqlite3
import os
from app.database import DB_PATH, init_db

def reset_all_workers():
    if not os.path.exists(DB_PATH):
        init_db()
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Clear financial, attendance and operational records
    cursor.execute("DELETE FROM salary_payments")
    cursor.execute("DELETE FROM salary_records")
    cursor.execute("DELETE FROM advances")
    cursor.execute("DELETE FROM attendance")
    cursor.execute("DELETE FROM notifications")
    cursor.execute("DELETE FROM audit_logs")
    cursor.execute("DELETE FROM employees")
    
    # Delete all users except ADMIN
    cursor.execute("DELETE FROM users WHERE role != 'ADMIN'")
    
    # Add a clean initial audit log
    cursor.execute("""
        INSERT INTO audit_logs (admin_name, action, employee_affected, details)
        VALUES ('System Admin', 'Database Reset', 'All Workers', 'All worker and employee sample records cleared by owner request.')
    """)

    conn.commit()

    users_count = cursor.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    emp_count = cursor.execute("SELECT COUNT(*) FROM employees").fetchone()[0]
    admin = cursor.execute("SELECT employee_id, name, email FROM users WHERE role = 'ADMIN'").fetchone()

    conn.close()

    print(f"Database reset successful.")
    print(f"Remaining Users: {users_count} (Admin: {admin[1]} - {admin[2]})")
    print(f"Remaining Employees: {emp_count}")

if __name__ == "__main__":
    reset_all_workers()
