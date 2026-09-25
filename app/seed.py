import sqlite3
from datetime import datetime, date, timedelta
import calendar
from app.database import get_db_connection, init_db
from app.auth import hash_password

def seed_database():
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()

    # Check if employees already exist
    cursor.execute("SELECT COUNT(*) FROM employees")
    emp_count = cursor.fetchone()[0]
    if emp_count > 0:
        print("Database already contains employees.")
        conn.close()
        return

    print("Seeding database with default workforce...")

    # 1. Admin Account check
    cursor.execute("SELECT id FROM users WHERE role = 'ADMIN'")
    admin_row = cursor.fetchone()
    if not admin_row:
        cursor.execute("""
            INSERT INTO users (employee_id, name, email, phone, password_hash, plain_password, role, account_status, profile_image, joining_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "ADM-0001",
            "Vikram Malhotra (Courier Hub Manager)",
            "admin@courier.com",
            "+91 98765 43210",
            hash_password("Admin@123"),
            "Admin@123",
            "ADMIN",
            "ACTIVE",
            "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
            "2023-01-15"
        ))
        admin_id = cursor.lastrowid
    else:
        admin_id = admin_row[0]

    # 2. Employees dataset
    employees_data = [
        {
            "code": "EMP-0001",
            "name": "Ravi Kumar",
            "email": "ravi.kumar@courier.com",
            "phone": "+91 98111 22334",
            "position": "Senior Dispatch Executive",
            "address": "B-42, Sector 14, Noida, UP",
            "monthly_salary": 22000.0,
            "working_days": 26,
            "joining_date": "2024-03-10",
            "status": "ACTIVE",
            "account_status": "ACTIVE"
        },
        {
            "code": "EMP-0002",
            "name": "Amit Sharma",
            "email": "amit.sharma@courier.com",
            "phone": "+91 98222 33445",
            "position": "Express Delivery Rider",
            "address": "12/A, Karol Bagh, New Delhi",
            "monthly_salary": 18000.0,
            "working_days": 26,
            "joining_date": "2024-06-01",
            "status": "ACTIVE",
            "account_status": "ACTIVE"
        },
        {
            "code": "EMP-0003",
            "name": "Priya Verma",
            "email": "priya.verma@courier.com",
            "phone": "+91 98333 44556",
            "position": "Counter Booking Specialist",
            "address": "H-89, Preet Vihar, Delhi",
            "monthly_salary": 20000.0,
            "working_days": 26,
            "joining_date": "2024-08-15",
            "status": "ACTIVE",
            "account_status": "ACTIVE"
        },
        {
            "code": "EMP-0004",
            "name": "Suresh Patel",
            "email": "suresh.patel@courier.com",
            "phone": "+91 98444 55667",
            "position": "Heavy Vehicle Logistics Driver",
            "address": "Plot 55, Sahibabad Industrial Area, Ghaziabad",
            "monthly_salary": 24000.0,
            "working_days": 26,
            "joining_date": "2023-11-20",
            "status": "ACTIVE",
            "account_status": "ACTIVE"
        },
        {
            "code": "EMP-0005",
            "name": "Deepak Yadav",
            "email": "deepak.yadav@courier.com",
            "phone": "+91 98555 66778",
            "position": "Warehouse Sorting Supervisor",
            "address": "Street 4, Mahipalpur, New Delhi",
            "monthly_salary": 21000.0,
            "working_days": 26,
            "joining_date": "2024-01-10",
            "status": "ACTIVE",
            "account_status": "ACTIVE"
        },
        {
            "code": "EMP-0006",
            "name": "Anjali Mehta",
            "email": "anjali.mehta@courier.com",
            "phone": "+91 98666 77889",
            "position": "Customer Service & Tracking Rep",
            "address": "Flat 302, Green Glen Layout, Indirapuram",
            "monthly_salary": 19500.0,
            "working_days": 26,
            "joining_date": "2024-05-12",
            "status": "ACTIVE",
            "account_status": "ACTIVE"
        },
        {
            "code": "EMP-0007",
            "name": "Manoj Singh",
            "email": "manoj.singh@courier.com",
            "phone": "+91 98777 88990",
            "position": "Last-Mile Delivery Boy",
            "address": "Gali 7, Laxmi Nagar, New Delhi",
            "monthly_salary": 16500.0,
            "working_days": 26,
            "joining_date": "2024-09-01",
            "status": "ACTIVE",
            "account_status": "ACTIVE"
        },
        {
            "code": "EMP-0008",
            "name": "Kavita Reddy",
            "email": "kavita.reddy@courier.com",
            "phone": "+91 98888 99001",
            "position": "Packaging & Barcode Associate",
            "address": "Quarter 18, Mayur Vihar Phase 1",
            "monthly_salary": 17000.0,
            "working_days": 26,
            "joining_date": "2024-04-18",
            "status": "ACTIVE",
            "account_status": "ACTIVE"
        },
        {
            "code": "EMP-0009",
            "name": "Sunil Chauhan",
            "email": "sunil.chauhan@courier.com",
            "phone": "+91 98999 00112",
            "position": "Fleet Maintenance Coordinator",
            "address": "Sector 62, Noida, UP",
            "monthly_salary": 23000.0,
            "working_days": 26,
            "joining_date": "2023-09-05",
            "status": "ACTIVE",
            "account_status": "ACTIVE"
        },
        {
            "code": "EMP-0010",
            "name": "Rohit Das",
            "email": "rohit.das@courier.com",
            "phone": "+91 98000 11223",
            "position": "Delivery Assistant",
            "address": "B-10, Okhla Phase 2, New Delhi",
            "monthly_salary": 16000.0,
            "working_days": 26,
            "joining_date": "2024-09-08",
            "status": "ACTIVE",
            "account_status": "PENDING"  # To demonstrate Pending Approval queue
        },
        {
            "code": "EMP-0011",
            "name": "Pooja Joshi",
            "email": "pooja.joshi@courier.com",
            "phone": "+91 97111 22334",
            "position": "Night Shift Hub Sorter",
            "address": "C-14, Shahdara, Delhi",
            "monthly_salary": 18500.0,
            "working_days": 26,
            "joining_date": "2024-02-14",
            "status": "INACTIVE",
            "account_status": "DEACTIVATED" # To demonstrate Inactive / Deactivated filter
        }
    ]

    emp_db_ids = []
    user_db_ids = []

    for emp in employees_data:
        daily_sal = round(emp["monthly_salary"] / emp["working_days"], 2)
        cursor.execute("""
            INSERT INTO users (employee_id, name, email, phone, password_hash, plain_password, role, account_status, joining_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            emp["code"],
            emp["name"],
            emp["email"],
            emp["phone"],
            hash_password("Worker@123"), # Easy default for workers
            "Worker@123",
            "WORKER",
            emp["account_status"],
            emp["joining_date"]
        ))
        u_id = cursor.lastrowid
        user_db_ids.append(u_id)

        cursor.execute("""
            INSERT INTO employees (user_id, employee_code, position, address, monthly_salary, daily_salary, salary_effective_date, status, working_days_per_month)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            u_id,
            emp["code"],
            emp["position"],
            emp["address"],
            emp["monthly_salary"],
            daily_sal,
            emp["joining_date"],
            emp["status"],
            emp["working_days"]
        ))
        e_id = cursor.lastrowid
        emp_db_ids.append((e_id, u_id, emp))

    conn.commit()

    # 3. Seed Attendance for August 2026 and September 2026 (up to Sep 11, 2026)
    # Let's seed for active employees (first 9)
    today = date(2026, 9, 11)
    aug_start = date(2026, 8, 1)
    aug_end = date(2026, 8, 31)

    print("Generating realistic attendance records for active employees...")
    for e_id, u_id, emp_info in emp_db_ids[:9]:
        # August 2026 attendance
        curr = aug_start
        while curr <= aug_end:
            if curr.weekday() != 6: # Sunday off
                # distribute Present, Absent, Half Day
                day_num = curr.day
                status = "Present"
                cin = "09:00 AM"
                cout = "06:30 PM"
                mins = 570

                # Introduce realistic variations:
                if (e_id + day_num) % 19 == 0:
                    status = "Absent"
                    cin = None
                    cout = None
                    mins = 0
                elif (e_id + day_num) % 23 == 0:
                    status = "Half Day"
                    cin = "09:15 AM"
                    cout = "01:45 PM"
                    mins = 270
                elif (e_id + day_num) % 29 == 0:
                    status = "Leave"
                    cin = None
                    cout = None
                    mins = 0

                cursor.execute("""
                    INSERT OR IGNORE INTO attendance (employee_id, date, check_in_time, check_out_time, working_minutes, status, leave_type)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (e_id, curr.strftime("%Y-%m-%d"), cin, cout, mins, status, "Unpaid" if status == "Leave" else None))
            curr += timedelta(days=1)

        # September 2026 attendance (Sep 1 to Sep 11)
        curr = date(2026, 9, 1)
        while curr <= today:
            if curr.weekday() != 6: # Not Sunday
                day_num = curr.day
                status = "Present"
                cin = "09:05 AM"
                cout = "07:10 PM"
                mins = 605

                # For today (Sep 11), some checked in and still working (no checkout yet)
                if curr == today:
                    if e_id in [1, 2, 3, 5, 8]:
                        # Checked in today, currently working
                        status = "Present"
                        cin = "09:02 AM"
                        cout = None
                        mins = 0
                    elif e_id in [4, 6]:
                        # Already finished shift
                        status = "Present"
                        cin = "08:30 AM"
                        cout = "05:00 PM"
                        mins = 510
                    elif e_id == 7:
                        # Absent today
                        status = "Absent"
                        cin = None
                        cout = None
                        mins = 0
                    else:
                        # Half day completed
                        status = "Half Day"
                        cin = "09:00 AM"
                        cout = "01:30 PM"
                        mins = 270
                else:
                    if (e_id * 3 + day_num) % 13 == 0:
                        status = "Absent"
                        cin = None
                        cout = None
                        mins = 0
                    elif (e_id * 5 + day_num) % 17 == 0:
                        status = "Half Day"
                        cin = "09:15 AM"
                        cout = "01:45 PM"
                        mins = 270

                cursor.execute("""
                    INSERT OR IGNORE INTO attendance (employee_id, date, check_in_time, check_out_time, working_minutes, status)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (e_id, curr.strftime("%Y-%m-%d"), cin, cout, mins, status))
            curr += timedelta(days=1)

    # 4. Seed Advances / Money Taken
    sample_advances = [
        (1, 2000.0, "Personal emergency advance", "2026-09-02", "03:45 PM", "Vikram Malhotra", "Outstanding", 0.0),
        (2, 3500.0, "Bike maintenance & fuel support", "2026-09-05", "11:20 AM", "Vikram Malhotra", "Outstanding", 0.0),
        (2, 1500.0, "Medical advance", "2026-08-10", "02:15 PM", "Vikram Malhotra", "Deducted", 1500.0),
        (4, 4000.0, "Festival family travel advance", "2026-08-12", "04:30 PM", "Vikram Malhotra", "Deducted", 4000.0),
        (5, 1000.0, "Child school book purchase", "2026-09-08", "10:15 AM", "Vikram Malhotra", "Outstanding", 0.0),
        (7, 1500.0, "Uniform & phone recharge advance", "2026-09-09", "01:00 PM", "Vikram Malhotra", "Outstanding", 0.0),
        (9, 2500.0, "Emergency home repair", "2026-08-18", "05:10 PM", "Vikram Malhotra", "Deducted", 2500.0),
    ]

    for adv in sample_advances:
        cursor.execute("""
            INSERT INTO advances (employee_id, amount, reason, transaction_date, transaction_time, recorded_by, status, deducted_amount)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, adv)

    # 5. Processed Salary Records for August 2026 (Month 8, 2026)
    print("Generating August 2026 processed payroll & payment history...")
    for e_id, u_id, emp_info in emp_db_ids[:9]:
        fixed_sal = emp_info["monthly_salary"]
        working_days = emp_info["working_days"]
        daily_sal = round(fixed_sal / working_days, 2)

        # Count attendance from DB
        cursor.execute("SELECT status FROM attendance WHERE employee_id = ? AND date LIKE '2026-08-%'", (e_id,))
        records = cursor.fetchall()
        p_count = sum(1 for r in records if r["status"] == "Present")
        a_count = sum(1 for r in records if r["status"] == "Absent")
        h_count = sum(1 for r in records if r["status"] == "Half Day")
        l_count = sum(1 for r in records if r["status"] == "Leave")

        absent_ded = round(a_count * daily_sal, 2)
        half_ded = round(h_count * (daily_sal * 0.5), 2)
        
        # Advance for august
        cursor.execute("""
            SELECT SUM(amount) as adv FROM advances 
            WHERE employee_id = ? AND transaction_date LIKE '2026-08-%'
        """, (e_id,))
        adv_row = cursor.fetchone()
        adv_ded = float(adv_row["adv"]) if adv_row and adv_row["adv"] else 0.0

        bonus = 500.0 if e_id in [1, 3, 5] else 0.0
        final_sal = round(fixed_sal - absent_ded - half_ded - adv_ded + bonus, 2)
        payment_status = "Paid"

        cursor.execute("""
            INSERT INTO salary_records (
                employee_id, month, year, fixed_salary, present_days, absent_days, half_days, leave_days,
                working_days, daily_salary, absent_deduction, half_day_deduction, advance_deduction, other_deduction,
                bonus, final_salary, payment_status, created_at
            ) VALUES (?, 8, 2026, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, '2026-09-01 10:00:00')
        """, (e_id, fixed_sal, p_count, a_count, h_count, l_count, working_days, daily_sal, absent_ded, half_ded, adv_ded, bonus, final_sal, payment_status))
        sal_rec_id = cursor.lastrowid

        # Record payment transaction
        cursor.execute("""
            INSERT INTO salary_payments (salary_record_id, employee_id, amount_paid, payment_date, payment_method, notes)
            VALUES (?, ?, ?, '2026-09-01', 'NEFT Bank Transfer', 'August 2026 monthly salary credited')
        """, (sal_rec_id, e_id, final_sal))

    # 6. Notifications
    sample_notifications = [
        (2, "Advance Recorded", "₹2,000 has been recorded as an employee advance on 02 September 2026 at 03:45 PM.", "ADVANCE", 0),
        (3, "Advance Recorded", "₹3,500 has been recorded as an employee advance on 05 September 2026 at 11:20 AM.", "ADVANCE", 1),
        (1, "Account Activated", "Welcome to AKR LOGISTICS! Your employee account has been approved and activated.", "ACCOUNT", 1),
        (2, "Salary Processed", "Your salary for August 2026 has been processed and credited to your account.", "SALARY", 1),
        (3, "Salary Processed", "Your salary for August 2026 has been processed and credited to your account.", "SALARY", 1),
        (4, "Salary Processed", "Your salary for August 2026 has been processed and credited to your account.", "SALARY", 1),
        (1, "Attendance Logged", "You checked in at 09:02 AM on 11/09/2026. Have a great day!", "ATTENDANCE", 0)
    ]
    for n in sample_notifications:
        cursor.execute("""
            INSERT INTO notifications (user_id, title, message, notification_type, is_read)
            VALUES (?, ?, ?, ?, ?)
        """, n)

    # 7. Audit Logs
    sample_audits = [
        ("Vikram Malhotra", "Approved employee registration", "Ravi Kumar (EMP-0001)", "Account status set to ACTIVE with starting salary ₹22,000/mo"),
        ("Vikram Malhotra", "Approved employee registration", "Amit Sharma (EMP-0002)", "Account status set to ACTIVE with starting salary ₹18,000/mo"),
        ("Vikram Malhotra", "Added employee advance", "Ravi Kumar (EMP-0001)", "Recorded advance of ₹2,000 (Personal emergency advance)"),
        ("Vikram Malhotra", "Processed August 2026 Payroll", "All Active Staff", "Generated monthly salary slips for 9 employees"),
        ("Vikram Malhotra", "Marked salary as paid", "Ravi Kumar (EMP-0001)", "Credited August salary via NEFT"),
        ("Vikram Malhotra", "Added employee advance", "Amit Sharma (EMP-0002)", "Recorded advance of ₹3,500 (Bike maintenance support)")
    ]
    for aud in sample_audits:
        cursor.execute("""
            INSERT INTO audit_logs (admin_name, action, employee_affected, details)
            VALUES (?, ?, ?, ?)
        """, aud)

    conn.commit()
    conn.close()
    print("Database seeding completed successfully!")

if __name__ == "__main__":
    seed_database()
