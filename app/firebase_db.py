import os
import json
import logging
from typing import Optional, Dict, Any, List

logger = logging.getLogger("firebase_db")

_db = None
_initialized = False

def get_firestore_client():
    """
    Initializes and returns the Firestore client.
    Supports either:
      1. Local file: 'firebase-service-account.json'
      2. Environment variable: FIREBASE_SERVICE_ACCOUNT_JSON (for Render or cloud deployments)
    """
    global _db, _initialized
    if _db is not None:
        return _db
    
    if _initialized and _db is None:
        return None

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        cred = None
        # Check environment variable first (recommended for Render)
        service_account_env = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        if service_account_env:
            try:
                cert_dict = json.loads(service_account_env)
                cred = credentials.Certificate(cert_dict)
                logger.info("Loaded Firebase credentials from FIREBASE_SERVICE_ACCOUNT_JSON environment variable.")
            except Exception as e:
                logger.error(f"Error parsing FIREBASE_SERVICE_ACCOUNT_JSON env var: {e}")

        # Check local file fallback
        if not cred:
            possible_paths = [
                os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "firebase-service-account.json"),
                os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "akr-logistics-firebase-adminsdk-fbsvc-4f2ff65322.json"),
                "firebase-service-account.json"
            ]
            for path in possible_paths:
                if os.path.exists(path):
                    cred = credentials.Certificate(path)
                    logger.info(f"Loaded Firebase credentials from file: {path}")
                    break

        if not cred:
            logger.warning("No Firebase credentials found. Cloud sync will be disabled.")
            _initialized = True
            return None

        # Initialize firebase app if not already initialized
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        
        _db = firestore.client()
        _initialized = True
        logger.info("Firestore client initialized successfully!")
        return _db
    except Exception as e:
        logger.error(f"Failed to initialize Firestore: {e}")
        _initialized = True
        return None


def sync_document_to_firestore(collection_name: str, doc_id: str, data: Dict[str, Any]):
    """
    Asynchronously or safely saves/updates a document in Firestore.
    Does not crash the app if Firestore is unavailable or API is not yet activated.
    """
    db = get_firestore_client()
    if not db:
        return False
    try:
        # Convert any non-serializable objects or None to safe values
        clean_data = {}
        for k, v in data.items():
            if v is not None:
                clean_data[k] = v
        clean_data["_synced_at"] = firestore_server_timestamp()
        db.collection(collection_name).document(str(doc_id)).set(clean_data, merge=True)
        return True
    except Exception as e:
        logger.warning(f"Failed to sync doc {doc_id} to collection {collection_name}: {e}")
        return False


def delete_document_from_firestore(collection_name: str, doc_id: str):
    """
    Deletes a document from Firestore.
    """
    db = get_firestore_client()
    if not db:
        return False
    try:
        db.collection(collection_name).document(str(doc_id)).delete()
        return True
    except Exception as e:
        logger.warning(f"Failed to delete doc {doc_id} from collection {collection_name}: {e}")
        return False


def firestore_server_timestamp():
    try:
        from firebase_admin import firestore
        return firestore.SERVER_TIMESTAMP
    except Exception:
        from datetime import datetime
        return datetime.utcnow().isoformat()


