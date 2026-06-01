// State Management & Local Storage Backend
let state = {
    currentView: 'map-view',
    userRole: 'anonymous', // 'anonymous' or 'logged-in'
    locationPermission: false,
    currentLocation: null,
};

const defaultData = {
    users: [],
    posts: [
        {
            id: 1,
            user: { name: "Elena R.", avatar: "https://i.pravatar.cc/150?u=1", isPrivate: false },
            media: "file:///C:/Users/shakt/.gemini/antigravity/brain/d2b6fd46-52c1-47f0-92c5-36e3fd51d655/bali_landscape_1777964903601.png",
            description: "Found this hidden rice terrace away from the usual tourist spots. The morning light was absolutely perfect.",
            nuances: ["28°C, Humid", "Rented Scooter", "Sunrise 6:15 AM", "Tegallalang area"],
            comments: []
        }
    ],
    currentUser: null,
    settings: { theme: 'ocean', mode: 'light' }
};

function getDbData() {
    const data = localStorage.getItem('travelersDiaryDB');
    if (data) {
        return JSON.parse(data);
    } else {
        localStorage.setItem('travelersDiaryDB', JSON.stringify(defaultData));
        return defaultData;
    }
}

function saveDbData(data) {
    localStorage.setItem('travelersDiaryDB', JSON.stringify(data));
}

// --- Map Style URLs (hoisted so openModal can always access them) ---
const mapStyleUrls = {
    liberty: 'https://tiles.openfreemap.org/styles/liberty',
    bright: 'https://tiles.openfreemap.org/styles/bright',
    positron: 'https://tiles.openfreemap.org/styles/positron',
    dark: 'https://tiles.openfreemap.org/styles/dark',
    fiord: 'https://tiles.openfreemap.org/styles/fiord'
};

// Map Setup
let map;

function initMap() {
    map = new maplibregl.Map({
        container: 'map-container',
        style: 'https://tiles.openfreemap.org/styles/liberty', // base 3d style
        center: [0, 20],
        zoom: 2.5,
        minZoom: 2.5,
        pitch: 45 // 3D tilt
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
        applyTheme(); // apply style when loaded

        // Add some random hot spots (MapLibre uses [lng, lat])
        new maplibregl.Marker({ color: '#0284c7' }).setLngLat([115.188919, -8.409518]).setPopup(new maplibregl.Popup().setHTML('Bali, Indonesia')).addTo(map);
        new maplibregl.Marker({ color: '#0284c7' }).setLngLat([139.6503, 35.6762]).setPopup(new maplibregl.Popup().setHTML('Tokyo, Japan')).addTo(map);

        // Load diary post pins from backend
        loadMapPostPins();
    });

    // Fade pins in/out based on zoom level
    map.on('zoom', () => applyPostPinVisibility());

    map.on('click', (e) => {
        if (state.userRole !== 'logged-in') return;
        
        if (window.mainMapPickedMarker) window.mainMapPickedMarker.remove();
        window.mainMapPickedMarker = new maplibregl.Marker({ color: '#e11d48' })
            .setLngLat(e.lngLat)
            .addTo(map);
            
        window.lastPickedLocation = e.lngLat;
        
        const popupContent = document.createElement('div');
        popupContent.innerHTML = `<div style="text-align: center; font-family: var(--font-main);"><div style="margin-bottom: 8px; font-weight: bold;">Post memory here?</div><button class="btn-primary" style="padding: 4px 8px; font-size: 0.8rem;" onclick="openModal('post-modal')">Create Post</button></div>`;
        
        window.mainMapPickedMarker.setPopup(new maplibregl.Popup({ offset: 25 }).setDOMContent(popupContent)).togglePopup();
    });
}

function setMapTiles(theme) {
    if (!map || !map.isStyleLoaded()) return;

    let styleUrl = 'https://tiles.openfreemap.org/styles/positron'; // default light
    if (theme === 'ocean') {
        styleUrl = 'https://tiles.openfreemap.org/styles/liberty';
    } else if (theme === 'jungle') {
        styleUrl = 'https://tiles.openfreemap.org/styles/positron';
    } else if (theme === 'desert') {
        styleUrl = 'https://tiles.openfreemap.org/styles/bright';
    }

    map.setStyle(styleUrl);
}

function handleLocation() {
    const statusText = document.getElementById('map-status');
    const overlay = document.getElementById('map-overlay');

    if (navigator.geolocation) {
        if (statusText) statusText.textContent = "Requesting location...";
        navigator.geolocation.getCurrentPosition(
            (position) => {
                state.locationPermission = true;
                const { latitude, longitude } = position.coords;
                state.currentLocation = [latitude, longitude];

                map.flyTo({ center: [longitude, latitude], zoom: 14, pitch: 60, duration: 2000 });

                new maplibregl.Marker()
                    .setLngLat([longitude, latitude])
                    .setPopup(new maplibregl.Popup().setHTML("You are here"))
                    .addTo(map)
                    .togglePopup();

                // Populate random users around the location
                generateRandomUsers(latitude, longitude);

                if (statusText) statusText.textContent = "Location found! Explore the map.";
                setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 2000);
                
                const fab = document.querySelector('.global-location-btn');
                if (fab) fab.classList.remove('pulse-splash');
            },
            (error) => {
                state.locationPermission = false;
                if (statusText) statusText.textContent = "Location denied.";
                setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 2000);
                
                const fab = document.querySelector('.global-location-btn');
                if (fab) fab.classList.remove('pulse-splash');
            }
        );
    }
}

window.openUserProfile = function (user) {
    const username = typeof user === 'string' ? user : user.name;
    openModal('user-profile-modal');

    fetch(`/api/profile/?username=${encodeURIComponent(username)}`, {
        headers: { 'X-CSRFToken': getCookie('csrftoken') || csrftoken }
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
            closeModal('user-profile-modal');
            return;
        }

        document.getElementById('user-profile-username').textContent = data.username;
        document.getElementById('user-profile-avatar').src = data.profile_picture || 'https://via.placeholder.com/150';
        
        const privateMsg = document.getElementById('profile-private-msg');
        const publicContent = document.getElementById('profile-public-content');
        const followBtn = document.getElementById('profile-follow-btn');
        const followBtnPrivate = document.getElementById('profile-follow-btn-private');

        const isSelf = getDbData().currentUser && getDbData().currentUser.name === data.username;

        const setupFollowBtn = (btn) => {
            if (isSelf || state.userRole !== 'logged-in') {
                btn.style.display = 'none';
                return;
            }
            btn.style.display = 'inline-block';
            
            if (data.is_following && data.follow_status === 'accepted') {
                btn.innerHTML = '<i class="ph ph-user-minus"></i> UNFOLLOW';
                btn.onclick = () => {
                    doPeopleAction('unfollow', data.username, btn);
                    setTimeout(() => openUserProfile(data.username), 500);
                };
            } else if (data.follow_status === 'pending') {
                btn.innerHTML = '<i class="ph ph-clock"></i> REQUESTED';
                btn.onclick = () => {
                    doPeopleAction('unfollow', data.username, btn);
                    setTimeout(() => openUserProfile(data.username), 500);
                };
            } else {
                btn.innerHTML = '<i class="ph ph-user-plus"></i> FOLLOW';
                btn.onclick = () => {
                    doPeopleAction('follow', data.username, btn);
                    setTimeout(() => openUserProfile(data.username), 500);
                };
            }
        };

        if (data.private_account && !data.is_following && !isSelf) {
            privateMsg.style.display = 'block';
            publicContent.style.display = 'none';
            setupFollowBtn(followBtnPrivate);
        } else {
            privateMsg.style.display = 'none';
            publicContent.style.display = 'block';
            setupFollowBtn(followBtn);

            document.getElementById('user-profile-total-travels').textContent = data.stats.total_travels;
            document.getElementById('user-profile-overall-cost').textContent = '$' + data.stats.overall_cost;
            document.getElementById('user-profile-best-travel').textContent = data.stats.best_travel || '-';

            const genderBadge = document.getElementById('user-profile-gender-badge');
            if (data.gender) {
                genderBadge.style.display = 'inline-block';
                document.getElementById('user-profile-gender').textContent = data.gender;
            } else {
                genderBadge.style.display = 'none';
            }

            const cityBadge = document.getElementById('user-profile-city-badge');
            if (data.city) {
                cityBadge.style.display = 'inline-block';
                document.getElementById('user-profile-city').textContent = data.city;
            } else {
                cityBadge.style.display = 'none';
            }

            document.getElementById('user-profile-status').textContent = data.status || '';

            const polaroidsContent = document.getElementById('user-polaroids-content');
            polaroidsContent.innerHTML = '';
            polaroidsContent.className = 'profile-grid-container';
            
            if (data.posts && data.posts.length > 0) {
                data.posts.forEach(post => {
                    if (post.media_items && post.media_items.length > 0) {
                        const firstMedia = post.media_items[0];
                        const el = document.createElement('div');
                        el.className = 'profile-grid-item';
                        
                        el.onclick = () => window.openLightbox(firstMedia.media_url, firstMedia.media_type);
                        
                        if (firstMedia.media_type === 'video') {
                            el.innerHTML = `
                                <video src="${firstMedia.media_url}" autoplay muted loop></video>
                                <div class="grid-overlay"><i class="ph-fill ph-play-circle"></i></div>
                            `;
                        } else {
                            el.innerHTML = `
                                <img src="${firstMedia.media_url}" alt="Post thumbnail">
                                <div class="grid-overlay"><i class="ph-fill ph-images"></i></div>
                            `;
                        }
                        polaroidsContent.appendChild(el);
                    }
                });
            } else {
                polaroidsContent.innerHTML = '<p style="grid-column: span 3; text-align:center; width: 100%; color: #666; font-size: 1.2rem; font-family: var(--font-handwriting);">No travels recorded yet.</p>';
            }
        }
    })
    .catch(err => console.error(err));
}

