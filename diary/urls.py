from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('api/signup/', views.signup_api, name='signup_api'),
    path('api/verify-otp/', views.verify_otp_api, name='verify_otp_api'),
    path('api/login/', views.login_api, name='login_api'),
    path('api/logout/', views.logout_api, name='logout_api'),
    path('api/profile/', views.get_profile_api, name='get_profile_api'),
    path('api/profile/update/', views.update_profile_api, name='update_profile_api'),
    path('api/settings/update/', views.update_settings_api, name='update_settings_api'),
    path('api/password-change-request/', views.request_password_change_api, name='request_password_change_api'),
    path('api/password-change-verify/', views.verify_password_change_api, name='verify_password_change_api'),
    path('api/feed/', views.get_feed_api, name='get_feed_api'),
    path('api/post/create/', views.create_post_api, name='create_post_api'),
    path('api/post/comment/', views.add_comment_api, name='add_comment_api'),
    path('api/people/', views.get_people_api, name='get_people_api'),
    path('api/people/action/', views.people_action_api, name='people_action_api'),
    path('api/notifications/', views.get_notifications_api, name='get_notifications_api'),
    path('api/notifications/read/', views.mark_notification_read_api, name='mark_notification_read_api'),
    path('api/feed/map/', views.get_map_posts_api, name='get_map_posts_api'),
]
