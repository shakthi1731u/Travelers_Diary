import json
import random
from django.shortcuts import render
from django.http import JsonResponse
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login, logout
from django.core.mail import send_mail
from django.contrib.auth.hashers import make_password
from .models import OTPVerification, UserProfile, PasswordChangeOTP, Post, PostMedia, Comment, UserFollow, UserBlock, Notification
from django.views.decorators.csrf import ensure_csrf_cookie
from django.conf import settings
from django.utils import timezone

@ensure_csrf_cookie
def index(request):
    return render(request, 'diary/index.html')

def signup_api(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            username = data.get('username')
            email = data.get('email')
            password = data.get('password')

            if User.objects.filter(email=email).exists():
                return JsonResponse({'error': 'Email already registered.'}, status=400)
            if User.objects.filter(username=username).exists():
                return JsonResponse({'error': 'Username already taken.'}, status=400)

            # Generate OTP
            otp = str(random.randint(100000, 999999))
            
            # Save or update OTP
            OTPVerification.objects.filter(email=email).delete() # Remove old OTP if exists
            OTPVerification.objects.create(
                email=email,
                otp=otp,
                username=username,
                password_hash=make_password(password)
            )

            send_mail(
                'Your Traveler\'s Diary OTP',
                f'Your verification code is: {otp}',
                settings.DEFAULT_FROM_EMAIL,
                [email],
                fail_silently=False,
            )

            return JsonResponse({'message': 'OTP sent successfully to email.'})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid method.'}, status=405)

def verify_otp_api(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            email = data.get('email')
            otp = data.get('otp')

            try:
                otp_record = OTPVerification.objects.get(email=email, otp=otp)
            except OTPVerification.DoesNotExist:
                return JsonResponse({'error': 'Invalid OTP.'}, status=400)

            # Create User — use create_user() so Django sets up the account
            # correctly, then assign the pre-hashed password directly so that
            # authenticate() (which calls check_password) works on future logins.
            user = User.objects.create_user(
                username=otp_record.username,
                email=otp_record.email,
                password=None  # Temporarily unusable; we'll set the hash below
            )
            # Assign the already-hashed password (from make_password at signup)
            # directly to bypass double-hashing
            user.password = otp_record.password_hash
            user.save(update_fields=['password'])
            
            # Clean up
            otp_record.delete()

            # Log the user in
            # We can't use authenticate() normally because we manually set the password hash, 
            # so we just login directly by specifying the backend
            login(request, user, backend='django.contrib.auth.backends.ModelBackend')

            return JsonResponse({
                'message': 'Signup successful and logged in.',
                'user': {
                    'username': user.username,
                    'email': user.email
                }
            })
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid method.'}, status=405)

def login_api(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            email = data.get('email')
            password = data.get('password')

            try:
                user_obj = User.objects.get(email=email)
            except User.DoesNotExist:
                return JsonResponse({'error': 'Invalid email or password.'}, status=400)

            user = authenticate(request, username=user_obj.username, password=password)
            if user is not None:
                login(request, user)
                return JsonResponse({
                    'message': 'Logged in successfully.',
                    'user': {
                        'username': user.username,
                        'email': user.email
                    }
                })
            else:
                return JsonResponse({'error': 'Invalid email or password.'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid method.'}, status=405)

def logout_api(request):
    if request.method == 'POST':
        logout(request)
        return JsonResponse({'message': 'Logged out successfully.'})
    return JsonResponse({'error': 'Invalid method.'}, status=405)

@ensure_csrf_cookie
def get_profile_api(request):
    target_username = request.GET.get('username')
    
    if target_username:
        try:
            target_user = User.objects.get(username=target_username)
        except User.DoesNotExist:
            return JsonResponse({'error': 'User not found'}, status=404)
        
        profile, _ = UserProfile.objects.get_or_create(user=target_user)
        can_view = True
        
        if profile.is_private and request.user != target_user:
            if request.user.is_authenticated:
                is_following = UserFollow.objects.filter(follower=request.user, following=target_user, status='accepted').exists()
                if not is_following:
                    can_view = False
            else:
                can_view = False
        
        posts = Post.objects.filter(user=target_user)
        total_travels = posts.count()
        overall_cost = sum(p.budget for p in posts if p.budget)
        best_travel = max((p.budget for p in posts if p.budget), default=0)
        
        profile_pic_b64 = ''
        if profile.profile_picture:
            try:
                pic_data = profile.profile_picture
                if isinstance(pic_data, memoryview): pic_data = pic_data.tobytes()
                profile_pic_b64 = pic_data.decode('utf-8')
            except Exception as e:
                pass
                
        # Handle individual privacy toggles
        ps = profile.privacy_settings or {}
        
        is_following = False
        follow_status = None
        if request.user.is_authenticated and request.user != target_user:
            follow_obj = UserFollow.objects.filter(follower=request.user, following=target_user).first()
            if follow_obj:
                is_following = follow_obj.status == 'accepted'
                follow_status = follow_obj.status
        
        data = {
            'username': target_user.username,
            'profile_picture': profile_pic_b64,
            'is_private': profile.is_private,
            'private_account': profile.is_private,  # alias used by JS
            'is_following': is_following,
            'follow_status': follow_status,
            'can_view': can_view,
            'bio': profile.bio if can_view else None,
            'status': profile.status if can_view and ps.get('show_status', True) else None,
            'gender': profile.gender if can_view and ps.get('show_gender', True) else None,
            'city': profile.city if can_view and ps.get('show_city', True) else None,
            'stats': {
                'total_travels': total_travels if can_view else None,
                'overall_cost': float(overall_cost) if can_view and ps.get('show_budget', True) else None,
                'best_travel': float(best_travel) if can_view and ps.get('show_budget', True) else None,
            },
            'posts': []
        }
        
        if can_view:
            for post in posts.order_by('-created_at'):
                media_items = []
                for m in post.media.all():
                    media_items.append({'media_url': m.media_url, 'media_type': m.media_type})
                data['posts'].append({
                    'id': post.id,
                    'description': post.description,
                    'destination_name': post.destination_name,
                    'budget': float(post.budget) if post.budget and ps.get('show_budget', True) else None,
                    'nuances': post.nuances,
                    'media_items': media_items,
                    'created_at': post.created_at.isoformat()
                })
        return JsonResponse(data)

    # Own profile request
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    
    profile, created = UserProfile.objects.get_or_create(user=request.user)
    profile_pic_b64 = ''
    if profile.profile_picture:
        try:
            pic_data = profile.profile_picture
            if isinstance(pic_data, memoryview):
                pic_data = pic_data.tobytes()
            profile_pic_b64 = pic_data.decode('utf-8')
        except Exception as e:
            pass

    return JsonResponse({
        'username': request.user.username,
        'email': request.user.email,
        'gender': profile.gender,
        'date_of_birth': profile.date_of_birth.isoformat() if profile.date_of_birth else '',
        'city': profile.city,
        'destination': profile.destination,
        'status': profile.status,
        'bio': profile.bio,
        'profile_picture': profile_pic_b64,
        'preferred_theme': profile.preferred_theme or 'ocean',
        'preferred_mode': profile.preferred_mode or 'light',
        'preferred_map_style': profile.preferred_map_style or 'liberty',
        'is_private': profile.is_private,
        'privacy_settings': profile.privacy_settings or {}
    })

@ensure_csrf_cookie
def update_profile_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            profile, created = UserProfile.objects.get_or_create(user=request.user)
            
            # Update User model
            if 'username' in data:
                # Check if username is taken
                new_username = data['username']
                if new_username != request.user.username and User.objects.filter(username=new_username).exists():
                    return JsonResponse({'error': 'Username is already taken.'}, status=400)
                request.user.username = new_username
                request.user.save()

            # Update Profile model
            if 'gender' in data: profile.gender = data['gender']
            if 'date_of_birth' in data: 
                try:
                    from datetime import datetime
                    profile.date_of_birth = datetime.strptime(data['date_of_birth'], '%Y-%m-%d').date() if data['date_of_birth'] else None
                except ValueError:
                    pass
            if 'city' in data: profile.city = data['city']
            if 'destination' in data: profile.destination = data['destination']
            if 'status' in data: profile.status = data['status']
            if 'bio' in data: profile.bio = data['bio']
            if 'profile_picture' in data and data['profile_picture']: 
                # Expecting base64 data URL from frontend
                profile.profile_picture = data['profile_picture'].encode('utf-8')
            
            # User preferences
            if 'preferred_theme' in data: profile.preferred_theme = data['preferred_theme']
            if 'preferred_mode' in data: profile.preferred_mode = data['preferred_mode']
            if 'preferred_map_style' in data: profile.preferred_map_style = data['preferred_map_style']
            
            profile.save()
            return JsonResponse({'message': 'Profile updated successfully.'})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid method.'}, status=405)

@ensure_csrf_cookie
def update_settings_api(request):
    """Lightweight endpoint to save user preferences and privacy settings."""
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            profile, created = UserProfile.objects.get_or_create(user=request.user)
            
            if 'preferred_theme' in data: profile.preferred_theme = data['preferred_theme']
            if 'preferred_mode' in data: profile.preferred_mode = data['preferred_mode']
            if 'preferred_map_style' in data: profile.preferred_map_style = data['preferred_map_style']
            if 'is_private' in data:
                profile.is_private = data['is_private']
            elif 'privacy_settings' in data and 'private_account' in data['privacy_settings']:
                profile.is_private = data['privacy_settings']['private_account']
            if 'privacy_settings' in data: profile.privacy_settings = data['privacy_settings']
            
            profile.save()
            return JsonResponse({'message': 'Settings saved.'})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid method.'}, status=405)

@ensure_csrf_cookie
def request_password_change_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    if request.method == 'POST':
        otp = str(random.randint(100000, 999999))
        PasswordChangeOTP.objects.filter(user=request.user).delete()
        PasswordChangeOTP.objects.create(user=request.user, otp=otp)
        
        send_mail(
            'Password Change OTP',
            f'Your OTP to reset password is: {otp}',
            settings.DEFAULT_FROM_EMAIL,
            [request.user.email],
            fail_silently=False,
        )
        return JsonResponse({'message': 'OTP sent to your email.'})
    return JsonResponse({'error': 'Invalid method.'}, status=405)

@ensure_csrf_cookie
def verify_password_change_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            otp = data.get('otp')
            new_password = data.get('new_password')
            
            try:
                otp_record = PasswordChangeOTP.objects.get(user=request.user, otp=otp)
            except PasswordChangeOTP.DoesNotExist:
                return JsonResponse({'error': 'Invalid OTP.'}, status=400)
            
            # Update password
            request.user.set_password(new_password)
            request.user.save()
            
            # Login again to prevent session invalidation
            login(request, request.user, backend='django.contrib.auth.backends.ModelBackend')
            otp_record.delete()
            
            return JsonResponse({'message': 'Password changed successfully.'})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid method.'}, status=405)

@ensure_csrf_cookie
def create_post_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            description = data.get('description', '')
            destination_name = data.get('destination_name', '')
            latitude = data.get('latitude')
            longitude = data.get('longitude')
            budget = data.get('budget', 0)
            nuances = data.get('nuances', '')
            media_items = data.get('media_items', [])

            if latitude is None or longitude is None:
                return JsonResponse({'error': 'Location is mandatory to post.'}, status=400)

            today = timezone.now().date()
            post_count = Post.objects.filter(user=request.user, created_at__date=today).count()
            if post_count >= 3:
                return JsonResponse({'error': 'Daily limit reached. You can only post up to 3 diaries per day.'}, status=403)

            post = Post.objects.create(
                user=request.user,
                description=description,
                destination_name=destination_name,
                latitude=latitude,
                longitude=longitude,
                budget=budget if budget else None,
                nuances=nuances
            )

            img_count = 0
            vid_count = 0
            for item in media_items:
                media_url = item.get('media_url')
                media_type = item.get('media_type', 'image')
                if media_url:
                    if media_type == 'image' and img_count < 5:
                        PostMedia.objects.create(post=post, media_url=media_url, media_type=media_type)
                        img_count += 1
                    elif media_type == 'video' and vid_count < 3:
                        PostMedia.objects.create(post=post, media_url=media_url, media_type=media_type)
                        vid_count += 1

            followers = UserFollow.objects.filter(following=request.user, status='accepted')
            for follower_rel in followers:
                Notification.objects.create(
                    recipient=follower_rel.follower,
                    sender=request.user,
                    notification_type='system',
                    message=f"{request.user.username} just added a new memory to their diary."
                )

            return JsonResponse({'message': 'Post created successfully.', 'post_id': post.id})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid method.'}, status=405)

def get_feed_api(request):
    if request.user.is_authenticated:
        # Exclude posts from blocked users and users who blocked the current user
        blocked_by_user = UserBlock.objects.filter(blocker=request.user).values_list('blocked_id', flat=True)
        blocked_user = UserBlock.objects.filter(blocked=request.user).values_list('blocker_id', flat=True)
        exclude_users = set(blocked_by_user) | set(blocked_user)
        
        # Get users we are following (accepted)
        following_ids = list(UserFollow.objects.filter(follower=request.user, status='accepted').values_list('following_id', flat=True))
        
        # Only exclude private users that we don't follow
        # Users with no profile row are treated as public by default
        private_user_ids = UserProfile.objects.filter(is_private=True).values_list('user_id', flat=True)
        for p_id in private_user_ids:
            if p_id != request.user.id and p_id not in following_ids:
                exclude_users.add(p_id)

        posts = Post.objects.exclude(user_id__in=exclude_users).order_by('-created_at')
    else:
        # Anonymous users only see posts from public profiles
        private_user_ids = UserProfile.objects.filter(is_private=True).values_list('user_id', flat=True)
        posts = Post.objects.exclude(user_id__in=private_user_ids).order_by('-created_at')
        following_ids = []

    feed_data = []
    for post in posts:
        media_items = []
        for m in post.media.all():
            media_items.append({'media_url': m.media_url, 'media_type': m.media_type})
        comments = list(post.comments.values('user__username', 'text', 'created_at'))
        user_avatar = ''
        if hasattr(post.user, 'profile') and post.user.profile.profile_picture:
            try:
                pic_data = post.user.profile.profile_picture
                if isinstance(pic_data, memoryview):
                    pic_data = pic_data.tobytes()
                user_avatar = pic_data.decode('utf-8')
            except:
                pass
        
        feed_data.append({
            'id': post.id,
            'user': post.user.username,
            'user_avatar': user_avatar,
            'description': post.description,
            'destination_name': post.destination_name,
            'budget': post.budget,
            'nuances': post.nuances,
            'latitude': post.latitude,
            'longitude': post.longitude,
            'media_items': media_items,
            'created_at': post.created_at.isoformat(),
            'comments': comments,
            'is_following': post.user.id in following_ids,
            'is_own_post': request.user.is_authenticated and post.user == request.user
        })
    return JsonResponse({'feed': feed_data})


def get_map_posts_api(request):
    """Returns lightweight post pin data for the main map."""
    if request.user.is_authenticated:
        blocked_by_user = UserBlock.objects.filter(blocker=request.user).values_list('blocked_id', flat=True)
        blocked_user = UserBlock.objects.filter(blocked=request.user).values_list('blocker_id', flat=True)
        exclude_users = set(blocked_by_user) | set(blocked_user)
        following_ids = list(UserFollow.objects.filter(follower=request.user, status='accepted').values_list('following_id', flat=True))
        # Private users not followed are excluded from map too (only their pins are hidden, not the public ones)
        private_user_ids = UserProfile.objects.filter(is_private=True).values_list('user_id', flat=True)
        for p_id in private_user_ids:
            if p_id != request.user.id and p_id not in following_ids:
                exclude_users.add(p_id)
        posts = Post.objects.exclude(user_id__in=exclude_users).exclude(latitude=None).exclude(longitude=None).select_related('user', 'user__profile').order_by('-created_at')
    else:
        private_user_ids = UserProfile.objects.filter(is_private=True).values_list('user_id', flat=True)
        posts = Post.objects.exclude(user_id__in=private_user_ids).exclude(latitude=None).exclude(longitude=None).select_related('user', 'user__profile').order_by('-created_at')

    pins = []
    for post in posts:
        # Get first media item for thumbnail
        first_media = post.media.first()
        media_preview = first_media.media_url[:200] if first_media else ''
        media_type = first_media.media_type if first_media else 'image'
        # Avatar
        avatar = ''
        if hasattr(post.user, 'profile') and post.user.profile.profile_picture:
            try:
                pd = post.user.profile.profile_picture
                if isinstance(pd, memoryview): pd = pd.tobytes()
                avatar = pd.decode('utf-8')
            except: pass
        pins.append({
            'id': post.id,
            'lat': post.latitude,
            'lng': post.longitude,
            'username': post.user.username,
            'avatar': avatar,
            'description': post.description[:120],
            'destination_name': post.destination_name,
            'media_preview': media_preview,
            'media_type': media_type,
        })
    return JsonResponse({'pins': pins})

@ensure_csrf_cookie
def add_comment_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            post_id = data.get('post_id')
            text = data.get('text')
            post = Post.objects.get(id=post_id)
            comment = Comment.objects.create(post=post, user=request.user, text=text)
            return JsonResponse({'message': 'Comment added successfully.', 'username': request.user.username})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid method.'}, status=405)

# --- PEOPLE & NOTIFICATIONS ---

@ensure_csrf_cookie
def get_people_api(request):
    """Returns followers, following, and blocked users."""
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    
    def get_user_data(u):
        avatar = ''
        if hasattr(u, 'profile') and u.profile.profile_picture:
            pic = u.profile.profile_picture
            if isinstance(pic, memoryview): pic = pic.tobytes()
            avatar = pic.decode('utf-8')
        return {
            'id': u.id,
            'username': u.username,
            'city': getattr(u.profile, 'city', '') if hasattr(u, 'profile') else '',
            'avatar': avatar
        }

    followers = [get_user_data(f.follower) for f in request.user.followers.all()]
    following = [get_user_data(f.following) for f in request.user.following.all()]
    blocked = [get_user_data(b.blocked) for b in request.user.blocking.all()]

    return JsonResponse({
        'followers': followers,
        'following': following,
        'blocked': blocked
    })

@ensure_csrf_cookie
def people_action_api(request):
    """Handles follow, unfollow, block, unblock actions."""
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            action = data.get('action')
            target_username = data.get('username')
            if not target_username:
                return JsonResponse({'error': 'Target username required'}, status=400)
            
            target_user = User.objects.get(username=target_username)
            
            if action == 'follow':
                # Can't follow if blocked
                if UserBlock.objects.filter(blocker=target_user, blocked=request.user).exists():
                    return JsonResponse({'error': 'You are blocked by this user'}, status=403)
                if UserBlock.objects.filter(blocker=request.user, blocked=target_user).exists():
                    return JsonResponse({'error': 'You have blocked this user. Unblock first.'}, status=400)
                
                target_profile, _ = UserProfile.objects.get_or_create(user=target_user)
                f, created = UserFollow.objects.get_or_create(follower=request.user, following=target_user)
                if created:
                    if target_profile.is_private:
                        f.status = 'pending'
                        f.save()
                        Notification.objects.create(
                            recipient=target_user,
                            sender=request.user,
                            notification_type='follow_request',
                            message=f"{request.user.username} requested to follow you."
                        )
                        return JsonResponse({'message': 'Follow request sent.', 'status': 'pending'})
                    else:
                        f.status = 'accepted'
                        f.save()
                        Notification.objects.create(
                            recipient=target_user,
                            sender=request.user,
                            notification_type='follow',
                            message=f"{request.user.username} started following you."
                        )
                        return JsonResponse({'message': f'You are now following {target_username}', 'status': 'accepted'})
                return JsonResponse({'message': 'Already following or requested', 'status': f.status})
            
            elif action == 'accept_follow':
                try:
                    f = UserFollow.objects.get(follower=target_user, following=request.user, status='pending')
                    f.status = 'accepted'
                    f.save()
                    Notification.objects.create(
                        recipient=target_user,
                        sender=request.user,
                        notification_type='system',
                        message=f"{request.user.username} accepted your follow request."
                    )
                    return JsonResponse({'message': 'Follow request accepted'})
                except UserFollow.DoesNotExist:
                    return JsonResponse({'error': 'No pending request found'}, status=400)

            elif action == 'reject_follow':
                UserFollow.objects.filter(follower=target_user, following=request.user, status='pending').delete()
                return JsonResponse({'message': 'Follow request rejected'})

            elif action == 'unfollow':
                UserFollow.objects.filter(follower=request.user, following=target_user).delete()
                return JsonResponse({'message': f'You unfollowed {target_username}'})
            
            elif action == 'block':
                UserBlock.objects.get_or_create(blocker=request.user, blocked=target_user)
                # Remove follow relationships
                UserFollow.objects.filter(follower=request.user, following=target_user).delete()
                UserFollow.objects.filter(follower=target_user, following=request.user).delete()
                return JsonResponse({'message': f'You blocked {target_username}'})
            
            elif action == 'unblock':
                UserBlock.objects.filter(blocker=request.user, blocked=target_user).delete()
                return JsonResponse({'message': f'You unblocked {target_username}'})
            
            return JsonResponse({'error': 'Invalid action'}, status=400)
        except User.DoesNotExist:
            return JsonResponse({'error': 'User not found'}, status=404)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid method'}, status=405)

@ensure_csrf_cookie
def get_notifications_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    
    notifications = request.user.notifications.all().order_by('-created_at')
    data = []
    for n in notifications:
        sender_avatar = ''
        if n.sender and hasattr(n.sender, 'profile') and n.sender.profile.profile_picture:
            pic = n.sender.profile.profile_picture
            if isinstance(pic, memoryview): pic = pic.tobytes()
            sender_avatar = pic.decode('utf-8')
        
        data.append({
            'id': n.id,
            'type': n.notification_type,
            'message': n.message,
            'is_read': n.is_read,
            'created_at': n.created_at.isoformat(),
            'sender': n.sender.username if n.sender else None,
            'sender_avatar': sender_avatar
        })
    return JsonResponse({'notifications': data})

@ensure_csrf_cookie
def mark_notification_read_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            notif_id = data.get('id')
            if notif_id:
                request.user.notifications.filter(id=notif_id).update(is_read=True)
            else:
                # Mark all read
                request.user.notifications.filter(is_read=False).update(is_read=True)
            return JsonResponse({'message': 'Success'})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid method'}, status=405)
