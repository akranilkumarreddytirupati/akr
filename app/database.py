import sqlite3
import os

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "courier_office.db"))

def get_db_connection() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT UNIQUE,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('ADMIN', 'WORKER')),
        account_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (account_status IN ('PENDING', 'ACTIVE', 'DEACTIVATED')),
        profile_image TEXT,
        joining_date TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Employees table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        employee_code TEXT NOT NULL UNIQUE,
        position TEXT NOT NULL,
        address TEXT,
        monthly_salary REAL NOT NULL DEFAULT 0.0,
        daily_salary REAL NOT NULL DEFAULT 0.0,
        salary_effective_date TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
        working_days_per_month INTEGER NOT NULL DEFAULT 26,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # Attendance table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        check_in_time TEXT,
        check_out_time TEXT,
        working_minutes INTEGER DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'Half Day', 'Leave')),
        leave_type TEXT CHECK (leave_type IN ('Paid', 'Unpaid')),
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        UNIQUE(employee_id, date)
    );
    """)

    # Salary Records table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS salary_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        fixed_salary REAL NOT NULL,
        present_days REAL NOT NULL DEFAULT 0,
        absent_days REAL NOT NULL DEFAULT 0,
        half_days REAL NOT NULL DEFAULT 0,
        leave_days REAL NOT NULL DEFAULT 0,
        working_days INTEGER NOT NULL DEFAULT 26,
        daily_salary REAL NOT NULL DEFAULT 0,
        absent_deduction REAL NOT NULL DEFAULT 0,
        half_day_deduction REAL NOT NULL DEFAULT 0,
        advance_deduction REAL NOT NULL DEFAULT 0,
        other_deduction REAL NOT NULL DEFAULT 0,
        bonus REAL NOT NULL DEFAULT 0,
        final_salary REAL NOT NULL DEFAULT 0,
        payment_status TEXT NOT NULL DEFAULT 'Pending' CHECK (payment_status IN ('Pending', 'Paid', 'Partially Paid')),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        UNIQUE(employee_id, month, year)
    );
    """)

    # Advances table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS advances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        reason TEXT,
        payment_type TEXT NOT NULL DEFAULT 'Cash',
        transaction_date TEXT NOT NULL,
        transaction_time TEXT NOT NULL,
        recorded_by TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Outstanding' CHECK (status IN ('Outstanding', 'Deducted', 'Partially Deducted')),
        deducted_amount REAL NOT NULL DEFAULT 0.0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );
    """)

    # Notifications table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        notification_type TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # Salary Payments table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS salary_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        salary_record_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        amount_paid REAL NOT NULL,
        payment_date TEXT NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'Bank Transfer',
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (salary_record_id) REFERENCES salary_records(id) ON DELETE CASCADE,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );
    """)

    # Audit Logs table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_name TEXT NOT NULL,
        action TEXT NOT NULL,
        employee_affected TEXT,
        details TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT
    );
    """)

    # Default settings
    default_settings = [
        ("working_days_per_month", "26", "Default working days in a month for salary calculation"),
        ("weekly_off_day", "Sunday", "Default weekly off day"),
        ("leave_deduction_rule", "Unpaid", "Default leave deduction rule (Paid or Unpaid)"),
        ("office_name", "AKR LOGISTICS", "Company or branch name")
    ]
    for key, val, desc in default_settings:
        cursor.execute("INSERT OR REPLACE INTO system_settings (key, value, description) VALUES (?, ?, ?)", (key, val, desc))

    # Ensure default Admin account exists
    cursor.execute("SELECT id FROM users WHERE role = 'ADMIN'")
    if not cursor.fetchone():
        import hashlib
        import binascii
        salt = hashlib.sha256(os.urandom(32)).hexdigest()[:16]
        key = hashlib.pbkdf2_hmac('sha256', "Admin@123".encode('utf-8'), salt.encode('utf-8'), 100000)
        admin_hash = f"{salt}${binascii.hexlify(key).decode('utf-8')}"

        cursor.execute("""
            INSERT INTO users (employee_id, name, email, phone, password_hash, role, account_status, profile_image, joining_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "ADM-0001",
            "Courier Hub Manager",
            "admin@courier.com",
            "+91 98765 43210",
            admin_hash,
            "ADMIN",
            "ACTIVE",
            "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
            "2024-01-01"
        ))

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")
