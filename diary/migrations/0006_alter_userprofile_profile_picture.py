from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('diary', '0005_fix_userprofile'),
    ]

    operations = [
        migrations.AlterField(
            model_name='userprofile',
            name='profile_picture',
            field=models.BinaryField(blank=True, null=True, editable=True),
        ),
    ]
