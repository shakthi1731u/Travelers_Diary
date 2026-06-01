from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('diary', '0006_alter_userprofile_profile_picture'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='preferred_map_style',
            field=models.CharField(blank=True, default='liberty', max_length=20),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='preferred_mode',
            field=models.CharField(blank=True, default='light', max_length=10),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='preferred_theme',
            field=models.CharField(blank=True, default='ocean', max_length=20),
        ),
    ]
