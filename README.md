# Courier Office Employee Management System

A complete, responsive, full-stack web application for courier hub operations, personnel attendance, automatic salary deduction calculations, employee advances, and payroll management.

## 🚀 Key Features

### 1. Dual-Role Architecture & Authentication
- **Admin Role**:
  - Full management of employee records, profiles, and starting salaries.
  - Approve pending worker registrations, activate or deactivate accounts.
  - Operational dashboard with 7 live metric cards, recent check-ins/outs, recent advances, and Chart.js analytics.
  - Attendance management: mark attendance, adjust stamps, compute working hours.
  - Advance management: record employee advances with instant in-app alerts.
  - Automatic payroll calculation: absent day deductions (`Daily Rate × Absent Days`), half-day deductions (50%), advance deductions, bonuses, and payslips.
  - 5 comprehensive reports (Daily Attendance, Monthly Attendance, Monthly Payroll, Advances, Outstanding Advances) with CSV export and Print/PDF support.
  - Immutable audit logs of administrative actions.
- **Worker / Employee Role**:
  - Secure registration and login flow (account enters `Pending` state until approved by Admin).
  - Clean worker dashboard: Live punch-in / punch-out buttons with duplicate check-in prevention.
  - Today's shift hours, monthly salary, and outstanding advance loan metrics.
  - Attendance log with verified hours and status.
  - Transparent monthly salary statements with breakdown of absent & advance deductions.
  - Advance history and balance tracking.
  - In-app notifications with unread counter.

### 2. Business Rules & Financial Formulas
- **Daily Rate**: `Monthly Salary / Working Days` (e.g. ₹18,000 / 26 = ₹692.31)
- **Absent Deduction**: `Daily Rate × Number of Absent Days` (e.g. ₹692.31 × 2 = ₹1,384.62)
- **Half Day Deduction**: `50% of Daily Rate × Number of Half Days`
- **Advance Deductions**: Automatically subtracted from net salary during monthly calculation and marked as deducted upon payment.
- **Indian Formats**: ₹ (INR), `DD/MM/YYYY`, 12-hour AM/PM format.

---

## 🔑 Default Credentials

### Administrator
- **Username / Email**: `admin` or `admin@courier.com`
- **Password**: `Admin@123`

### Sample Workers
- **Worker 1 (Senior Dispatcher)**: `EMP-0001` or `ravi.kumar@courier.com` / `Worker@123`
- **Worker 2 (Express Rider)**: `EMP-0002` or `amit.sharma@courier.com` / `Worker@123`
- **Worker 3 (Counter Booking)**: `EMP-0003` / `Worker@123`

---

## 🛠️ Running the Application

### Option A: Double-Click Batch File
Run `start_server.bat` in this folder.

### Option B: From Command Line
```powershell
# Activate the virtual environment
.venv\Scripts\activate

# Launch the FastAPI uvicorn server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Open your browser at:
👉 **[http://127.0.0.1:8000](http://127.0.0.1:8000)**

---

## 🧪 Running Automated Tests
```powershell
.venv\Scripts\python -m unittest tests_verification.py
```
All unit and integration tests verify:
- Admin login & JWT verification
- Worker registration & Admin approval workflow
- Check-in, check-out, and duplicate check-in prevention
- Advance recording and instant worker notification
- Absent day and advance salary deduction formulas
- Role-based route authorization (403 forbidden on unauthorized endpoints)
