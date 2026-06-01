import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'travelers_diary_project.settings')
django.setup()

from django.db import connection
cursor = connection.cursor()

fixes = [
    "ALTER TABLE diary_post MODIFY budget_currency VARCHAR(10) NOT NULL DEFAULT 'USD'",
    "ALTER TABLE diary_post MODIFY visibility VARCHAR(20) NOT NULL DEFAULT 'public'",
    "ALTER TABLE diary_post MODIFY media_data LONGTEXT NOT NULL DEFAULT ''",
    "ALTER TABLE diary_post MODIFY media_type_inline VARCHAR(10) NOT NULL DEFAULT 'image'",
]

for sql in fixes:
    try:
        cursor.execute(sql)
        print(f"OK: {sql[:60]}")
    except Exception as e:
        print(f"ERR: {e}")

print("Done.")
