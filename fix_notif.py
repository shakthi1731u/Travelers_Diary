import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'travelers_diary_project.settings')
django.setup()
from django.db import connection
c = connection.cursor()
sqls = [
    "ALTER TABLE diary_notification MODIFY request_status VARCHAR(20) NOT NULL DEFAULT ''",
    "ALTER TABLE diary_notification MODIFY notification_type VARCHAR(20) NOT NULL DEFAULT 'system'",
    "ALTER TABLE diary_notification MODIFY is_read TINYINT(1) NOT NULL DEFAULT 0",
]
for sql in sqls:
    try:
        c.execute(sql)
        print(f"OK: {sql[:70]}")
    except Exception as e:
        print(f"ERR: {e}")
print("Done.")