function generateRandomUsers(lat, lng) {
    const randomUsers = [
        { name: "Alex Wander", desc: "Backpacking across the continent!", color: "#e11d48" },
        { name: "Sam Explorer", desc: "Looking for the best coffee shop.", color: "#16a34a" },
        { name: "Jordan Trek", desc: "Just arrived, eager to explore.", color: "#ca8a04" },
        { name: "Casey Nomad", desc: "Digital nomad life.", color: "#9333ea" },
        { name: "Riley Hiker", desc: "Hitting the trails tomorrow.", color: "#ea580c" }
    ];

    randomUsers.forEach(user => {
        // Generate random offset within ~5km
        const latOffset = (Math.random() - 0.5) * 0.05;
        const lngOffset = (Math.random() - 0.5) * 0.05;

        const el = document.createElement('div');
        el.className = 'user-marker';
        el.style.width = '20px';
        el.style.height = '20px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = user.color;
        el.style.border = '2px solid white';
        el.style.cursor = 'pointer';
        el.style.boxShadow = '0 2px 5px rgba(0,0,0,0.5)';

        el.addEventListener('click', () => {
            window.openUserProfile(user);
        });

        new maplibregl.Marker({ element: el })
            .setLngLat([lng + lngOffset, lat + latOffset])
            .addTo(map);
    });
}

// ============================================================
// MAP POST PINS — Diary posts shown as pins on the main map
// ============================================================
let postPinMarkers = [];

function loadMapPostPins() {
    fetch('/api/feed/map/', { credentials: 'same-origin' })
        .then(r => r.json())
        .then(data => {
            // Remove old pins
            postPinMarkers.forEach(m => m.remove());
            postPinMarkers = [];
            (data.pins || []).forEach(pin => {
                const el = document.createElement('div');
                el.innerHTML = '📖';
                el.style.cssText = [
                    'font-size:1.4rem', 'cursor:pointer', 'user-select:none',
                    'transition:opacity 0.4s, transform 0.3s',
                    'filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
                    'transform:scale(1)'
                ].join(';');
                el.title = pin.destination_name || pin.username;

                const avatarTag = pin.avatar
                    ? `<img src="${pin.avatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid #fff;">`
                    : `<div style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;"><i class="ph ph-user"></i></div>`;

                const popupHtml = `
                    <div style="min-width:200px;font-family:var(--font-main);">
                        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
                            ${avatarTag}
                            <strong style="font-size:0.95rem;">${pin.username}</strong>
                        </div>
                        ${pin.destination_name ? `<div style="font-size:0.8rem;color:#888;margin-bottom:0.25rem;">📍 ${pin.destination_name}</div>` : ''}
                        <p style="margin:0 0 0.75rem;font-size:0.85rem;line-height:1.4;">${pin.description || ''}</p>
                        <button onclick="openUserProfile('${pin.username}')" style="width:100%;padding:0.4rem;background:#1a73e8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.8rem;">View Diary</button>
                    </div>`;

                const popup = new maplibregl.Popup({ offset: 25, maxWidth: '240px' }).setHTML(popupHtml);
                const marker = new maplibregl.Marker({ element: el })
                    .setLngLat([pin.lng, pin.lat])
                    .setPopup(popup)
                    .addTo(map);

                postPinMarkers.push(marker);
            });

            // Apply zoom-based visibility immediately
            applyPostPinVisibility();
        })
        .catch(err => console.warn('Map pins load error:', err));
}

function applyPostPinVisibility() {
    if (!map) return;
    const zoom = map.getZoom();
    const visible = zoom >= 4;
    const opacity = visible ? '1' : '0';
    const scale = visible ? 'scale(1)' : 'scale(0.5)';
    postPinMarkers.forEach(m => {
        const el = m.getElement();
        if (el) { el.style.opacity = opacity; el.style.transform = scale; el.style.pointerEvents = visible ? 'auto' : 'none'; }
    });
}

// ============================================================
// PEOPLE (Followers / Following) — Real Backend
// ============================================================

let peopleData = { followers: [], following: [] };
let currentPeopleTab = 'followers';

function loadPeopleData(tab) {
    currentPeopleTab = tab || currentPeopleTab;
    if (state.userRole !== 'logged-in') return;

    fetch('/api/people/', { headers: { 'X-CSRFToken': getCookie('csrftoken') }, credentials: 'same-origin' })
        .then(res => res.json())
        .then(data => {
            peopleData = data;
            renderPeopleList();
        })
        .catch(err => console.error('People load error:', err));
}

