import os
import sqlite3
from datetime import datetime, date, timedelta
from typing import Optional, List
from fastapi import FastAPI, Depends, HTTPException, Query, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, EmailStr

from app.database import get_db_connection, init_db
from app.auth import hash_password, verify_password, create_access_token, get_current_user, require_admin, require_worker
from app.services import log_audit, send_notification

app = FastAPI(title="Courier Office Employee Management System API")

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    messages = []
    for err in errors:
        loc = err.get("loc", [])
        field = loc[-1] if loc else "field"
        msg = err.get("msg", "invalid")
        messages.append(f"{field}: {msg}")
    return JSONResponse(
        status_code=422,
        content={"detail": ", ".join(messages)}
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()

# ----------------- Pydantic Models -----------------

class LoginRequest(BaseModel):
    username_or_email: str
    password: str

class RegisterRequest(BaseModel):
    name: str
    email: str
    phone: str
    password: str
    position: str
    address: Optional[str] = None
    expected_salary: Optional[float] = 18000.0
    profile_image: Optional[str] = None

class EmployeeCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str
    position: str
    address: Optional[str] = None
    monthly_salary: float
    working_days_per_month: Optional[int] = 26
    joining_date: Optional[str] = None
    status: Optional[str] = "ACTIVE"
    account_status: Optional[str] = "ACTIVE"
    profile_image: Optional[str] = None

class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    position: Optional[str] = None
    address: Optional[str] = None
    monthly_salary: Optional[float] = None
    working_days_per_month: Optional[int] = None
    status: Optional[str] = None
    account_status: Optional[str] = None
    profile_image: Optional[str] = None

class ProfileUpdate(BaseModel):
    profile_image: str

class AttendanceMark(BaseModel):
    employee_id: int
    date: str
    status: str # Present, Absent, Half Day, Leave
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    leave_type: Optional[str] = None
    notes: Optional[str] = None

class AdvanceCreate(BaseModel):
    employee_id: int
    amount: float
    reason: str
    payment_type: Optional[str] = "Cash"
    transaction_date: Optional[str] = None
    transaction_time: Optional[str] = None

class SalaryCalculateRequest(BaseModel):
    month: int
    year: int
    employee_id: Optional[int] = None # None means all active employees

class SalaryPayRequest(BaseModel):
    salary_record_id: int
    amount_paid: float
    payment_method: str = "NEFT Bank Transfer"
    notes: Optional[str] = None

class SettingsUpdate(BaseModel):
    working_days_per_month: int
    weekly_off_day: str
    leave_deduction_rule: str
    office_name: str

# ----------------- Helper Utilities -----------------

def parse_time_diff_minutes(in_str: str, out_str: str) -> int:
    try:
        t_in = datetime.strptime(in_str.strip(), "%I:%M %p")
        t_out = datetime.strptime(out_str.strip(), "%I:%M %p")
        diff = t_out - t_in
        mins = int(diff.total_seconds() / 60)
        return max(0, mins)
    except Exception:
        return 0

def format_minutes_to_hours(minutes: int) -> str:
    h = minutes // 60
    m = minutes % 60
    return f"{h} Hours {m} Minutes" if h > 0 or m > 0 else "0 Hours"

def generate_next_employee_code(conn: sqlite3.Connection) -> str:
    cursor = conn.cursor()
    cursor.execute("SELECT employee_code FROM employees ORDER BY id DESC LIMIT 1")
    last = cursor.fetchone()
    if not last or not last["employee_code"]:
        return "EMP-0001"
    code = last["employee_code"]
    try:
        num = int(code.split("-")[1])
        return f"EMP-{num + 1:04d}"
    except Exception:
        return f"EMP-{int(datetime.utcnow().timestamp()) % 10000:04d}"

# ----------------- Auth Routes -----------------

@app.post("/api/auth/register")
def register_worker(req: RegisterRequest):
    conn = get_db_connection()
    cursor = conn.cursor()

    # Check email duplicate
    cursor.execute("SELECT id FROM users WHERE email = ?", (req.email,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    emp_code = generate_next_employee_code(conn)
    now_str = date.today().strftime("%Y-%m-%d")
    hashed = hash_password(req.password)

    cursor.execute("""
        INSERT INTO users (employee_id, name, email, phone, password_hash, role, account_status, profile_image, joining_date)
        VALUES (?, ?, ?, ?, ?, 'WORKER', 'PENDING', ?, ?)
    """, (emp_code, req.name, req.email, req.phone, hashed, req.profile_image, now_str))
    user_id = cursor.lastrowid

    sal = float(req.expected_salary or 18000.0)
    daily_sal = round(sal / 26, 2)
    cursor.execute("""
        INSERT INTO employees (user_id, employee_code, position, address, monthly_salary, daily_salary, salary_effective_date, status, working_days_per_month)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 26)
    """, (user_id, emp_code, req.position, req.address, sal, daily_sal, now_str))

    # Send welcome notification
    send_notification(conn, user_id, "Registration Submitted", 
                      "Your registration as a worker has been submitted. An administrator will review and activate your account shortly.", "ACCOUNT")

    # Send notification to Admin(s)
    cursor.execute("SELECT id FROM users WHERE role = 'ADMIN'")
    admins = cursor.fetchall()
    for adm in admins:
        send_notification(conn, adm["id"], "New Worker Registration", 
                          f"Worker {req.name} ({emp_code}) registered and is awaiting your approval.", "APPROVAL")

    conn.commit()
    conn.close()

    return {
        "message": "Registration successful! Your account is pending admin approval.",
        "employee_code": emp_code,
        "account_status": "PENDING"
    }

@app.post("/api/auth/login")
def login(req: LoginRequest):
    conn = get_db_connection()
    cursor = conn.cursor()

    # Allow login via email or employee_id/username
    cursor.execute("""
        SELECT u.*, e.id as emp_table_id, e.employee_code, e.position, e.monthly_salary, e.daily_salary
        FROM users u
        LEFT JOIN employees e ON u.id = e.user_id
        WHERE u.email = ? OR u.employee_id = ? OR (u.role = 'ADMIN' AND ? = 'admin')
    """, (req.username_or_email, req.username_or_email, req.username_or_email))
    user = cursor.fetchone()
    conn.close()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid username/email or password.")

    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username/email or password.")

    if user["role"] == "WORKER" and user["account_status"] != "ACTIVE":
        status_msg = "pending admin approval" if user["account_status"] == "PENDING" else "deactivated"
        raise HTTPException(
            status_code=403, 
            detail=f"Your account is currently {status_msg}. Please contact the courier office admin."
        )

    token = create_access_token({"sub": user["id"], "role": user["role"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "employee_id": user["employee_id"],
            "name": user["name"],
            "email": user["email"],
            "phone": user["phone"],
            "role": user["role"],
            "account_status": user["account_status"],
            "position": user["position"],
            "emp_table_id": user["emp_table_id"],
            "monthly_salary": user["monthly_salary"],
            "daily_salary": user["daily_salary"],
            "profile_image": user["profile_image"]
        }
    }

@app.post("/api/worker/profile-photo")
def update_profile_photo(payload: ProfileUpdate, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET profile_image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (payload.profile_image, current_user["id"]))
    conn.commit()
    conn.close()
    return {"message": "Profile photo updated successfully", "profile_image": payload.profile_image}

@app.get("/api/auth/me")
def get_me(user: dict = Depends(get_current_user)):
    return user

# ----------------- Admin Dashboard & Metrics -----------------

@app.get("/api/admin/dashboard-stats")
def get_admin_dashboard_stats(_admin: dict = Depends(require_admin)):
    conn = get_db_connection()
    cursor = conn.cursor()
    today_str = date.today().strftime("%Y-%m-%d")
    current_month_str = date.today().strftime("%Y-%m")

    # Total employees
    cursor.execute("SELECT COUNT(*) as total FROM employees")
    total_employees = cursor.fetchone()["total"]

    # Active employees
    cursor.execute("SELECT COUNT(*) as total FROM employees WHERE status = 'ACTIVE'")
    active_employees = cursor.fetchone()["total"]

    # Pending approvals
    cursor.execute("SELECT COUNT(*) as total FROM users WHERE role = 'WORKER' AND account_status = 'PENDING'")
    pending_approvals = cursor.fetchone()["total"]

    # Present today
    cursor.execute("""
        SELECT COUNT(*) as total FROM attendance 
        WHERE date = ? AND (status = 'Present' OR status = 'Half Day')
    """, (today_str,))
    present_today = cursor.fetchone()["total"]

    # Absent today
    cursor.execute("""
        SELECT COUNT(*) as total FROM attendance 
        WHERE date = ? AND status = 'Absent'
    """, (today_str,))
    absent_today = cursor.fetchone()["total"]

    # Currently Working (checked in today but not yet checked out)
    cursor.execute("""
        SELECT COUNT(*) as total FROM attendance
        WHERE date = ? AND check_in_time IS NOT NULL AND (check_out_time IS NULL OR check_out_time = '')
    """, (today_str,))
    currently_working = cursor.fetchone()["total"]

    # Total Outstanding Advance Amount
    cursor.execute("SELECT SUM(amount - deducted_amount) as total FROM advances WHERE status != 'Deducted'")
    adv_row = cursor.fetchone()
    total_advance_outstanding = float(adv_row["total"]) if adv_row and adv_row["total"] else 0.0

    # Total Monthly Salary Payable (Base sum of active employee monthly salaries)
    cursor.execute("SELECT SUM(monthly_salary) as total FROM employees WHERE status = 'ACTIVE'")
    sal_row = cursor.fetchone()
    total_monthly_salary = float(sal_row["total"]) if sal_row and sal_row["total"] else 0.0

    # Recent Activity
    cursor.execute("""
        SELECT a.id, a.check_in_time, a.check_out_time, a.date, a.status, u.name as employee_name, e.employee_code,
               CASE WHEN a.check_out_time IS NOT NULL AND a.check_out_time != '' THEN 'CHECK_OUT' ELSE 'CHECK_IN' END as event_type,
               COALESCE(a.updated_at, a.created_at) as timestamp
        FROM attendance a
        JOIN employees e ON a.employee_id = e.id
        JOIN users u ON e.user_id = u.id
        WHERE a.date = ?
        ORDER BY a.id DESC LIMIT 5
    """, (today_str,))
    recent_checkins = [dict(r) for r in cursor.fetchall()]

    # Recent advances
    cursor.execute("""
        SELECT adv.*, u.name as employee_name, e.employee_code
        FROM advances adv
        JOIN employees e ON adv.employee_id = e.id
        JOIN users u ON e.user_id = u.id
        ORDER BY adv.id DESC LIMIT 5
    """)
    recent_advances = [dict(r) for r in cursor.fetchall()]

    # Recently approved/registered employees
    cursor.execute("""
        SELECT u.id, u.name, u.email, u.account_status, u.created_at, e.employee_code, e.position
        FROM users u
        LEFT JOIN employees e ON u.id = e.user_id
        WHERE u.role = 'WORKER'
        ORDER BY u.id DESC LIMIT 5
    """)
    recent_employees = [dict(r) for r in cursor.fetchall()]

    # Charts data:
    # 1. Present vs Absent (Current Month)
    cursor.execute("""
        SELECT status, COUNT(*) as count 
        FROM attendance 
        WHERE date LIKE ?
        GROUP BY status
    """, (f"{current_month_str}%",))
    status_counts = {r["status"]: r["count"] for r in cursor.fetchall()}

    # 2. Advance amounts by employee (top 5 outstanding)
    cursor.execute("""
        SELECT u.name, SUM(adv.amount - adv.deducted_amount) as outstanding
        FROM advances adv
        JOIN employees e ON adv.employee_id = e.id
        JOIN users u ON e.user_id = u.id
        WHERE adv.status != 'Deducted'
        GROUP BY adv.employee_id
        ORDER BY outstanding DESC LIMIT 6
    """)
    advance_chart = [dict(r) for r in cursor.fetchall()]

    # 3. Monthly salary payroll comparison (last 4 months)
    cursor.execute("""
        SELECT month, year, SUM(final_salary) as total_payout, SUM(fixed_salary) as total_fixed
        FROM salary_records
        GROUP BY year, month
        ORDER BY year DESC, month DESC LIMIT 4
    """)
    salary_chart = [dict(r) for r in cursor.fetchall()]

    conn.close()

    return {
        "summary": {
            "total_employees": total_employees,
            "active_employees": active_employees,
            "pending_approvals": pending_approvals,
            "present_today": present_today,
            "absent_today": absent_today,
            "currently_working": currently_working,
            "total_advance_outstanding": total_advance_outstanding,
            "total_monthly_salary": total_monthly_salary
        },
        "recent_activity": {
            "checkins": recent_checkins,
            "advances": recent_advances,
            "employees": recent_employees
        },
        "charts": {
            "attendance_breakdown": status_counts,
            "advance_by_employee": advance_chart,
            "salary_history": salary_chart
        }
    }

# ----------------- Employee Management -----------------

@app.get("/api/admin/employees")
def get_employees(
    search: Optional[str] = None,
    status: Optional[str] = None,
    account_status: Optional[str] = None,
    _admin: dict = Depends(require_admin)
):
    conn = get_db_connection()
    cursor = conn.cursor()

    query = """
        SELECT e.*, u.name, u.email, u.phone, u.role, u.account_status, u.profile_image, u.joining_date,
               (SELECT SUM(amount - deducted_amount) FROM advances WHERE employee_id = e.id AND status != 'Deducted') as total_advance_outstanding
        FROM employees e
        JOIN users u ON e.user_id = u.id
        WHERE 1=1
    """
    params = []
    if search:
        query += " AND (u.name LIKE ? OR e.employee_code LIKE ? OR u.phone LIKE ? OR e.position LIKE ?)"
        term = f"%{search}%"
        params.extend([term, term, term, term])
    if status:
        query += " AND e.status = ?"
        params.append(status)
    if account_status:
        query += " AND u.account_status = ?"
        params.append(account_status)

    query += " ORDER BY e.id ASC"
    cursor.execute(query, params)
    employees = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return employees

@app.get("/api/admin/employees/{emp_id}")
def get_employee_profile(emp_id: int, _admin: dict = Depends(require_admin)):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT e.*, u.name, u.email, u.phone, u.role, u.account_status, u.profile_image, u.joining_date
        FROM employees e
        JOIN users u ON e.user_id = u.id
        WHERE e.id = ?
    """, (emp_id,))
    emp = cursor.fetchone()
    if not emp:
        conn.close()
        raise HTTPException(status_code=404, detail="Employee not found")

    emp_dict = dict(emp)

    # Calculate Attendance stats (All-time and current month)
    curr_month = date.today().strftime("%Y-%m")
    cursor.execute("SELECT status, COUNT(*) as cnt FROM attendance WHERE employee_id = ? GROUP BY status", (emp_id,))
    all_time_att = {r["status"]: r["cnt"] for r in cursor.fetchall()}

    cursor.execute("SELECT status, COUNT(*) as cnt FROM attendance WHERE employee_id = ? AND date LIKE ? GROUP BY status", (emp_id, f"{curr_month}%"))
    curr_month_att = {r["status"]: r["cnt"] for r in cursor.fetchall()}

    # Advances
    cursor.execute("SELECT * FROM advances WHERE employee_id = ? ORDER BY id DESC", (emp_id,))
    advances = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT SUM(amount) as total, SUM(amount - deducted_amount) as outstanding FROM advances WHERE employee_id = ?", (emp_id,))
    adv_totals = cursor.fetchone()
    emp_dict["total_advance_taken"] = float(adv_totals["total"]) if adv_totals and adv_totals["total"] else 0.0
    emp_dict["outstanding_advance"] = float(adv_totals["outstanding"]) if adv_totals and adv_totals["outstanding"] else 0.0

    # Salary history
    cursor.execute("SELECT * FROM salary_records WHERE employee_id = ? ORDER BY year DESC, month DESC", (emp_id,))
    salaries = [dict(r) for r in cursor.fetchall()]

    conn.close()

    emp_dict["attendance_stats"] = {
        "all_time": all_time_att,
        "current_month": curr_month_att
    }
    emp_dict["advances"] = advances
    emp_dict["salary_records"] = salaries
    return emp_dict

@app.post("/api/admin/employees")
def add_employee(req: EmployeeCreate, admin: dict = Depends(require_admin)):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM users WHERE email = ?", (req.email,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Email already registered.")

    emp_code = generate_next_employee_code(conn)
    now_str = req.joining_date or date.today().strftime("%Y-%m-%d")
    hashed = hash_password(req.password)

    cursor.execute("""
        INSERT INTO users (employee_id, name, email, phone, password_hash, role, account_status, profile_image, joining_date)
        VALUES (?, ?, ?, ?, ?, 'WORKER', ?, ?, ?)
    """, (emp_code, req.name, req.email, req.phone, hashed, req.account_status or "ACTIVE", req.profile_image, now_str))
    user_id = cursor.lastrowid

    working_days = req.working_days_per_month or 26
    daily_sal = round(req.monthly_salary / working_days, 2)
    cursor.execute("""
        INSERT INTO employees (user_id, employee_code, position, address, monthly_salary, daily_salary, salary_effective_date, status, working_days_per_month)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, emp_code, req.position, req.address, req.monthly_salary, daily_sal, now_str, req.status or "ACTIVE", working_days))
    emp_id = cursor.lastrowid

    log_audit(conn, admin["name"], "Added new employee", f"{req.name} ({emp_code})", f"Position: {req.position}, Salary: ₹{req.monthly_salary:,.2f}")
    send_notification(conn, user_id, "Welcome to Courier Hub!", f"Your employee account ({emp_code}) has been created by the administration.", "ACCOUNT")

    conn.commit()
    conn.close()
    return {"message": "Employee added successfully", "employee_id": emp_id, "employee_code": emp_code}

@app.put("/api/admin/employees/{emp_id}")
def update_employee(emp_id: int, req: EmployeeUpdate, admin: dict = Depends(require_admin)):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT e.*, u.name, u.id as user_id FROM employees e JOIN users u ON e.user_id = u.id WHERE e.id = ?", (emp_id,))
    emp = cursor.fetchone()
    if not emp:
        conn.close()
        raise HTTPException(status_code=404, detail="Employee not found")

    user_id = emp["user_id"]

    # Update users table
    if req.name or req.phone or req.account_status or req.email or req.profile_image is not None:
        cursor.execute("""
            UPDATE users SET
                name = COALESCE(?, name),
                email = COALESCE(?, email),
                phone = COALESCE(?, phone),
                account_status = COALESCE(?, account_status),
                profile_image = COALESCE(?, profile_image),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (req.name, req.email, req.phone, req.account_status, req.profile_image, user_id))

    # Update employees table
    monthly = req.monthly_salary if req.monthly_salary is not None else emp["monthly_salary"]
    w_days = req.working_days_per_month if req.working_days_per_month is not None else emp["working_days_per_month"]
    daily_sal = round(monthly / w_days, 2)

    cursor.execute("""
        UPDATE employees SET
            position = COALESCE(?, position),
            address = COALESCE(?, address),
            monthly_salary = ?,
            daily_salary = ?,
            working_days_per_month = ?,
            status = COALESCE(?, status)
        WHERE id = ?
    """, (req.position, req.address, monthly, daily_sal, w_days, req.status, emp_id))

    log_audit(conn, admin["name"], "Updated employee record", f"{emp['name']} ({emp['employee_code']})", f"Updated details.")
    if req.monthly_salary is not None and req.monthly_salary != emp["monthly_salary"]:
        send_notification(conn, user_id, "Salary Updated", f"Your monthly salary has been updated to ₹{req.monthly_salary:,.2f}.", "SALARY")

    conn.commit()
    conn.close()
    return {"message": "Employee updated successfully"}

@app.post("/api/admin/employees/{emp_id}/status")
def change_employee_status(emp_id: int, payload: dict, admin: dict = Depends(require_admin)):
    action = payload.get("action") # "APPROVE", "ACTIVATE", "DEACTIVATE"
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT e.*, u.name, u.id as user_id FROM employees e JOIN users u ON e.user_id = u.id WHERE e.id = ?", (emp_id,))
    emp = cursor.fetchone()
    if not emp:
        conn.close()
        raise HTTPException(status_code=404, detail="Employee not found")

    user_id = emp["user_id"]
    if action == "APPROVE" or action == "ACTIVATE":
        cursor.execute("UPDATE users SET account_status = 'ACTIVE' WHERE id = ?", (user_id,))
        cursor.execute("UPDATE employees SET status = 'ACTIVE' WHERE id = ?", (emp_id,))
        log_audit(conn, admin["name"], "Approved/Activated employee", f"{emp['name']} ({emp['employee_code']})")
        send_notification(conn, user_id, "Account Approved & Active", "Your courier employee account has been approved by admin and is now active!", "ACCOUNT")
    elif action == "DEACTIVATE":
        cursor.execute("UPDATE users SET account_status = 'DEACTIVATED' WHERE id = ?", (user_id,))
        cursor.execute("UPDATE employees SET status = 'INACTIVE' WHERE id = ?", (emp_id,))
        log_audit(conn, admin["name"], "Deactivated employee", f"{emp['name']} ({emp['employee_code']})")
        send_notification(conn, user_id, "Account Deactivated", "Your courier employee account has been deactivated. Contact admin for assistance.", "ACCOUNT")
    elif action == "REJECT":
        cursor.execute("UPDATE users SET account_status = 'DEACTIVATED' WHERE id = ?", (user_id,))
        cursor.execute("UPDATE employees SET status = 'INACTIVE' WHERE id = ?", (emp_id,))
        log_audit(conn, admin["name"], "Rejected employee application", f"{emp['name']} ({emp['employee_code']})")
        send_notification(conn, user_id, "Application Rejected", "Your worker registration application was reviewed and rejected by the administrator.", "ACCOUNT")
    else:
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid action")

    conn.commit()
    conn.close()
    return {"message": f"Employee status updated to {action}"}

@app.delete("/api/admin/employees/{emp_id}")
def delete_employee(emp_id: int, admin: dict = Depends(require_admin)):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT e.*, u.name, u.id as user_id FROM employees e JOIN users u ON e.user_id = u.id WHERE e.id = ?", (emp_id,))
    emp = cursor.fetchone()
    if not emp:
        conn.close()
        raise HTTPException(status_code=404, detail="Employee not found")

    user_id = emp["user_id"]
    emp_name = emp["name"]
    emp_code = emp["employee_code"]

    # Delete related attendance, advances, salary_records (cascades or delete explicitly)
    cursor.execute("DELETE FROM attendance WHERE employee_id = ?", (emp_id,))
    cursor.execute("DELETE FROM advances WHERE employee_id = ?", (emp_id,))
    cursor.execute("DELETE FROM salary_payments WHERE employee_id = ?", (emp_id,))
    cursor.execute("DELETE FROM salary_records WHERE employee_id = ?", (emp_id,))
    cursor.execute("DELETE FROM notifications WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM employees WHERE id = ?", (emp_id,))
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))

    log_audit(conn, admin["name"], "Removed/Deleted employee", f"{emp_name} ({emp_code})", "Employee and all related records removed from system.")

    conn.commit()
    conn.close()
    return {"message": f"Employee {emp_name} ({emp_code}) removed successfully"}

# ----------------- Attendance Management -----------------

@app.get("/api/attendance")
def get_attendance(
    employee_id: Optional[int] = None,
    date_val: Optional[str] = None,
    month: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    conn = get_db_connection()
    cursor = conn.cursor()

    # If worker, enforce filtering to only their own employee_id
    if current_user["role"] == "WORKER":
        employee_id = current_user["emp_table_id"]

    query = """
        SELECT a.*, e.employee_code, u.name as employee_name, e.position
        FROM attendance a
        JOIN employees e ON a.employee_id = e.id
        JOIN users u ON e.user_id = u.id
        WHERE 1=1
    """
    params = []
    if employee_id:
        query += " AND a.employee_id = ?"
        params.append(employee_id)
    if date_val:
        query += " AND a.date = ?"
        params.append(date_val)
    if month:
        query += " AND a.date LIKE ?"
        params.append(f"{month}%")

    query += " ORDER BY a.date DESC, a.id DESC"
    cursor.execute(query, params)
    records = []
    for r in cursor.fetchall():
        d = dict(r)
        d["working_hours_formatted"] = format_minutes_to_hours(d["working_minutes"])
        records.append(d)
    conn.close()
    return records

@app.post("/api/worker/check-in")
def worker_check_in(current_user: dict = Depends(require_worker)):
    emp_id = current_user["emp_table_id"]
    if not emp_id:
        raise HTTPException(status_code=400, detail="Employee record not linked.")

    today_str = date.today().strftime("%Y-%m-%d")
    now_time = datetime.now().strftime("%I:%M %p")

    conn = get_db_connection()
    cursor = conn.cursor()

    # Prevent duplicate check in
    cursor.execute("SELECT * FROM attendance WHERE employee_id = ? AND date = ?", (emp_id, today_str))
    existing = cursor.fetchone()
    if existing:
        conn.close()
        raise HTTPException(status_code=400, detail=f"You have already checked in today at {existing['check_in_time']}.")

    cursor.execute("""
        INSERT INTO attendance (employee_id, date, check_in_time, status, working_minutes)
        VALUES (?, ?, ?, 'Present', 0)
    """, (emp_id, today_str, now_time))

    send_notification(conn, current_user["id"], "Check-In Recorded", f"Check-in successfully recorded at {now_time} on {today_str}.", "ATTENDANCE")

    conn.commit()
    conn.close()
    return {"message": "Check-in successful!", "time": now_time, "date": today_str}

@app.post("/api/worker/check-out")
def worker_check_out(current_user: dict = Depends(require_worker)):
    emp_id = current_user["emp_table_id"]
    today_str = date.today().strftime("%Y-%m-%d")
    now_time = datetime.now().strftime("%I:%M %p")

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM attendance WHERE employee_id = ? AND date = ?", (emp_id, today_str))
    record = cursor.fetchone()
    if not record:
        conn.close()
        raise HTTPException(status_code=400, detail="Cannot check out without checking in first.")

    if record["check_out_time"]:
        conn.close()
        raise HTTPException(status_code=400, detail=f"You have already checked out today at {record['check_out_time']}.")

    # Calculate total working hours
    mins = parse_time_diff_minutes(record["check_in_time"], now_time)

    cursor.execute("""
        UPDATE attendance 
        SET check_out_time = ?, working_minutes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (now_time, mins, record["id"]))

    send_notification(conn, current_user["id"], "Check-Out Recorded", 
                      f"Check-out recorded at {now_time}. Total shift: {format_minutes_to_hours(mins)}.", "ATTENDANCE")

    conn.commit()
    conn.close()
    return {
        "message": "Check-out successful!", 
        "check_in": record["check_in_time"], 
        "check_out": now_time, 
        "working_hours": format_minutes_to_hours(mins)
    }

@app.get("/api/worker/today-status")
def get_worker_today_status(current_user: dict = Depends(require_worker)):
    emp_id = current_user["emp_table_id"]
    today_str = date.today().strftime("%Y-%m-%d")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM attendance WHERE employee_id = ? AND date = ?", (emp_id, today_str))
    record = cursor.fetchone()
    conn.close()

    if not record:
        return {
            "checked_in": False,
            "checked_out": False,
            "status": "Not Marked",
            "check_in_time": None,
            "check_out_time": None,
            "working_hours": "0 Hours"
        }
    
    rec_dict = dict(record)
    return {
        "checked_in": True,
        "checked_out": bool(rec_dict["check_out_time"]),
        "status": rec_dict["status"],
        "check_in_time": rec_dict["check_in_time"],
        "check_out_time": rec_dict["check_out_time"],
        "working_hours": format_minutes_to_hours(rec_dict["working_minutes"])
    }

@app.post("/api/admin/attendance")
def admin_mark_attendance(req: AttendanceMark, admin: dict = Depends(require_admin)):
    conn = get_db_connection()
    cursor = conn.cursor()

    mins = 0
    if req.check_in_time and req.check_out_time:
        mins = parse_time_diff_minutes(req.check_in_time, req.check_out_time)

    # Check if attendance already exists for date
    cursor.execute("SELECT * FROM attendance WHERE employee_id = ? AND date = ?", (req.employee_id, req.date))
    existing = cursor.fetchone()

    cursor.execute("SELECT u.name, u.id as user_id, e.employee_code FROM employees e JOIN users u ON e.user_id = u.id WHERE e.id = ?", (req.employee_id,))
    emp_info = cursor.fetchone()

    if existing:
        cursor.execute("""
            UPDATE attendance SET
                status = ?,
                check_in_time = ?,
                check_out_time = ?,
                working_minutes = ?,
                leave_type = ?,
                notes = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (req.status, req.check_in_time, req.check_out_time, mins, req.leave_type, req.notes, existing["id"]))
        log_audit(conn, admin["name"], "Admin updated attendance", f"{emp_info['name']} ({emp_info['employee_code']})", f"Date: {req.date}, Status: {req.status}")
        send_notification(conn, emp_info["user_id"], "Attendance Correction", f"Your attendance for {req.date} was updated to {req.status} by administration.", "ATTENDANCE")
    else:
        cursor.execute("""
            INSERT INTO attendance (employee_id, date, status, check_in_time, check_out_time, working_minutes, leave_type, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (req.employee_id, req.date, req.status, req.check_in_time, req.check_out_time, mins, req.leave_type, req.notes))
        log_audit(conn, admin["name"], "Admin marked attendance", f"{emp_info['name']} ({emp_info['employee_code']})", f"Date: {req.date}, Status: {req.status}")

    conn.commit()
    conn.close()
    return {"message": "Attendance saved successfully"}

# ----------------- Advance / Money Taken Management -----------------

@app.get("/api/advances")
def get_advances(employee_id: Optional[int] = None, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()

    if current_user["role"] == "WORKER":
        employee_id = current_user["emp_table_id"]

    query = """
        SELECT adv.*, e.employee_code, u.name as employee_name, e.position
        FROM advances adv
        JOIN employees e ON adv.employee_id = e.id
        JOIN users u ON e.user_id = u.id
        WHERE 1=1
    """
    params = []
    if employee_id:
        query += " AND adv.employee_id = ?"
        params.append(employee_id)

    query += " ORDER BY adv.transaction_date DESC, adv.id DESC"
    cursor.execute(query, params)
    records = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return records

@app.post("/api/admin/advances")
def create_advance(req: AdvanceCreate, admin: dict = Depends(require_admin)):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT e.*, u.name, u.id as user_id 
        FROM employees e 
        JOIN users u ON e.user_id = u.id 
        WHERE e.id = ?
    """, (req.employee_id,))
    emp = cursor.fetchone()
    if not emp:
        conn.close()
        raise HTTPException(status_code=404, detail="Employee not found")

    t_date = req.transaction_date or date.today().strftime("%Y-%m-%d")
    t_time = req.transaction_time or datetime.now().strftime("%I:%M %p")

    cursor.execute("""
        INSERT INTO advances (employee_id, amount, reason, payment_type, transaction_date, transaction_time, recorded_by, status, deducted_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Outstanding', 0.0)
    """, (req.employee_id, req.amount, req.reason, req.payment_type or "Cash", t_date, t_time, admin["name"]))
    adv_id = cursor.lastrowid

    # Automatic Notification:
    try:
        dt_obj = datetime.strptime(t_date, "%Y-%m-%d")
        nice_date = dt_obj.strftime("%d %B %Y")
    except Exception:
        nice_date = t_date

    payment_mode_text = f" via {req.payment_type}" if req.payment_type else ""
    notif_msg = f"₹{req.amount:,.2f} has been recorded as an employee advance{payment_mode_text} on {nice_date} at {t_time}. Reason: {req.reason}"
    send_notification(conn, emp["user_id"], "Advance Recorded", notif_msg, "ADVANCE")

    # Audit log
    log_audit(conn, admin["name"], "Added employee advance", f"{emp['name']} ({emp['employee_code']})", f"Amount: ₹{req.amount:,.2f} ({req.payment_type or 'Cash'}), Reason: {req.reason}")

    conn.commit()
    conn.close()
    return {"message": "Advance recorded successfully", "advance_id": adv_id}

# ----------------- Salary Management & Calculations -----------------

@app.get("/api/salary/records")
def get_salary_records(
    month: Optional[int] = None,
    year: Optional[int] = None,
    employee_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    conn = get_db_connection()
    cursor = conn.cursor()

    if current_user["role"] == "WORKER":
        employee_id = current_user["emp_table_id"]

    query = """
        SELECT sr.*, e.employee_code, u.name as employee_name, e.position, u.phone
        FROM salary_records sr
        JOIN employees e ON sr.employee_id = e.id
        JOIN users u ON e.user_id = u.id
        WHERE 1=1
    """
    params = []
    if month:
        query += " AND sr.month = ?"
        params.append(month)
    if year:
        query += " AND sr.year = ?"
        params.append(year)
    if employee_id:
        query += " AND sr.employee_id = ?"
        params.append(employee_id)

    query += " ORDER BY sr.year DESC, sr.month DESC, sr.id DESC"
    cursor.execute(query, params)
    records = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return records

@app.post("/api/admin/salary/calculate")
def calculate_monthly_salary(req: SalaryCalculateRequest, admin: dict = Depends(require_admin)):
    conn = get_db_connection()
    cursor = conn.cursor()

    # Get target employees
    if req.employee_id:
        cursor.execute("SELECT * FROM employees WHERE id = ? AND status = 'ACTIVE'", (req.employee_id,))
    else:
        cursor.execute("SELECT * FROM employees WHERE status = 'ACTIVE'")
    employees = cursor.fetchall()

    month_prefix = f"{req.year:04d}-{req.month:02d}-%"
    processed_count = 0

    for emp in employees:
        e_id = emp["id"]
        u_id = emp["user_id"]
        fixed_salary = float(emp["monthly_salary"])
        working_days = emp["working_days_per_month"] or 26
        daily_salary = round(fixed_salary / working_days, 2)

        # Count attendance in that month
        cursor.execute("SELECT status FROM attendance WHERE employee_id = ? AND date LIKE ?", (e_id, month_prefix))
        att_rows = cursor.fetchall()

        present_days = sum(1 for r in att_rows if r["status"] == "Present")
        absent_days = sum(1 for r in att_rows if r["status"] == "Absent")
        half_days = sum(1 for r in att_rows if r["status"] == "Half Day")
        leave_days = sum(1 for r in att_rows if r["status"] == "Leave")

        # Deductions
        absent_deduction = round(absent_days * daily_salary, 2)
        half_day_deduction = round(half_days * (daily_salary * 0.5), 2)

        # Outstanding advances for this employee
        cursor.execute("""
            SELECT SUM(amount - deducted_amount) as outstanding 
            FROM advances 
            WHERE employee_id = ? AND status != 'Deducted'
        """, (e_id,))
        adv_res = cursor.fetchone()
        available_advance = float(adv_res["outstanding"]) if adv_res and adv_res["outstanding"] else 0.0

        # Calculate preliminary net salary before advance deduction
        preliminary_net = fixed_salary - absent_deduction - half_day_deduction
        advance_deduction = min(available_advance, max(0.0, preliminary_net))

        final_salary = round(preliminary_net - advance_deduction, 2)

        # Upsert into salary_records
        cursor.execute("""
            INSERT INTO salary_records (
                employee_id, month, year, fixed_salary, present_days, absent_days, half_days, leave_days,
                working_days, daily_salary, absent_deduction, half_day_deduction, advance_deduction, other_deduction,
                bonus, final_salary, payment_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'Pending', CURRENT_TIMESTAMP)
            ON CONFLICT(employee_id, month, year) DO UPDATE SET
                fixed_salary = excluded.fixed_salary,
                present_days = excluded.present_days,
                absent_days = excluded.absent_days,
                half_days = excluded.half_days,
                leave_days = excluded.leave_days,
                working_days = excluded.working_days,
                daily_salary = excluded.daily_salary,
                absent_deduction = excluded.absent_deduction,
                half_day_deduction = excluded.half_day_deduction,
                advance_deduction = excluded.advance_deduction,
                final_salary = excluded.final_salary
        """, (
            e_id, req.month, req.year, fixed_salary, present_days, absent_days, half_days, leave_days,
            working_days, daily_salary, absent_deduction, half_day_deduction, advance_deduction, final_salary
        ))
        processed_count += 1

        # Send notification to employee
        month_name = datetime(req.year, req.month, 1).strftime("%B %Y")
        send_notification(conn, u_id, "Salary Calculated", 
                          f"Your salary calculation for {month_name} is ready. Net payable: ₹{final_salary:,.2f}.", "SALARY")

    log_audit(conn, admin["name"], f"Calculated {req.month}/{req.year} Payroll", f"{processed_count} Employees", 
              f"Generated automatic absent/advance deductions")

    conn.commit()
    conn.close()
    return {"message": f"Successfully calculated salary for {processed_count} employees."}

@app.post("/api/admin/salary/pay")
def pay_salary(req: SalaryPayRequest, admin: dict = Depends(require_admin)):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT sr.*, e.user_id, e.employee_code, u.name 
        FROM salary_records sr
        JOIN employees e ON sr.employee_id = e.id
        JOIN users u ON e.user_id = u.id
        WHERE sr.id = ?
    """, (req.salary_record_id,))
    record = cursor.fetchone()
    if not record:
        conn.close()
        raise HTTPException(status_code=404, detail="Salary record not found")

    today_str = date.today().strftime("%Y-%m-%d")

    # Record payment
    cursor.execute("""
        INSERT INTO salary_payments (salary_record_id, employee_id, amount_paid, payment_date, payment_method, notes)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (record["id"], record["employee_id"], req.amount_paid, today_str, req.payment_method, req.notes))

    # Update payment status
    cursor.execute("UPDATE salary_records SET payment_status = 'Paid' WHERE id = ?", (record["id"],))

    # Mark advances as deducted if advance_deduction was included
    if record["advance_deduction"] > 0:
        cursor.execute("""
            UPDATE advances 
            SET status = 'Deducted', deducted_amount = amount 
            WHERE employee_id = ? AND status != 'Deducted'
        """, (record["employee_id"],))

    month_name = datetime(record["year"], record["month"], 1).strftime("%B %Y")
    send_notification(conn, record["user_id"], "Salary Payment Received", 
                      f"Your {month_name} salary payment of ₹{req.amount_paid:,.2f} has been processed via {req.payment_method}.", "SALARY")

    log_audit(conn, admin["name"], "Marked salary as paid", f"{record['name']} ({record['employee_code']})", 
              f"Amount: ₹{req.amount_paid:,.2f}, Period: {month_name}")

    conn.commit()
    conn.close()
    return {"message": "Salary payment recorded successfully."}

@app.get("/api/salary/day-wise")
def get_day_wise_salary(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020, le=2035),
    employee_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Returns day-by-day earned salary, attendance status, shifts, advance taken,
    and cumulative month earnings for an employee.
    """
    if current_user["role"] == "WORKER":
        employee_id = current_user["emp_table_id"]

    if not employee_id:
        raise HTTPException(status_code=400, detail="Employee ID is required")

    conn = get_db_connection()
    cursor = conn.cursor()

    # Fetch employee profile
    cursor.execute("""
        SELECT e.*, u.name as employee_name, u.email, u.phone
        FROM employees e
        JOIN users u ON e.user_id = u.id
        WHERE e.id = ?
    """, (employee_id,))
    emp = cursor.fetchone()
    if not emp:
        conn.close()
        raise HTTPException(status_code=404, detail="Employee not found")

    fixed_salary = float(emp["monthly_salary"])
    working_days = int(emp["working_days_per_month"] or 26)
    daily_rate = round(fixed_salary / working_days, 2)

    # Get number of days in this month
    import calendar
    _, total_days = calendar.monthrange(year, month)

    month_prefix = f"{year:04d}-{month:02d}-"
    
    # Fetch attendance for this month
    cursor.execute("""
        SELECT * FROM attendance
        WHERE employee_id = ? AND date LIKE ?
        ORDER BY date ASC
    """, (employee_id, f"{month_prefix}%"))
    att_by_date = {r["date"]: dict(r) for r in cursor.fetchall()}

    # Fetch advances on dates
    cursor.execute("""
        SELECT * FROM advances
        WHERE employee_id = ? AND transaction_date LIKE ?
        ORDER BY transaction_date ASC, id ASC
    """, (employee_id, f"{month_prefix}%"))
    adv_rows = cursor.fetchall()
    adv_by_date = {}
    for a in adv_rows:
        d = a["transaction_date"]
        if d not in adv_by_date:
            adv_by_date[d] = []
        adv_by_date[d].append(dict(a))

    # Fetch system settings for weekly off
    cursor.execute("SELECT value FROM system_settings WHERE key = 'weekly_off_day'")
    off_row = cursor.fetchone()
    weekly_off = (off_row["value"] if off_row else "Sunday").lower()

    # Build day-by-day calendar breakdown
    day_records = []
    total_earned = 0.0
    total_deductions = 0.0
    total_advances = 0.0
    present_count = 0
    absent_count = 0
    half_day_count = 0
    leave_count = 0
    weekly_off_count = 0

    from datetime import date as dt_date
    for day_num in range(1, total_days + 1):
        cur_d = dt_date(year, month, day_num)
        d_str = cur_d.strftime("%Y-%m-%d")
        weekday_name = cur_d.strftime("%A")
        is_off = weekday_name.lower() == weekly_off

        att = att_by_date.get(d_str)
        advances_today = adv_by_date.get(d_str, [])
        advance_amount_today = sum(a["amount"] for a in advances_today)
        total_advances += advance_amount_today

        if att:
            st = att["status"]
            cin = att.get("check_in_time") or "-"
            cout = att.get("check_out_time") or "-"
            mins = att.get("working_minutes") or 0
            if mins > 0:
                hrs_str = f"{mins // 60}h {mins % 60}m"
            else:
                hrs_str = "-"

            if st == "Present":
                present_count += 1
                earned = daily_rate
                deduction = 0.0
            elif st == "Half Day":
                half_day_count += 1
                earned = round(daily_rate * 0.5, 2)
                deduction = round(daily_rate * 0.5, 2)
            elif st == "Absent":
                absent_count += 1
                earned = 0.0
                deduction = daily_rate
            elif st == "Leave":
                leave_count += 1
                earned = 0.0
                deduction = daily_rate
            else:
                earned = 0.0
                deduction = 0.0
        else:
            cin = "-"
            cout = "-"
            hrs_str = "-"
            if is_off:
                weekly_off_count += 1
                st = "Weekly Off"
                earned = 0.0
                deduction = 0.0
            else:
                st = "Not Logged"
                earned = 0.0
                deduction = 0.0

        total_earned += earned
        total_deductions += deduction

        day_records.append({
            "day": day_num,
            "date": d_str,
            "day_name": weekday_name,
            "status": st,
            "check_in": cin,
            "check_out": cout,
            "hours": hrs_str,
            "daily_rate": daily_rate,
            "earned_today": earned,
            "deduction_today": deduction,
            "advance_today": advance_amount_today,
            "advances": advances_today
        })

    # Net payable so far:
    net_payable = round(total_earned - total_advances, 2)

    conn.close()

    return {
        "employee": {
            "id": emp["id"],
            "code": emp["employee_code"],
            "name": emp["employee_name"],
            "position": emp["position"],
            "monthly_salary": fixed_salary,
            "working_days": working_days,
            "daily_salary_rate": daily_rate
        },
        "period": {
            "month": month,
            "year": year,
            "total_calendar_days": total_days,
            "month_name": datetime(year, month, 1).strftime("%B %Y")
        },
        "summary": {
            "present_days": present_count,
            "absent_days": absent_count,
            "half_days": half_day_count,
            "leave_days": leave_count,
            "weekly_offs": weekly_off_count,
            "total_earned": round(total_earned, 2),
            "total_deductions": round(total_deductions, 2),
            "total_advances": round(total_advances, 2),
            "net_payable": net_payable
        },
        "day_wise_records": day_records
    }

# ----------------- Notifications -----------------

@app.get("/api/notifications")
def get_user_notifications(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM notifications 
        WHERE user_id = ? 
        ORDER BY id DESC LIMIT 50
    """, (current_user["id"],))
    records = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND is_read = 0", (current_user["id"],))
    unread = cursor.fetchone()["unread"]

    conn.close()
    return {"notifications": records, "unread_count": unread}

@app.post("/api/notifications/{notif_id}/read")
def mark_notification_read(notif_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?", (notif_id, current_user["id"]))
    conn.commit()
    conn.close()
    return {"message": "Notification marked as read"}

@app.post("/api/notifications/mark-all-read")
def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", (current_user["id"],))
    conn.commit()
    conn.close()
    return {"message": "All notifications marked as read"}

# ----------------- Reports & Audit Logs -----------------

@app.get("/api/admin/reports")
def get_reports(
    report_type: str, # daily_attendance, monthly_attendance, employee_attendance, monthly_salary, employee_salary, advances, outstanding_advances
    date_val: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    employee_id: Optional[int] = None,
    _admin: dict = Depends(require_admin)
):
    conn = get_db_connection()
    cursor = conn.cursor()

    results = []

    if report_type == "daily_attendance":
        d_val = date_val or date.today().strftime("%Y-%m-%d")
        cursor.execute("""
            SELECT a.*, e.employee_code, u.name as employee_name, e.position, e.daily_salary
            FROM attendance a
            JOIN employees e ON a.employee_id = e.id
            JOIN users u ON e.user_id = u.id
            WHERE a.date = ?
            ORDER BY u.name ASC
        """, (d_val,))
        results = [dict(r) for r in cursor.fetchall()]
        for r in results:
            r["working_hours_formatted"] = format_minutes_to_hours(r["working_minutes"])

    elif report_type == "monthly_attendance":
        m = month or date.today().month
        y = year or date.today().year
        m_str = f"{y:04d}-{m:02d}-%"
        cursor.execute("""
            SELECT e.id as employee_id, e.employee_code, u.name as employee_name, e.position,
                   SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) as present_days,
                   SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) as absent_days,
                   SUM(CASE WHEN a.status = 'Half Day' THEN 1 ELSE 0 END) as half_days,
                   SUM(CASE WHEN a.status = 'Leave' THEN 1 ELSE 0 END) as leave_days,
                   SUM(a.working_minutes) as total_working_minutes
            FROM employees e
            JOIN users u ON e.user_id = u.id
            LEFT JOIN attendance a ON e.id = a.employee_id AND a.date LIKE ?
            WHERE e.status = 'ACTIVE'
            GROUP BY e.id
            ORDER BY u.name ASC
        """, (m_str,))
        results = [dict(r) for r in cursor.fetchall()]
        for r in results:
            r["total_hours_formatted"] = format_minutes_to_hours(r["total_working_minutes"] or 0)

    elif report_type == "monthly_salary":
        m = month or date.today().month
        y = year or date.today().year
        cursor.execute("""
            SELECT sr.*, e.employee_code, u.name as employee_name, e.position, u.phone
            FROM salary_records sr
            JOIN employees e ON sr.employee_id = e.id
            JOIN users u ON e.user_id = u.id
            WHERE sr.month = ? AND sr.year = ?
            ORDER BY u.name ASC
        """, (m, y))
        results = [dict(r) for r in cursor.fetchall()]

    elif report_type == "advances" or report_type == "outstanding_advances":
        query = """
            SELECT adv.*, e.employee_code, u.name as employee_name, e.position
            FROM advances adv
            JOIN employees e ON adv.employee_id = e.id
            JOIN users u ON e.user_id = u.id
            WHERE 1=1
        """
        params = []
        if report_type == "outstanding_advances":
            query += " AND adv.status != 'Deducted'"
        if employee_id:
            query += " AND adv.employee_id = ?"
            params.append(employee_id)
        query += " ORDER BY adv.transaction_date DESC"
        cursor.execute(query, params)
        results = [dict(r) for r in cursor.fetchall()]

    conn.close()
    return results

@app.get("/api/admin/audit-logs")
def get_audit_logs(_admin: dict = Depends(require_admin)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100")
    logs = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return logs

@app.get("/api/settings")
def get_settings():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM system_settings")
    settings = {r["key"]: r["value"] for r in cursor.fetchall()}
    conn.close()
    return settings

@app.post("/api/admin/settings")
def update_settings(req: SettingsUpdate, admin: dict = Depends(require_admin)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE system_settings SET value = ? WHERE key = 'working_days_per_month'", (str(req.working_days_per_month),))
    cursor.execute("UPDATE system_settings SET value = ? WHERE key = 'weekly_off_day'", (req.weekly_off_day,))
    cursor.execute("UPDATE system_settings SET value = ? WHERE key = 'leave_deduction_rule'", (req.leave_deduction_rule,))
    cursor.execute("UPDATE system_settings SET value = ? WHERE key = 'office_name'", (req.office_name,))

    log_audit(conn, admin["name"], "Updated office settings", "System Settings", f"Working days: {req.working_days_per_month}")
    conn.commit()
    conn.close()
    return {"message": "Settings updated successfully"}

# ----------------- Static Frontend Mount -----------------

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def serve_index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Courier Office Employee Management System Backend Running"}
