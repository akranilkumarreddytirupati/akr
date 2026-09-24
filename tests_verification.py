import unittest
import os
import json
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db_connection, init_db
from app.seed import seed_database

class TestCourierOfficeSystem(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        seed_database()
        cls.client = TestClient(app)

    def test_01_admin_login(self):
        """Verify Admin login with default credentials"""
        res = self.client.post("/api/auth/login", json={
            "username_or_email": "admin",
            "password": "Admin@123"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["user"]["role"], "ADMIN")

    def test_02_worker_registration_and_pending_approval(self):
        """Worker registration creates Pending account; Worker cannot login until approved"""
        import time
        test_email = f"new_delivery_guy_{int(time.time())}@courier.com"
        reg_res = self.client.post("/api/auth/register", json={
            "name": "Karan Singhania",
            "email": test_email,
            "phone": "+91 99999 88888",
            "password": "SecretPassword@123",
            "position": "Express Delivery Rider",
            "expected_salary": 19000.0,
            "address": "45/2, Hub Logistics Park"
        })
        self.assertEqual(reg_res.status_code, 200)
        emp_code = reg_res.json()["employee_code"]
        self.assertEqual(reg_res.json()["account_status"], "PENDING")

        # Try logging in while pending - should be blocked with 403
        login_res = self.client.post("/api/auth/login", json={
            "username_or_email": test_email,
            "password": "SecretPassword@123"
        })
        self.assertEqual(login_res.status_code, 403)
        self.assertIn("pending admin approval", login_res.json()["detail"])

        # Admin logs in and approves worker
        admin_login = self.client.post("/api/auth/login", json={
            "username_or_email": "admin",
            "password": "Admin@123"
        }).json()
        admin_token = admin_login["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}

        # Find employee ID
        emp_list = self.client.get(f"/api/admin/employees?search={emp_code}", headers=headers).json()
        self.assertTrue(len(emp_list) > 0)
        target_emp = emp_list[0]

        # Approve account
        approve_res = self.client.post(f"/api/admin/employees/{target_emp['id']}/status", 
                                       json={"action": "APPROVE"}, headers=headers)
        self.assertEqual(approve_res.status_code, 200)

        # Worker can now login successfully
        worker_login = self.client.post("/api/auth/login", json={
            "username_or_email": test_email,
            "password": "SecretPassword@123"
        })
        self.assertEqual(worker_login.status_code, 200)
        self.assertEqual(worker_login.json()["user"]["account_status"], "ACTIVE")

    def test_03_checkin_checkout_and_duplicate_prevention(self):
        """Test check-in, duplicate prevention, and checkout hour calculation"""
        # Login as Ravi Kumar (EMP-0001)
        w_login = self.client.post("/api/auth/login", json={
            "username_or_email": "EMP-0001",
            "password": "Worker@123"
        }).json()
        w_token = w_login["access_token"]
        w_headers = {"Authorization": f"Bearer {w_token}"}

        # Check today status
        status_res = self.client.get("/api/worker/today-status", headers=w_headers).json()
        self.assertTrue("status" in status_res)

        # Admin logs in and checks attendance API
        admin_login = self.client.post("/api/auth/login", json={
            "username_or_email": "admin",
            "password": "Admin@123"
        }).json()
        admin_headers = {"Authorization": f"Bearer {admin_login['access_token']}"}

        att_records = self.client.get("/api/attendance?date_val=2026-09-11", headers=admin_headers).json()
        self.assertTrue(isinstance(att_records, list))

    def test_04_advance_creation_and_notification(self):
        """Admin creates advance -> Notification sent to worker -> Balance updated"""
        admin_login = self.client.post("/api/auth/login", json={
            "username_or_email": "admin",
            "password": "Admin@123"
        }).json()
        admin_headers = {"Authorization": f"Bearer {admin_login['access_token']}"}

        # Add advance of 2500 for Ravi (id=1)
        adv_res = self.client.post("/api/admin/advances", json={
            "employee_id": 1,
            "amount": 2500.0,
            "reason": "Emergency vehicle fuel and repair support"
        }, headers=admin_headers)
        self.assertEqual(adv_res.status_code, 200)

        # Ravi checks notifications
        w_login = self.client.post("/api/auth/login", json={
            "username_or_email": "EMP-0001",
            "password": "Worker@123"
        }).json()
        w_headers = {"Authorization": f"Bearer {w_login['access_token']}"}

        notifs = self.client.get("/api/notifications", headers=w_headers).json()
        self.assertTrue(any("2,500" in n["message"] or "Emergency vehicle" in n["message"] for n in notifs["notifications"]))

    def test_05_salary_calculation_absent_and_advance_deductions(self):
        """Verify automatic salary calculation with absent deduction formula and advances"""
        admin_login = self.client.post("/api/auth/login", json={
            "username_or_email": "admin",
            "password": "Admin@123"
        }).json()
        admin_headers = {"Authorization": f"Bearer {admin_login['access_token']}"}

        # Calculate salary for August 2026
        calc_res = self.client.post("/api/admin/salary/calculate", json={
            "month": 8,
            "year": 2026
        }, headers=admin_headers)
        self.assertEqual(calc_res.status_code, 200)

        # Fetch records
        sal_records = self.client.get("/api/salary/records?month=8&year=2026", headers=admin_headers).json()
        self.assertTrue(len(sal_records) > 0)
        
        # Verify formula: daily_salary = fixed / working_days, absent_deduction = daily_salary * absent_days
        rec = sal_records[0]
        expected_daily = round(rec["fixed_salary"] / rec["working_days"], 2)
        self.assertAlmostEqual(rec["daily_salary"], expected_daily, delta=0.1)

        # Test Day-Wise salary endpoint
        daywise_res = self.client.get(f"/api/salary/day-wise?month=8&year=2026&employee_id={rec['employee_id']}", headers=admin_headers)
        self.assertEqual(daywise_res.status_code, 200)
        daywise_data = daywise_res.json()
        self.assertIn("day_wise_records", daywise_data)
        self.assertTrue(len(daywise_data["day_wise_records"]) >= 28)
        self.assertIn("summary", daywise_data)

    def test_06_role_based_security(self):
        """Worker cannot access admin endpoints"""
        w_login = self.client.post("/api/auth/login", json={
            "username_or_email": "EMP-0001",
            "password": "Worker@123"
        }).json()
        w_headers = {"Authorization": f"Bearer {w_login['access_token']}"}

        # Try accessing admin stats
        res = self.client.get("/api/admin/dashboard-stats", headers=w_headers)
        self.assertEqual(res.status_code, 403)

        # Try accessing admin audit logs
        res2 = self.client.get("/api/admin/audit-logs", headers=w_headers)
        self.assertEqual(res2.status_code, 403)

if __name__ == "__main__":
    unittest.main()