function renderPeopleList() {
    const container = document.getElementById('people-list-container');
    if (!container) return;
    const searchVal = (document.getElementById('people-search-input') || {}).value || '';
    const list = peopleData[currentPeopleTab] || [];
    const filtered = list.filter(p => p.username.toLowerCase().includes(searchVal.toLowerCase()));

    // Update tab counts
    const tabFollowers = document.getElementById('tab-followers');
    const tabFollowing = document.getElementById('tab-following');
    if (tabFollowers) tabFollowers.textContent = `Followers (${(peopleData.followers || []).length})`;
    if (tabFollowing) tabFollowing.textContent = `Following (${(peopleData.following || []).length})`;

    if (filtered.length === 0) {
        container.innerHTML = `<p style="text-align:center;color:var(--text-secondary);padding:2rem;">No ${currentPeopleTab} yet.</p>`;
        return;
    }

    // For each person, determine if current user is following them
    const followingIds = (peopleData.following || []).map(f => f.id);

    container.innerHTML = filtered.map(person => {
        const avatarHtml = person.avatar
            ? `<img src="${person.avatar}" class="person-avatar" alt="${person.username}">`
            : `<div class="person-avatar" style="font-size:1.2rem;background:rgba(255,255,255,0.2);"><i class="ph ph-user"></i></div>`;
        const isFollowing = followingIds.includes(person.id);
        const followBtnLabel = isFollowing ? 'Following' : 'Follow';
        const followBtnClass = isFollowing ? 'btn-follow-small following' : 'btn-follow-small not-following';
        const followAction = isFollowing ? 'unfollow' : 'follow';
        return `
        <div class="person-item" data-username="${person.username}">
            <div class="person-info">
                ${avatarHtml}
                <div class="person-details">
                    <span class="person-name">${person.username}</span>
                    <span class="person-city">${person.city || 'Traveler'}</span>
                </div>
            </div>
            <div class="person-actions">
                <button style="background:transparent;border:1px solid var(--text-primary);color:var(--text-primary);padding:0.25rem 0.6rem;border-radius:6px;cursor:pointer;font-size:0.75rem;white-space:nowrap;" onclick="openUserProfile('${person.username}')"><i class="ph ph-user"></i> Profile</button>
                <button class="${followBtnClass}" onclick="doPeopleAction('${followAction}','${person.username}',this)">${followBtnLabel}</button>
                <button class="block-user-btn" title="Block user" onclick="doPeopleAction('block','${person.username}',this)"><i class="ph ph-prohibit"></i></button>
            </div>
        </div>`;
    }).join('');
}

window.switchPeopleTab = function(tab) {
    currentPeopleTab = tab;
    document.querySelectorAll('.people-tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.getElementById('tab-' + tab);
    if (activeTab) activeTab.classList.add('active');
    renderPeopleList();
};

window.filterPeopleList = function() { renderPeopleList(); };

window.doPeopleAction = function(action, username, btnEl) {
    fetch('/api/people/action/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
        credentials: 'same-origin',
        body: JSON.stringify({ action, username })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) { alert(data.error); return; }
        // Refresh the list after action
        loadPeopleData(currentPeopleTab);
    })
    .catch(err => console.error('People action error:', err));
};

window.openBlockedUsersModal = function() {
    const container = document.getElementById('blocked-users-list');
    if (!container) return;
    const blocked = peopleData.blocked || [];
    if (blocked.length === 0) {
        container.innerHTML = `<p style="text-align:center;color:var(--text-secondary);padding:2rem;">No blocked users.</p>`;
    } else {
        container.innerHTML = blocked.map(person => {
            const avatarHtml = person.avatar
                ? `<img src="${person.avatar}" class="person-avatar" alt="${person.username}">`
                : `<div class="person-avatar" style="font-size:1.2rem;"><i class="ph ph-user"></i></div>`;
            return `
            <div class="person-item">
                <div class="person-info">${avatarHtml}
                    <div class="person-details">
                        <span class="person-name">${person.username}</span>
                    </div>
                </div>
                <button class="btn-follow-small not-following" onclick="doPeopleAction('unblock','${person.username}',this)">Unblock</button>
            </div>`;
        }).join('');
    }
    openModal('blocked-users-modal');
};

window.closeBlockedUsersModal = function() { closeModal('blocked-users-modal'); };

// ============================================================
// NOTIFICATIONS
// ============================================================

let notificationPollTimer = null;

function fetchNotifications() {
    if (state.userRole !== 'logged-in') return;
    fetch('/api/notifications/', { headers: { 'X-CSRFToken': getCookie('csrftoken') }, credentials: 'same-origin' })
        .then(res => res.json())
        .then(data => {
            const notifications = data.notifications || [];
            const container = document.getElementById('nav-notification-container');
            const badge = document.getElementById('notification-badge');
            const list = document.getElementById('notification-list');

            if (notifications.length === 0) {
                if (container) container.style.display = 'none';
                return;
            }

            if (container) container.style.display = 'flex';
            const unreadCount = notifications.filter(n => !n.is_read).length;
            if (badge) badge.style.display = unreadCount > 0 ? 'block' : 'none';

            if (list) {
                list.innerHTML = notifications.map(n => {
                    const avatarHtml = n.sender_avatar
                        ? `<img src="${n.sender_avatar}" class="notification-avatar">`
                        : `<div class="notification-avatar"><i class="ph ph-user"></i></div>`;
                    const timeStr = new Date(n.created_at).toLocaleString();
                    return `
                    <div class="notification-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" onclick="markNotificationRead(${n.id}, this)">
                        ${avatarHtml}
                        <div class="notification-content">
                            <span class="notification-text">${n.message}</span>
                            <span class="notification-time">${timeStr}</span>
                        </div>
                    </div>`;
                }).join('');
            }
        })
        .catch(err => console.error('Notification fetch error:', err));
}

window.toggleNotifications = function() {
    const dropdown = document.getElementById('notification-dropdown');
    if (dropdown) dropdown.classList.toggle('active');
};

window.markNotificationRead = function(id, el) {
    fetch('/api/notifications/read/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
        credentials: 'same-origin',
        body: JSON.stringify({ id })
    }).then(() => {
        if (el) el.classList.remove('unread');
        fetchNotifications();
    });
};

window.markAllNotificationsRead = function() {
    fetch('/api/notifications/read/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
        credentials: 'same-origin',
        body: JSON.stringify({})
    }).then(() => {
        fetchNotifications();
        const dropdown = document.getElementById('notification-dropdown');
        if (dropdown) dropdown.classList.remove('active');
    });
};

window.globalHandleLocation = function() {
    closeModal('explore-modal');
    closeModal('feed-modal');
    closeModal('people-modal');
    handleLocation();
};

// Theming Logic
function applyTheme() {
    const db = getDbData();
    let themeToApply = db.settings.theme;
    
    if (themeToApply === 'random') {
        const themes = ['jungle', 'ocean', 'desert'];
        themeToApply = themes[Math.floor(Math.random() * themes.length)];
    }
    
    document.documentElement.setAttribute('data-theme', themeToApply);
    document.documentElement.setAttribute('data-mode', db.settings.mode);

    if (map) {
        setMapTiles(themeToApply);
    }
}

window.saveSettings = function() {
    const db = getDbData();
    db.settings.theme = document.getElementById('theme-select').value;
    db.settings.mode = document.getElementById('mode-select').value;
    saveDbData(db);
    
    const isPrivate = document.getElementById('setting-is-private').checked;
    const showGender = document.getElementById('setting-show-gender').checked;
    const showCity = document.getElementById('setting-show-city').checked;
    const showBudget = document.getElementById('setting-show-budget').checked;
    
    applyTheme();
    closeModal('settings-modal');

    if (state.userRole === 'logged-in') {
        fetch('/api/settings/update/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                preferred_theme: db.settings.theme,
                preferred_mode: db.settings.mode,
                is_private: isPrivate,
                privacy_settings: {
                    private_account: isPrivate,
                    show_gender: showGender,
                    show_city: showCity,
                    show_budget: showBudget
                }
            })
        }).catch(err => console.error('Settings save error:', err));
    }
}

window.toggleProfileVisibility = function(isPrivate) {
    const slider = document.getElementById('visibility-slider');
    const knob = document.getElementById('visibility-knob');
    const label = document.getElementById('profile-visibility-label');
    const desc = document.getElementById('profile-visibility-desc');
    if (slider) slider.style.background = isPrivate ? '#e11d48' : '#10b981';
    if (knob) knob.style.transform = isPrivate ? 'translateX(24px)' : 'translateX(0)';
    if (label) label.textContent = isPrivate ? 'Private Profile' : 'Public Profile';
    if (desc) desc.textContent = isPrivate ? 'Only accepted followers can see your posts.' : 'Everyone can see your diary posts in the global feed.';
    const settingToggle = document.getElementById('setting-is-private');
    if (settingToggle) settingToggle.checked = isPrivate;
    if (state.userRole === 'logged-in') {
        fetch('/api/settings/update/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
            credentials: 'same-origin',
            body: JSON.stringify({ is_private: isPrivate })
        }).then(r => r.json()).then(() => loadMapPostPins()).catch(err => console.error(err));
    }
};

