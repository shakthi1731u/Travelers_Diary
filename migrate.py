import re
import shutil

# 1. style.css
with open('style.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Add rgb vars
css = css.replace('--bg-surface: #1B4D3E;', '--bg-surface: #1B4D3E;\n    --bg-surface-rgb: 27, 77, 62;')
css = css.replace('--bg-surface: #0a2540;', '--bg-surface: #0a2540;\n    --bg-surface-rgb: 10, 37, 64;')
css = css.replace('--bg-surface: #a35b22;', '--bg-surface: #a35b22;\n    --bg-surface-rgb: 163, 91, 34;')

# Replace search bar CSS
search_css = """/* Search Bar Floating */
.floating-search {
    position: absolute; top: 90px; left: 70px; z-index: 1000;
}
.search-bar-container {
    position: relative; display: flex; align-items: center; width: 100%; width: 350px;
}
.search-icon-left {
    position: absolute; left: 15px; color: var(--text-secondary); font-size: 1.2rem; pointer-events: none; z-index: 2;
}
.theme-search-bar {
    width: 100%; padding: 0.75rem 3rem 0.75rem 2.5rem; border-radius: 25px;
    background: rgba(var(--bg-surface-rgb, 255,255,255), 0.3);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid var(--glass-border);
    color: var(--text-primary); font-family: var(--font-main); font-size: 1rem;
    box-shadow: var(--glass-shadow); transition: all 0.3s;
}
.theme-search-bar::placeholder { color: var(--text-secondary); opacity: 0.8; }
.theme-search-bar:focus { outline: none; border-color: var(--accent-primary); box-shadow: 0 0 15px var(--accent-primary); }

.search-btn {
    position: absolute; right: 5px; top: 50%; transform: translateY(-50%);
    background: var(--accent-gradient); color: #fff;
    border: none; border-radius: 50%; width: 35px; height: 35px;
    display: flex; justify-content: center; align-items: center;
    cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.3); transition: transform 0.2s; z-index: 2;
}
.search-btn:hover { transform: translateY(-50%) scale(1.1); }

.search-dropdown {
    position: absolute; top: 110%; left: 0; width: 100%;
    background: rgba(var(--bg-surface-rgb, 255,255,255), 0.3);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--glass-border); border-radius: 12px;
    box-shadow: var(--glass-shadow);
    max-height: 300px; overflow-y: auto;
    display: none; flex-direction: column; z-index: 1001;
}
.search-dropdown.active { display: flex; }
.search-item {
    padding: 0.75rem 1rem; color: var(--text-primary); font-family: var(--font-main);
    border-bottom: 1px solid rgba(255,255,255,0.1); cursor: pointer;
    transition: background 0.2s; display: flex; align-items: center; gap: 0.5rem; text-align: left;
}
.search-item:last-child { border-bottom: none; }
.search-item:hover { background: rgba(255,255,255,0.2); }
"""

# Regex to replace existing floating search
css = re.sub(r'/\* Search Bar Floating \*/.*?\.theme-search-bar:focus \{.*?\}', search_css, css, flags=re.DOTALL)

with open('diary/static/diary/style.css', 'w', encoding='utf-8') as f:
    f.write(css)

# 2. modal-styles.css
shutil.copy('modal-styles.css', 'diary/static/diary/modal-styles.css')

# 3. app.js
with open('app.js', 'r', encoding='utf-8') as f:
    js = f.read()

search_js = """
// Search Logic
let searchTimeout;
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const searchDropdown = document.getElementById('search-dropdown');

    const handleSearch = () => {
        const query = searchInput.value.trim();
        if (!query) {
            searchDropdown.classList.remove('active');
            return;
        }

        // Check if lat, lng
        const coordMatch = query.match(/^(-?\\d+(\\.\\d+)?)\\s*,\\s*(-?\\d+(\\.\\d+)?)$/);
        if (coordMatch) {
            const lat = parseFloat(coordMatch[1]);
            const lng = parseFloat(coordMatch[3]);
            map.flyTo({ center: [lng, lat], zoom: 12, duration: 2000 });
            searchDropdown.classList.remove('active');
            new maplibregl.Marker({ color: '#e11d48' }).setLngLat([lng, lat]).addTo(map);
            return;
        }

        // Fetch Nominatim
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
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (searchDropdown && searchDropdown.classList.contains('active') && !e.target.closest('.search-bar-container')) {
            searchDropdown.classList.remove('active');
        }
    });

"""

# inject search js into DOMContentLoaded
js = js.replace("document.addEventListener('DOMContentLoaded', () => {", search_js)

with open('diary/static/diary/app.js', 'w', encoding='utf-8') as f:
    f.write(js)

print("Migration completed!")