def restore_data_from_firestore(sqlite_conn) -> bool:
    """
    On container startup, fetches existing permanent data from Firestore
    and hydrates SQLite. This ensures that even when Render restarts or resets its disk,
    every employee, attendance, and account is restored.
    """
    db = get_firestore_client()
    if not db:
        logger.info("Firestore not configured. Skipping cloud restore.")
        return False

    try:
        logger.info("Checking Firestore for cloud-persisted data...")
        
        # 1. Restore Users
        users_ref = db.collection("users").stream()
        cursor = sqlite_conn.cursor()
        restored_users = 0
        for doc in users_ref:
            u = doc.to_dict()
            try:
                cursor.execute("""
                    INSERT INTO users (id, employee_id, name, email, phone, password_hash, role, account_status, profile_image, joining_date, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name=excluded.name,
                        email=excluded.email,
                        phone=excluded.phone,
                        password_hash=excluded.password_hash,
                        role=excluded.role,
                        account_status=excluded.account_status,
                        profile_image=excluded.profile_image,
                        joining_date=excluded.joining_date,
                        updated_at=excluded.updated_at
                """, (
                    u.get("id"),
                    u.get("employee_id"),
                    u.get("name"),
                    u.get("email"),
                    u.get("phone"),
                    u.get("password_hash"),
                    u.get("role"),
                    u.get("account_status", "ACTIVE"),
                    u.get("profile_image"),
                    u.get("joining_date"),
                    u.get("created_at"),
                    u.get("updated_at")
                ))
                restored_users += 1
            except Exception as e:
                logger.error(f"Error restoring user {doc.id}: {e}")

        # 2. Restore Employees
        emp_ref = db.collection("employees").stream()
        restored_emps = 0
        for doc in emp_ref:
            e = doc.to_dict()
            try:
                cursor.execute("""
                    INSERT INTO employees (id, user_id, employee_code, position, address, monthly_salary, daily_salary, salary_effective_date, status, working_days_per_month)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        position=excluded.position,
                        address=excluded.address,
                        monthly_salary=excluded.monthly_salary,
                        daily_salary=excluded.daily_salary,
                        salary_effective_date=excluded.salary_effective_date,
                        status=excluded.status,
                        working_days_per_month=excluded.working_days_per_month
                """, (
                    e.get("id"),
                    e.get("user_id"),
                    e.get("employee_code"),
                    e.get("position"),
                    e.get("address"),
                    e.get("monthly_salary", 0.0),
                    e.get("daily_salary", 0.0),
                    e.get("salary_effective_date"),
                    e.get("status", "ACTIVE"),
                    e.get("working_days_per_month", 26)
                ))
                restored_emps += 1
            except Exception as err:
                logger.error(f"Error restoring employee {doc.id}: {err}")

        # 3. Restore Attendance
        att_ref = db.collection("attendance").stream()
        for doc in att_ref:
            a = doc.to_dict()
            try:
                cursor.execute("""
                    INSERT INTO attendance (id, employee_id, date, check_in_time, check_out_time, working_minutes, status, leave_type, notes, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(employee_id, date) DO UPDATE SET
                        check_in_time=excluded.check_in_time,
                        check_out_time=excluded.check_out_time,
                        working_minutes=excluded.working_minutes,
                        status=excluded.status,
                        leave_type=excluded.leave_type,
                        notes=excluded.notes,
                        updated_at=excluded.updated_at
                """, (
                    a.get("id"),
                    a.get("employee_id"),
                    a.get("date"),
                    a.get("check_in_time"),
                    a.get("check_out_time"),
                    a.get("working_minutes", 0),
                    a.get("status"),
                    a.get("leave_type"),
                    a.get("notes"),
                    a.get("created_at"),
                    a.get("updated_at")
                ))
            except Exception as err:
                logger.error(f"Error restoring attendance {doc.id}: {err}")

        # 4. Restore Advances
        adv_ref = db.collection("advances").stream()
        for doc in adv_ref:
            adv = doc.to_dict()
            try:
                cursor.execute("""
                    INSERT INTO advances (id, employee_id, amount, reason, payment_type, transaction_date, transaction_time, recorded_by, status, deducted_amount, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        amount=excluded.amount,
                        reason=excluded.reason,
                        payment_type=excluded.payment_type,
                        status=excluded.status,
                        deducted_amount=excluded.deducted_amount
                """, (
                    adv.get("id"),
                    adv.get("employee_id"),
                    adv.get("amount"),
                    adv.get("reason"),
                    adv.get("payment_type", "Cash"),
                    adv.get("transaction_date"),
                    adv.get("transaction_time"),
                    adv.get("recorded_by"),
                    adv.get("status", "Outstanding"),
                    adv.get("deducted_amount", 0.0),
                    adv.get("created_at")
                ))
            except Exception as err:
                logger.error(f"Error restoring advance {doc.id}: {err}")

        sqlite_conn.commit()
        logger.info(f"Firestore restore complete! Users: {restored_users}, Employees: {restored_emps}")
        return True
    except Exception as e:
        logger.error(f"Error during Firestore data restore: {e}")
        return False