// Auth Logic
// Helper for CSRF token
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}
const csrftoken = getCookie('csrftoken');

window.handleAuthAction = function() {
    toggleDropdown();
    if (state.userRole === 'logged-in') {
        // Logout via backend using a fresh CSRF token
        const freshToken = getCookie('csrftoken');
        fetch('/api/logout/', {
            method: 'POST',
            headers: { 'X-CSRFToken': freshToken }
        }).then(res => res.json()).then(data => {
            state.userRole = 'anonymous';
            const db = getDbData();
            db.currentUser = null;
            saveDbData(db);
            updateNavState();
            // Force reload to clear all states and cache
            window.location.reload();
        }).catch(err => console.error(err));
    } else {
        const loginForm = document.getElementById('login-form');
        const signupForm = document.getElementById('signup-form');
        const otpForm = document.getElementById('otp-form');
        if (loginForm) loginForm.reset();
        if (signupForm) signupForm.reset();
        if (otpForm) otpForm.reset();

        openModal('auth-modal');
        toggleAuthMode('login');
    }
}

window.toggleAuthMode = function(mode) {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const otpForm = document.getElementById('otp-form');
    const title = document.getElementById('auth-title');

    loginForm.style.display = 'none';
    signupForm.style.display = 'none';
    otpForm.style.display = 'none';

    if (mode === 'login') {
        loginForm.style.display = 'block';
        title.textContent = 'Login';
    } else if (mode === 'signup') {
        signupForm.style.display = 'block';
        title.textContent = 'Sign Up';
    } else if (mode === 'otp') {
        otpForm.style.display = 'block';
        title.textContent = 'Verify Email';
    }
}

function updateNavState() {
    const imgElement = document.getElementById('avatar-img');
    const placeholder = document.getElementById('avatar-img-placeholder');
    const loginText = document.getElementById('login-text');
    const loginIcon = document.getElementById('login-icon');
    const db = getDbData();

    if (state.userRole === 'logged-in' && db.currentUser) {
        const avatarSrc = db.currentUser.avatar || `https://i.pravatar.cc/150?u=${db.currentUser.email}`;
        imgElement.src = avatarSrc;
        imgElement.style.display = 'block';
        placeholder.style.display = 'none';
        loginText.textContent = 'Logout';
        loginIcon.className = 'ph ph-sign-out';

        const fab = document.querySelector('.global-location-btn');
        if (fab) fab.classList.remove('pulse-splash');

        const profileBtn = document.getElementById('nav-profile-btn');
        if (profileBtn) profileBtn.style.display = 'flex';
        const feedBtn = document.getElementById('nav-feed-btn');
        if (feedBtn) feedBtn.style.display = 'flex';
        const peopleBtn = document.getElementById('nav-people-btn');
        if (peopleBtn) peopleBtn.style.display = 'flex';

        fetchNotifications();
    } else {
        imgElement.style.display = 'none';
        placeholder.style.display = 'flex';
        loginText.textContent = 'Login / Sign Up';
        loginIcon.className = 'ph ph-sign-in';

        const fab = document.querySelector('.global-location-btn');
        if (fab && !state.locationPermission) fab.classList.add('pulse-splash');

        const profileBtn = document.getElementById('nav-profile-btn');
        if (profileBtn) profileBtn.style.display = 'none';
        const feedBtn = document.getElementById('nav-feed-btn');
        if (feedBtn) feedBtn.style.display = 'none';
        const peopleBtn = document.getElementById('nav-people-btn');
        if (peopleBtn) peopleBtn.style.display = 'none';

        const notifContainer = document.getElementById('nav-notification-container');
        if (notifContainer) notifContainer.style.display = 'none';
    }
}

// UI Dropdown & Modals
window.toggleDropdown = function() {
    document.getElementById('user-dropdown').classList.toggle('active');
}
window.openModal = function(id) { 
    document.getElementById(id).classList.add('active'); 
    if (id === 'post-modal') {
        // Wait for the modal to be visible before sizing the map
        setTimeout(() => {
            const mapStyleKey = ((getDbData() || {}).settings || {}).mapStyle || 'liberty';
            const styleUrl = mapStyleUrls[mapStyleKey] || 'https://tiles.openfreemap.org/styles/liberty';
            
            const applyLocation = () => {
                if (window.lastPickedLocation) {
                    window.postMinimap.setCenter([window.lastPickedLocation.lng, window.lastPickedLocation.lat]);
                    window.postMinimap.setZoom(8);
                    if (window.postMinimapMarker) window.postMinimapMarker.remove();
                    window.postMinimapMarker = new maplibregl.Marker({ color: '#e11d48' })
                        .setLngLat([window.lastPickedLocation.lng, window.lastPickedLocation.lat])
                        .addTo(window.postMinimap);
                    document.getElementById('post-latitude').value = window.lastPickedLocation.lat;
                    document.getElementById('post-longitude').value = window.lastPickedLocation.lng;
                    document.getElementById('post-location-status').textContent = 'Location set: ' + window.lastPickedLocation.lat.toFixed(4) + ', ' + window.lastPickedLocation.lng.toFixed(4);
                }
            };
            
            if (!window.postMinimap) {
                window.postMinimapMarker = null;
                window.postMinimap = new maplibregl.Map({
                    container: 'post-minimap',
                    style: styleUrl,
                    center: [0, 20],
                    zoom: 1.5
                });
                window.postMinimap.scrollZoom.disable();
                window.postMinimap.dragRotate.disable();
                window.postMinimap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
                
                window.postMinimap.on('click', (e) => {
                    if (window.postMinimapMarker) window.postMinimapMarker.remove();
                    window.postMinimapMarker = new maplibregl.Marker({ color: '#e11d48' })
                        .setLngLat(e.lngLat)
                        .addTo(window.postMinimap);
                    document.getElementById('post-latitude').value = e.lngLat.lat;
                    document.getElementById('post-longitude').value = e.lngLat.lng;
                    document.getElementById('post-location-status').textContent = 'Location set: ' + e.lngLat.lat.toFixed(4) + ', ' + e.lngLat.lng.toFixed(4);
                    window.lastPickedLocation = e.lngLat;
                });
                
                window.postMinimap.on('load', () => {
                    window.postMinimap.resize();
                    applyLocation();
                });
            } else {
                window.postMinimap.resize();
                applyLocation();
            }
        }, 350);
    }
}
window.closeModal = function(id) { 
    document.getElementById(id).classList.remove('active'); 
    if (id === 'auth-modal') {
        const lf = document.getElementById('login-form'); if(lf) lf.reset();
        const sf = document.getElementById('signup-form'); if(sf) sf.reset();
        const of = document.getElementById('otp-form'); if(of) of.reset();
    }
}

window.switchView = function(viewId) {
    if (viewId === 'map-view') {
        closeModal('feed-modal');
        closeModal('people-modal');
        closeModal('user-profile-modal');
        closeModal('settings-modal');
        closeModal('auth-modal');
        closeModal('profile-view');
        document.getElementById('map-view').style.display = 'block';
        const sb = document.querySelector('.search-bar-container');
        if (sb) sb.style.display = 'flex';
        const ss = document.getElementById('map-style-switcher');
        if (ss) ss.style.display = 'flex';
    } else if (viewId === 'feed-view') {
        if (state.userRole !== 'logged-in') return;
        openModal('feed-modal');
    } else if (viewId === 'people-view') {
        if (state.userRole !== 'logged-in') return;
        openModal('people-modal');
        loadPeopleData('followers');
    } else if (viewId === 'profile-view') {
        openModal('profile-view');
        closeModal('explore-modal');
        closeModal('feed-modal');
        closeModal('people-modal');
        const sb = document.querySelector('.search-bar-container');
        if (sb) sb.style.display = 'none';
        const ss = document.getElementById('map-style-switcher');
        if (ss) ss.style.display = 'none';
    }

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.target === viewId) btn.classList.add('active');
    });

    if (viewId === 'map-view') {
        setTimeout(() => { map.invalidateSize(); }, 100);
    }

    state.currentView = viewId;
}

