import sqlite3
from typing import Optional

def log_audit(conn: sqlite3.Connection, admin_name: str, action: str, employee_affected: Optional[str] = None, details: Optional[str] = None):
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO audit_logs (admin_name, action, employee_affected, details)
        VALUES (?, ?, ?, ?)
    """, (admin_name, action, employee_affected, details))

def send_notification(conn: sqlite3.Connection, user_id: int, title: str, message: str, notification_type: str = "GENERAL"):
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO notifications (user_id, title, message, notification_type)
        VALUES (?, ?, ?, ?)
    """, (user_id, title, message, notification_type))