// Close profile without opening explore modal
window.closeProfileView = function() {
    closeModal('profile-view');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const mapBtn = document.querySelector('[data-target="map-view"]');
    if (mapBtn) mapBtn.classList.add('active');
    state.currentView = 'map-view';
    const sb = document.querySelector('.search-bar-container');
    if (sb) sb.style.display = 'flex';
    const ss = document.getElementById('map-style-switcher');
    if (ss) ss.style.display = 'flex';
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Override default alert
    window.alert = function(message, type = 'error') {
        const modal = document.getElementById('theme-alert-modal');
        const container = document.getElementById('theme-alert-container');
        const iconWrap = document.getElementById('theme-alert-icon-wrap');
        const icon = document.getElementById('theme-alert-icon');
        const title = document.getElementById('theme-alert-title');
        const msgEl = document.getElementById('theme-alert-message');
        const okBtn = document.getElementById('theme-alert-ok-btn');
        
        if (modal && msgEl) {
            msgEl.textContent = message;
            
            if (type === 'success') {
                // Green success theme
                iconWrap.style.color = '#10b981';
                icon.className = 'ph-fill ph-check-circle';
                title.textContent = 'Success';
                title.style.color = '#10b981';
                container.style.borderLeft = '5px solid #10b981';
                okBtn.style.background = '#10b981';
                okBtn.style.borderColor = '#059669';
            } else {
                // Red error/attention theme
                iconWrap.style.color = '#e11d48';
                icon.className = 'ph-fill ph-warning-circle';
                title.textContent = 'Attention';
                title.style.color = '#fff';
                container.style.borderLeft = '5px solid #e11d48';
                okBtn.style.background = '#e11d48';
                okBtn.style.borderColor = '#be123c';
            }
            
            openModal('theme-alert-modal');
        } else {
            console.warn('Theme alert modal not found, fallback:', message);
        }
    };

    initMap();
    applyTheme();
    updateNavState();

    // Reusable function to fetch profile and sync avatar + preferences
    window.fetchAndSyncAvatar = function() {
        fetch('/api/profile/', { 
            headers: { 'X-CSRFToken': getCookie('csrftoken') },
            credentials: 'same-origin'
        })
        .then(res => {
            if (res.ok) return res.json();
            throw new Error('Not logged in');
        })
        .then(data => {
            state.userRole = 'logged-in';
            const db = getDbData();
            db.currentUser = db.currentUser || {};
            db.currentUser.name = data.username;
            db.currentUser.email = data.email;
            if (data.profile_picture) {
                db.currentUser.avatar = data.profile_picture;
            }

            // Sync preferences from DB (cross-device)
            if (data.preferred_theme) db.settings.theme = data.preferred_theme;
            if (data.preferred_mode) db.settings.mode = data.preferred_mode;
            if (data.preferred_map_style) db.settings.mapStyle = data.preferred_map_style;

            saveDbData(db);
            updateNavState();
            applyTheme();

            // Apply map style preference
            if (data.preferred_map_style && mapStyleUrls && mapStyleUrls[data.preferred_map_style]) {
                const savedPill = document.querySelector(`.style-pill[data-style="${data.preferred_map_style}"]`);
                if (savedPill) {
                    document.querySelectorAll('.style-pill').forEach(p => p.classList.remove('active'));
                    savedPill.classList.add('active');
                    const toggleIcon = document.getElementById('style-toggle-icon');
                    if (toggleIcon) toggleIcon.textContent = savedPill.dataset.icon;
                    if (map && map.isStyleLoaded && map.isStyleLoaded()) {
                        map.setStyle(mapStyleUrls[data.preferred_map_style]);
                    }
                }
            }
            
            // Sync privacy settings to UI
            if (data.privacy_settings) {
                document.getElementById('setting-is-private').checked = data.privacy_settings.private_account || false;
                document.getElementById('setting-show-gender').checked = data.privacy_settings.show_gender !== false;
                document.getElementById('setting-show-city').checked = data.privacy_settings.show_city !== false;
                document.getElementById('setting-show-budget').checked = data.privacy_settings.show_budget !== false;
            }
        })
        .catch(() => {
            state.userRole = 'anonymous';
            updateNavState();
        });
    };

    // Check session on page load
    fetchAndSyncAvatar();

    // --- Map Style Switcher (Collapsible Circle + DB Persistence) ---
    // mapStyleUrls is defined at module scope (top of file)

    const styleSwitcher = document.getElementById('map-style-switcher');
    const styleToggleBtn = document.getElementById('style-toggle-btn');
    const styleToggleIcon = document.getElementById('style-toggle-icon');

    // Toggle expand/collapse
    styleToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        styleSwitcher.classList.toggle('expanded');
    });

    // Close tray when clicking outside
    document.addEventListener('click', (e) => {
        if (styleSwitcher && !styleSwitcher.contains(e.target)) {
            styleSwitcher.classList.remove('expanded');
        }
        // Close notification dropdown when clicking outside
        const notifDropdown = document.getElementById('notification-dropdown');
        const notifContainer = document.getElementById('nav-notification-container');
        if (notifDropdown && notifDropdown.classList.contains('active') &&
            notifContainer && !notifContainer.contains(e.target)) {
            notifDropdown.classList.remove('active');
        }
        // Close user dropdown when clicking outside
        const userDropdown = document.getElementById('user-dropdown');
        const avatarBtn = document.getElementById('btn-avatar');
        if (userDropdown && userDropdown.classList.contains('active') &&
            !userDropdown.contains(e.target) && avatarBtn && !avatarBtn.contains(e.target)) {
            userDropdown.classList.remove('active');
        }
        // Close modal-overlay when clicking on empty overlay space
        if (e.target.classList && e.target.classList.contains('modal-overlay')) {
            e.target.classList.remove('active');
            if (e.target.id === 'profile-view' || e.target.id === 'explore-modal') {
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                const btn = document.querySelector('[data-target="map-view"]');
                if (btn) btn.classList.add('active');
                state.currentView = 'map-view';
                const sb = document.querySelector('.search-bar-container');
                if (sb) sb.style.display = 'flex';
                const ss = document.getElementById('map-style-switcher');
                if (ss) ss.style.display = 'flex';
            }
        }
    });

    // Poll notifications every 30 seconds for logged-in users
    setInterval(() => { if (state.userRole === 'logged-in') fetchNotifications(); }, 30000);

    // Persist settings to database
    function saveSettingsToDB(settings) {
        if (state.userRole !== 'logged-in') return; // Only save for logged-in users
        fetch('/api/settings/update/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            credentials: 'same-origin',
            body: JSON.stringify(settings)
        }).catch(err => console.error('Settings save error:', err));
    }

    // Style pill click handler
    document.querySelectorAll('.style-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            e.stopPropagation();
            const styleName = pill.dataset.style;
            const styleUrl = mapStyleUrls[styleName];
            const iconEmoji = pill.dataset.icon;
            if (!styleUrl || !map) return;

            // Update active state
            document.querySelectorAll('.style-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            // Update toggle icon to show the selected style
            styleToggleIcon.textContent = iconEmoji;

            // Change map style
            map.setStyle(styleUrl);

            // Collapse the tray after selection
            setTimeout(() => styleSwitcher.classList.remove('expanded'), 200);

            // Persist to localStorage + DB
            const db = getDbData();
            db.settings.mapStyle = styleName;
            saveDbData(db);
            saveSettingsToDB({ preferred_map_style: styleName });
        });
    });

    // Apply saved map style from localStorage on load
    const db = getDbData();
    if (db.settings.mapStyle && mapStyleUrls[db.settings.mapStyle]) {
        const savedPill = document.querySelector(`.style-pill[data-style="${db.settings.mapStyle}"]`);
        if (savedPill) {
            document.querySelectorAll('.style-pill').forEach(p => p.classList.remove('active'));
            savedPill.classList.add('active');
            styleToggleIcon.textContent = savedPill.dataset.icon;
            // Apply the saved style when map loads
            map.on('load', () => {
                if (db.settings.mapStyle !== 'liberty') {
                    map.setStyle(mapStyleUrls[db.settings.mapStyle]);
                }
            });
        }
    }

    // Search Logic
    let searchTimeout;
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const searchDropdown = document.getElementById('search-dropdown');

    const handleSearch = () => {
        const query = searchInput.value.trim();
        if (!query) {
            searchDropdown.classList.remove('active');
            return;
        }

        const coordMatch = query.match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
        if (coordMatch) {
            const lat = parseFloat(coordMatch[1]);
            const lng = parseFloat(coordMatch[3]);
            map.flyTo({ center: [lng, lat], zoom: 12, duration: 2000 });
            searchDropdown.classList.remove('active');
            new maplibregl.Marker({ color: '#e11d48' }).setLngLat([lng, lat]).addTo(map);
            return;
        }

        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`)
            .then(res => res.json())
            .then(data => {
                searchDropdown.innerHTML = '';
                if (data.length === 0) {
                    searchDropdown.innerHTML = '<div class="search-item" style="color: var(--text-secondary);">No results found</div>';
                } else {
                    data.forEach(place => {
                        const div = document.createElement('div');
                        div.className = 'search-item';
                        div.innerHTML = `<i class="ph ph-map-pin"></i> ${place.display_name}`;
                        div.onclick = () => {
                            const lat = parseFloat(place.lat);
                            const lon = parseFloat(place.lon);
                            map.flyTo({ center: [lon, lat], zoom: 12, duration: 2000 });
                            searchInput.value = place.display_name;
                            searchDropdown.classList.remove('active');
                            new maplibregl.Marker({ color: '#e11d48' }).setLngLat([lon, lat]).addTo(map);
                        };
                        searchDropdown.appendChild(div);
                    });
                }
                searchDropdown.classList.add('active');
            })
            .catch(err => console.error("Search error:", err));
    };

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                if(searchInput.value.length > 2) handleSearch();
            }, 500);
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(searchTimeout);
                handleSearch();
            }
        });
    }
    if (searchBtn) {
        searchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            clearTimeout(searchTimeout);
            handleSearch();
        });
    }
    
    document.addEventListener('click', (e) => {
        if (searchDropdown && searchDropdown.classList.contains('active') && !e.target.closest('.search-bar-container')) {
            searchDropdown.classList.remove('active');
        }
    });
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchView(e.currentTarget.dataset.target);
        });
    });

    // Auth Forms using Backend
    let pendingSignupEmail = '';

    document.getElementById('signup-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('signup-username').value;
        const email = document.getElementById('signup-email').value;
        const pass = document.getElementById('signup-password').value;
        const confirmPass = document.getElementById('signup-confirm-password').value;
        
        if (pass !== confirmPass) {
            alert("Passwords do not match!");
            return;
        }

        pendingSignupEmail = email;
        toggleAuthMode('otp');

        fetch('/api/signup/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken') || csrftoken
            },
            body: JSON.stringify({ username, email, password: pass })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
                toggleAuthMode('signup');
            }
        })
        .catch(err => {
            console.error(err);
            toggleAuthMode('signup');
        });
    });

    document.getElementById('otp-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const otp = document.getElementById('otp-code').value;

        fetch('/api/verify-otp/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken') || csrftoken
            },
            body: JSON.stringify({ email: pendingSignupEmail, otp })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
            } else {
                const db = getDbData();
                db.currentUser = { name: data.user.username, email: data.user.email };
                saveDbData(db);
                state.userRole = 'logged-in';
                updateNavState();
                closeModal('auth-modal');
                // Show theme-based success popup
                openModal('success-popup');
                // Immediately fetch profile to sync avatar
                fetchAndSyncAvatar();
            }
        })
        .catch(err => console.error(err));
    });

    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;

        fetch('/api/login/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken') || csrftoken
            },
            credentials: 'same-origin',
            body: JSON.stringify({ email, password: pass })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
            } else {
                const db = getDbData();
                db.currentUser = { name: data.user.username, email: data.user.email };
                saveDbData(db);
                state.userRole = 'logged-in';
                updateNavState();
                closeModal('auth-modal');
                // Immediately fetch profile to sync avatar
                fetchAndSyncAvatar();
                // Reload map post pins for the new session
                setTimeout(() => loadMapPostPins(), 500);
            }
        })
        .catch(err => console.error(err));
    });




    // --- Profile Logic ---
    let currentProfilePicBase64 = '';
    
    const picFile = document.getElementById('profile-pic-file');
    if (picFile) {
        picFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    currentProfilePicBase64 = ev.target.result;
                    const img = document.getElementById('profile-pic-preview');
                    img.src = currentProfilePicBase64;
                    document.getElementById('profile-pic-preview-container').style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });
    }

    const loadProfile = () => {
        fetch('/api/profile/', { headers: { 'X-CSRFToken': getCookie('csrftoken') || csrftoken }, credentials: 'same-origin' })
        .then(res => res.json())
        .then(data => {
            document.getElementById('profile-username').value = data.username || '';
            document.getElementById('profile-gender').value = data.gender || '';
            document.getElementById('profile-dob').value = data.date_of_birth || '';
            document.getElementById('profile-city').value = data.city || '';
            document.getElementById('profile-destination').value = data.destination || '';
            document.getElementById('profile-status').value = data.status || '';
            
            const db = getDbData();
            if (db.currentUser) {
                db.currentUser.name = data.username;
                if (data.profile_picture) {
                    currentProfilePicBase64 = data.profile_picture;
                    const img = document.getElementById('profile-pic-preview');
                    img.src = currentProfilePicBase64;
                    document.getElementById('profile-pic-preview-container').style.display = 'block';
                    db.currentUser.avatar = currentProfilePicBase64;
                }
                saveDbData(db);
                updateNavState();
            }

            // Sync visibility toggle
            const isPrivate = !!data.is_private;
            const toggle = document.getElementById('profile-is-private-toggle');
            const slider = document.getElementById('visibility-slider');
            const knob = document.getElementById('visibility-knob');
            const label = document.getElementById('profile-visibility-label');
            const desc = document.getElementById('profile-visibility-desc');
            if (toggle) toggle.checked = isPrivate;
            if (slider) slider.style.background = isPrivate ? '#e11d48' : '#10b981';
            if (knob) knob.style.transform = isPrivate ? 'translateX(24px)' : 'translateX(0)';
            if (label) label.textContent = isPrivate ? 'Private Profile' : 'Public Profile';
            if (desc) desc.textContent = isPrivate ? 'Only accepted followers can see your posts.' : 'Everyone can see your diary posts in the global feed.';

            // Sync settings modal toggle too
            const settingIsPrivate = document.getElementById('setting-is-private');
            if (settingIsPrivate) settingIsPrivate.checked = isPrivate;
            const ps = data.privacy_settings || {};
            const el = (id) => document.getElementById(id);
            if (el('setting-show-gender')) el('setting-show-gender').checked = ps.show_gender !== false;
            if (el('setting-show-city')) el('setting-show-city').checked = ps.show_city !== false;
            if (el('setting-show-budget')) el('setting-show-budget').checked = ps.show_budget !== false;
        }).catch(err => console.error(err));
    };

    // Hook loadProfile into nav-profile-btn if we had one, or just when switching to profile-view
    const originalSwitchView = window.switchView;
    window.switchView = function(viewId) {
        originalSwitchView(viewId);
        if (viewId === 'profile-view' && state.userRole === 'logged-in') {
            loadProfile();
        }
    };

    document.getElementById('profile-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const body = {
            username: document.getElementById('profile-username').value,
            gender: document.getElementById('profile-gender').value,
            date_of_birth: document.getElementById('profile-dob').value,
            city: document.getElementById('profile-city').value,
            destination: document.getElementById('profile-destination').value,
            status: document.getElementById('profile-status').value,
            profile_picture: currentProfilePicBase64,
        };
        fetch('/api/profile/update/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') || csrftoken },
            body: JSON.stringify(body)
        }).then(res => res.json()).then(data => {
            if (data.error) alert(data.error);
            else {
                alert('Profile saved successfully!', 'success');
                // Update local DB to reflect changes in UI (avatar, etc)
                const db = getDbData();
                if (db.currentUser) {
                    db.currentUser.avatar = currentProfilePicBase64;
                    db.currentUser.name = document.getElementById('profile-username').value;
                    saveDbData(db);
                    updateNavState();
                }
            }
        }).catch(err => console.error(err));
    });

    document.getElementById('btn-request-password-otp').addEventListener('click', (e) => {
        e.preventDefault();
        e.target.disabled = true;
        e.target.textContent = "Sending...";
        const freshCsrf = getCookie('csrftoken');
        fetch('/api/password-change-request/', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRFToken': freshCsrf 
            },
            credentials: 'same-origin',
            body: JSON.stringify({})
        }).then(res => {
            if (!res.ok) {
                return res.text().then(t => { throw new Error(t); });
            }
            return res.json();
        }).then(data => {
            e.target.disabled = false;
            e.target.textContent = "Request OTP to Email";
            if (data.error) alert(data.error);
            else {
                document.getElementById('password-change-form').style.display = 'flex';
                alert('OTP sent to your email!', 'success');
            }
        }).catch(err => {
            e.target.disabled = false;
            e.target.textContent = "Request OTP to Email";
            alert('Failed to send OTP. Please try again.');
            console.error('Password change request error:', err);
        });
    });

    document.getElementById('password-change-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const otp = document.getElementById('password-change-otp').value;
        const newPass = document.getElementById('password-change-new').value;
        const confirmPass = document.getElementById('password-change-confirm').value;
        
        if (newPass !== confirmPass) {
            alert("Passwords do not match!");
            return;
        }

        fetch('/api/password-change-verify/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') || csrftoken },
            body: JSON.stringify({ otp: otp, new_password: newPass })
        }).then(res => res.json()).then(data => {
            if (data.error) alert(data.error);
            else {
                alert('Password changed successfully!', 'success');
                document.getElementById('password-change-form').reset();
                document.getElementById('password-change-form').style.display = 'none';
            }
        }).catch(err => console.error(err));
    });

    // --- Feed & Post Logic ---
    const loadFeed = () => {
        fetch('/api/feed/')
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById('feed-container');
            if (!container) return;
            container.innerHTML = '';
            
            if (data.feed.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No posts yet.</p>';
                return;
            }

            data.feed.forEach(post => {
                const card = document.createElement('div');
                card.className = 'post-card diary-entry';
                card.style.padding = '1.5rem';
                card.style.marginBottom = '2.5rem';
                card.style.background = 'url("https://www.transparenttextures.com/patterns/old-paper.png") #f4ecd8';
                card.style.borderRadius = '8px';
                card.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
                card.style.color = '#4a3b2c';
                card.style.fontFamily = 'var(--font-handwriting)';
                card.style.position = 'relative';

                let mediaHtml = '';
                if (post.media_items && post.media_items.length > 0) {
                    mediaHtml += '<div style="display: flex; gap: 1rem; overflow-x: auto; padding-bottom: 1rem; margin-top: 1rem; align-items: center;">';
                    post.media_items.forEach(item => {
                        if (item.media_type === 'video') {
                            mediaHtml += `<div style="flex-shrink: 0; width: 300px; cursor: pointer;" onclick="window.openLightbox('${item.media_url}', 'video')"><video src="${item.media_url}" style="width: 100%; border-radius: 4px; border: 4px solid #fff; box-shadow: 2px 2px 8px rgba(0,0,0,0.2); pointer-events: none;"></video></div>`;
                        } else {
                            mediaHtml += `<div class="polaroid" onclick="window.openLightbox('${item.media_url}', 'image')" style="flex-shrink: 0; width: 250px; background: white; padding: 10px 10px 30px 10px; box-shadow: 2px 4px 10px rgba(0,0,0,0.3); transform: rotate(${Math.random()*4-2}deg); cursor: pointer;"><img src="${item.media_url}" style="width: 100%; border-radius: 2px; object-fit: cover;"></div>`;
                        }
                    });
                    mediaHtml += '</div>';
                }

                let commentsHtml = '';
                post.comments.forEach(comment => {
                    commentsHtml += `<div style="font-size: 1.1rem; margin-top: 0.5rem; border-bottom: 1px dashed rgba(74, 59, 44, 0.3); padding-bottom: 0.2rem;"><strong>${comment.user__username}:</strong> ${comment.text}</div>`;
                });

                card.innerHTML = `
                    <div class="tape" style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%) rotate(${Math.random()*6 - 3}deg); width: 80px; height: 25px; background: rgba(255,255,255,0.6); border-left: 2px dashed rgba(0,0,0,0.1); border-right: 2px dashed rgba(0,0,0,0.1); box-shadow: 0 1px 3px rgba(0,0,0,0.2);"></div>
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 1rem; cursor: pointer; border-radius: 50px; padding: 0.5rem; background: rgba(255,255,255,0.3); transition: background 0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.6)'" onmouseout="this.style.background='rgba(255,255,255,0.3)'" onclick="openUserProfile('${post.user}')">
                            <img src="${post.user_avatar || 'https://i.pravatar.cc/100?u=' + post.user}" style="width: 50px; height: 50px; border-radius: 50%; border: 2px solid #4a3b2c; box-shadow: 1px 1px 5px rgba(0,0,0,0.2); object-fit: cover;">
                            <div>
                                <strong style="font-size: 1.3rem;">${post.user}</strong>
                                <div style="font-size: 1rem; color: #78350f;"><i class="ph ph-map-pin"></i> ${post.destination_name || 'Unknown Location'}</div>
                            </div>
                        </div>
                        <button class="btn-journal-locate" onclick="openUserProfile('${post.user}')" style="padding: 0.4rem 0.8rem; border-radius: 8px; border: 1px solid #4a3b2c; background: transparent; color: #4a3b2c; font-weight: bold; cursor: pointer; font-size: 0.8rem; text-transform: uppercase;">
                            <i class="ph ph-user"></i> View Profile
                        </button>
                    </div>
                    ${mediaHtml}
                    <p style="margin-top: 1.5rem; font-size: 1.4rem; line-height: 1.5; font-style: italic;">"${post.description}"</p>
                    <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 1rem;">
                        ${post.budget ? `<span style="background: rgba(22, 163, 74, 0.1); color: #16a34a; font-weight: bold; padding: 0.2rem 0.6rem; border-radius: 4px; font-family: var(--font-sans); border: 1px dashed #16a34a;">Budget: $${post.budget}</span>` : ''}
                        ${post.nuances ? `<span style="background: rgba(234, 88, 12, 0.1); color: #ea580c; font-size: 0.9rem; padding: 0.2rem 0.6rem; border-radius: 4px; font-family: var(--font-sans); border: 1px dashed #ea580c;">Tags: ${post.nuances}</span>` : ''}
                    </div>
                    
                    <div style="margin-top: 1.5rem; border-top: 2px dashed rgba(74, 59, 44, 0.3); padding-top: 1rem;">
                        <h4 style="font-size: 1.2rem; color: #4a3b2c; margin-bottom: 0.5rem; font-family: var(--font-serif);">Scribbles & Notes</h4>
                        ${commentsHtml}
                        <form onsubmit="event.preventDefault(); window.submitComment(${post.id}, this);" style="display: flex; gap: 0.5rem; margin-top: 1rem; align-items: center;">
                            <input type="text" name="comment" placeholder="Add a scribble..." style="flex: 1; padding: 0.5rem; background: transparent; border: none; border-bottom: 1px solid #4a3b2c; color: #4a3b2c; font-family: var(--font-handwriting); font-size: 1.2rem; outline: none;" required>
                            <button type="submit" style="background: transparent; border: none; color: #4a3b2c; cursor: pointer; font-size: 1.8rem; transform: rotate(15deg); transition: transform 0.2s;" onmouseover="this.style.transform='rotate(0deg) scale(1.1)'" onmouseout="this.style.transform='rotate(15deg)'"><i class="ph-fill ph-paper-plane-tilt"></i></button>
                        </form>
                    </div>
                `;
                container.appendChild(card);
            });
        }).catch(err => console.error("Error loading feed:", err));
    };

    window.openLightbox = function(url, type) {
        const lbContent = document.getElementById('lightbox-content');
        if (type === 'video') {
            lbContent.innerHTML = `<video src="${url}" controls autoplay style="max-width: 100%; max-height: 80vh; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);"></video>`;
        } else {
            lbContent.innerHTML = `<img src="${url}" style="max-width: 100%; max-height: 80vh; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">`;
        }
        openModal('lightbox-modal');
    };

    window.submitComment = function(postId, form) {
        if (state.userRole !== 'logged-in') {
            alert("You must be logged in to comment.");
            return;
        }
        const text = form.comment.value;
        fetch('/api/post/comment/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken },
            body: JSON.stringify({ post_id: postId, text: text })
        }).then(res => res.json()).then(data => {
            if (data.error) alert(data.error);
            else {
                form.reset();
                loadFeed(); // Reload feed to show comment
            }
        }).catch(err => console.error(err));
    };

    // Hook loadFeed to switchView
    const prevSwitchView = window.switchView;
    window.switchView = function(viewId) {
        prevSwitchView(viewId);
        if (viewId === 'feed-view') {
            loadFeed();
            if (state.userRole === 'logged-in') {
                document.getElementById('btn-open-post-modal').style.display = 'block';
            } else {
                document.getElementById('btn-open-post-modal').style.display = 'none';
            }
        }
    };

    const btnOpenPostModal = document.getElementById('btn-open-post-modal');
    if (btnOpenPostModal) {
        btnOpenPostModal.addEventListener('click', () => {
            openModal('post-modal');
        });
        const postForm = document.getElementById('post-form');
        const imgInput = document.getElementById('post-media-images');
        const vidInput = document.getElementById('post-media-videos');
        const imgPreviews = document.getElementById('post-image-previews');
        const vidPreviews = document.getElementById('post-video-previews');

        let selectedMedia = [];

        const updatePreviews = () => {
            imgPreviews.innerHTML = '';
            vidPreviews.innerHTML = '';
            selectedMedia.forEach((m, idx) => {
                const wrap = document.createElement('div');
                wrap.style.position = 'relative';
                wrap.style.width = '60px';
                wrap.style.height = '60px';
                
                let el;
                if (m.type === 'image') {
                    el = document.createElement('img');
                    el.src = m.url;
                } else {
                    el = document.createElement('video');
                    el.src = m.url;
                    el.muted = true;
                }
                el.style.width = '100%';
                el.style.height = '100%';
                el.style.objectFit = 'cover';
                el.style.borderRadius = '4px';

                const rmBtn = document.createElement('button');
                rmBtn.innerHTML = '×';
                rmBtn.style.position = 'absolute';
                rmBtn.style.top = '-5px';
                rmBtn.style.right = '-5px';
                rmBtn.style.background = 'red';
                rmBtn.style.color = 'white';
                rmBtn.style.border = 'none';
                rmBtn.style.borderRadius = '50%';
                rmBtn.style.cursor = 'pointer';
                rmBtn.onclick = (e) => {
                    e.preventDefault();
                    selectedMedia.splice(idx, 1);
                    updatePreviews();
                };

                wrap.appendChild(el);
                wrap.appendChild(rmBtn);

                if (m.type === 'image') imgPreviews.appendChild(wrap);
                else vidPreviews.appendChild(wrap);
            });
        };

        const processFiles = (files, type) => {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (type === 'image') {
                    if (selectedMedia.filter(m => m.type === 'image').length >= 5) {
                        alert("Max 5 images allowed.");
                        break;
                    }
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        selectedMedia.push({ type: 'image', url: e.target.result });
                        updatePreviews();
                    };
                    reader.readAsDataURL(file);
                } else if (type === 'video') {
                    if (selectedMedia.filter(m => m.type === 'video').length >= 3) {
                        alert("Max 3 videos allowed.");
                        break;
                    }
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const videoVal = document.getElementById('hidden-video-validator');
                        videoVal.src = e.target.result;
                        videoVal.onloadedmetadata = () => {
                            if (videoVal.duration > 120) {
                                alert("Video exceeds 2 minutes limit.");
                                return;
                            }
                            selectedMedia.push({ type: 'video', url: e.target.result });
                            updatePreviews();
                        };
                    };
                    reader.readAsDataURL(file);
                }
            }
        };

        if (imgInput) imgInput.addEventListener('change', (e) => { processFiles(e.target.files, 'image'); e.target.value = ''; });
        if (vidInput) vidInput.addEventListener('change', (e) => { processFiles(e.target.files, 'video'); e.target.value = ''; });

        if (postForm) {
            postForm.addEventListener('submit', (e) => {
                e.preventDefault();
                
                const lat = document.getElementById('post-latitude').value;
                const lng = document.getElementById('post-longitude').value;
                
                if (!lat || !lng) {
                    alert("Location is mandatory. Please click on the map to select a point first.");
                    return;
                }

                if (selectedMedia.length === 0) {
                    alert("Please select at least one image or video.");
                    return;
                }

                const description = document.getElementById('post-description').value;
                const budget = document.getElementById('post-budget').value;
                const nuances = document.getElementById('post-nuances').value;
                
                // Get destination name using reverse geocoding
                fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
                .then(res => res.json())
                .then(data => {
                    const destName = data.address ? (data.address.city || data.address.town || data.address.village || data.address.country) : "Selected Location";

                    const media_items = selectedMedia.map(m => ({ media_url: m.url, media_type: m.type }));

                    const payload = {
                        description: description,
                        destination_name: destName,
                        latitude: parseFloat(lat),
                        longitude: parseFloat(lng),
                        budget: budget ? parseFloat(budget) : null,
                        nuances: nuances,
                        media_items: media_items
                    };

                    fetch('/api/post/create/', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') || csrftoken },
                        body: JSON.stringify(payload)
                    }).then(res => res.json()).then(data => {
                        if (data.error) {
                            alert(data.error);
                        } else {
                            closeModal('post-modal');
                            postForm.reset();
                            selectedMedia = [];
                            updatePreviews();
                            document.getElementById('post-location-status').textContent = 'Click on the map to set location';
                            document.getElementById('post-latitude').value = '';
                            document.getElementById('post-longitude').value = '';
                            if (window.postMinimapMarker) window.postMinimapMarker.remove();
                            
                            alert("Success: Your memory has been recorded in the diary!");
                            if(state.currentView === 'feed-view') loadFeed();
                            // Refresh map pins to show the new post
                            setTimeout(() => loadMapPostPins(), 400);
                        }
                    }).catch(err => console.error(err));
                }).catch(err => console.error(err));
            });
        }
    }

});
