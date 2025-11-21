// Initialize map centered on Tilburg
let map = L.map('map').setView([51.5653, 5.0913], 13);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

const MAX_RECENT_LOCATIONS = 6;
let userLocation = null;
let userMarker = null;
let routingControl = null;
let parkingMarkers = [];
let selectedLocation = null;
let isNavigating = false;
let watchPositionId = null;
let locationAccessGranted = false;
let recentLocations = [];

// Tilburg Central Station coordinates (default location)
const TILBURG_CENTRAL_STATION = [51.5653, 5.0913];

// Check if user is logged in
if (!localStorage.getItem('userLoggedIn')) {
    window.location.href = 'index.html';
}

// Location permission modal handlers
const locationModal = document.getElementById('locationModal');
const allowLocationBtn = document.getElementById('allowLocationBtn');
const skipLocationBtn = document.getElementById('skipLocationBtn');
const navigationModal = document.getElementById('navigationModal');
const startLocationInput = document.getElementById('startLocationInput');
const useCurrentBtn = document.getElementById('useCurrentBtn');
const startNavBtn = document.getElementById('startNavBtn');
const cancelNavBtn = document.getElementById('cancelNavBtn');
const navigationUIContainer = document.getElementById('navigationUI');
const navLocationNameEl = document.getElementById('navLocationName');
const navLocationDetailsEl = document.getElementById('navLocationDetails');
const navDestinationNameEl = document.getElementById('navDestinationName');
const navDistanceEl = document.getElementById('navDistance');
const navTimeEl = document.getElementById('navTime');
const navInstructionTextEl = document.getElementById('navInstructionText');
const navNextInstructionEl = document.getElementById('navNextInstruction');
const recentModal = document.getElementById('recentModal');
const recentBtn = document.getElementById('recentBtn');
const recentListEl = document.getElementById('recentList');
const clearRecentBtn = document.getElementById('clearRecentBtn');

function updateUserMarker(position) {
    if (userMarker) {
        userMarker.setLatLng(position);
    } else {
        userMarker = L.marker(position, {
            icon: L.divIcon({
                className: 'user-marker',
                html: '<div style="background: #667eea; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
                iconSize: [20, 20]
            })
        }).addTo(map);
    }
}

function useDefaultLocation() {
    userLocation = TILBURG_CENTRAL_STATION.slice();
    locationAccessGranted = false;
    map.setView(userLocation, 15);
    updateUserMarker(userLocation);
    locationModal.classList.remove('show');
}

async function requestUserLocation(showAlertOnFail = true) {
    if (!navigator.geolocation) {
        if (showAlertOnFail) {
            alert('Geolocation is not supported by your browser. Using default location.');
        }
        useDefaultLocation();
        return userLocation;
    }

    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            position => {
                locationAccessGranted = true;
                userLocation = [position.coords.latitude, position.coords.longitude];
                map.setView(userLocation, 15);
                updateUserMarker(userLocation);
                locationModal.classList.remove('show');
                resolve(userLocation);
            },
            error => {
                console.error('Error getting location:', error);
                if (showAlertOnFail) {
                    alert('Unable to access your location. Using default location.');
                }
                useDefaultLocation();
                reject(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 8000,
                maximumAge: 0
            }
        );
    });
}

allowLocationBtn.addEventListener('click', () => {
    requestUserLocation();
});
skipLocationBtn.addEventListener('click', () => {
    useDefaultLocation();
});

if (useCurrentBtn) {
    useCurrentBtn.addEventListener('click', () => {
        startLocationInput.value = '';
        requestUserLocation(false);
    });
}

// Add parking locations to map
function addParkingLocations() {
    parkingLocations.forEach(location => {
        const markerColor = getMarkerColor(location.type);
        
        const customIcon = L.divIcon({
            className: 'bike-marker',
            html: `<div class="bike-marker ${markerColor}" style="background: ${getColorForType(location.type)}; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">🚲</div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });

        const marker = L.marker([location.lat, location.lng], {
            icon: customIcon
        }).addTo(map);

        // Create tooltip content
        const tooltipContent = `
            <div class="tooltip-content">
                <div class="tooltip-title">${location.name}</div>
                <div class="tooltip-info">
                    <strong>Address:</strong> ${location.address}<br>
                    <strong>Capacity:</strong> ${location.capacity} bikes<br>
                    <strong>Cost:</strong> ${location.cost}<br>
                    <strong>Type:</strong> ${location.type}
                </div>
            </div>
        `;

        marker.bindTooltip(tooltipContent, {
            permanent: false,
            direction: 'top',
            offset: [0, -10]
        });

        // Add click event to show navigation prompt
        marker.on('click', function() {
            selectedLocation = location;
            showNavigationPrompt(location);
        });

        parkingMarkers.push({
            marker: marker,
            location: location
        });
    });
}

function getColorForType(type) {
    const colors = {
        'free': '#4caf50',
        'paid': '#ff9800',
        'covered': '#2196f3',
        'secure': '#9c27b0'
    };
    return colors[type] || '#666';
}

function getMarkerColor(type) {
    return `marker-${type}`;
}

function showRoute(start, end) {
    // Remove existing routing control
    if (routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
    }

    // Add new routing using OSRM (free routing service)
    routingControl = L.Routing.control({
        waypoints: [
            L.latLng(start[0], start[1]),
            L.latLng(end[0], end[1])
        ],
        router: L.Routing.osrmv1({
            serviceUrl: 'https://router.project-osrm.org/route/v1'
        }),
        routeWhileDragging: false,
        lineOptions: {
            styles: [
                {color: '#2196f3', opacity: 0.8, weight: 5}
            ]
        },
        createMarker: function() { return null; }, // Don't create default markers
        addWaypoints: false,
        showAlternatives: false,
        position: 'topleft' // Position on left side
    }).addTo(map);
    
    // Move routing container to left side after it's created
    setTimeout(() => {
        const routingContainer = document.querySelector('.leaflet-routing-container');
        if (routingContainer) {
            routingContainer.style.left = '20px';
            routingContainer.style.right = 'auto';
            if (!isNavigating) {
                routingContainer.style.top = '50%';
                routingContainer.style.transform = 'translateY(-50%)';
            } else {
                routingContainer.style.top = '250px';
                routingContainer.style.transform = 'none';
            }
        }
        
        // Setup route listener
        setupRouteListener();
    }, 200);
}

// Search functionality with real-time feedback
document.getElementById('searchBtn').addEventListener('click', performSearch);
document.getElementById('searchInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        performSearch();
    }
});

// Real-time search as user types (with debounce)
let searchTimeout;
document.getElementById('searchInput').addEventListener('input', function() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        if (this.value.trim().length > 0) {
            performSearch();
        } else {
            // Show all markers if search is cleared
            parkingMarkers.forEach(item => {
                item.marker.addTo(map);
            });
            document.getElementById('searchFeedback').classList.add('hidden');
        }
    }, 300); // Wait 300ms after user stops typing
});

function showSearchFeedback(message, type = 'success') {
    const feedback = document.getElementById('searchFeedback');
    feedback.textContent = message;
    feedback.className = `search-feedback ${type}`;
    feedback.classList.remove('hidden');
    
    setTimeout(() => {
        feedback.classList.add('hidden');
    }, 3000);
}

function performSearch() {
    const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
    const feedback = document.getElementById('searchFeedback');
    
    if (!searchTerm) {
        // Show all markers
        parkingMarkers.forEach(item => {
            item.marker.addTo(map);
        });
        feedback.classList.add('hidden');
        return;
    }

    let matchCount = 0;
    let firstMatch = null;

    // Filter and show matching locations
    parkingMarkers.forEach(item => {
        const location = item.location;
        // More sensitive search - check name and address separately
        const nameMatch = location.name.toLowerCase().includes(searchTerm);
        const addressMatch = location.address.toLowerCase().includes(searchTerm);
        const matches = nameMatch || addressMatch;

        if (matches) {
            item.marker.addTo(map);
            matchCount++;
            if (!firstMatch) {
                firstMatch = location;
            }
        } else {
            map.removeLayer(item.marker);
        }
    });

    // Show feedback
    if (matchCount > 0) {
        showSearchFeedback(`Found ${matchCount} location${matchCount > 1 ? 's' : ''}`, 'success');
        // Zoom to first match
        if (firstMatch) {
            map.setView([firstMatch.lat, firstMatch.lng], 15);
        }
    } else {
        showSearchFeedback('No locations found. Try a different search term.', 'error');
    }
}

async function geocodeAddress(query) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
        const data = await response.json();
        if (data && data.length > 0) {
            return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
        }
    } catch (error) {
        console.error('Geocoding error:', error);
    }
    return null;
}

async function resolveStartLocation() {
    const inputValue = startLocationInput.value.trim();

    if (inputValue.length === 0) {
        if (!userLocation) {
            try {
                await requestUserLocation(false);
            } catch (error) {
                console.warn('Using fallback location.');
            }
        }
        if (!userLocation) {
            useDefaultLocation();
        }
        return userLocation ? userLocation.slice() : TILBURG_CENTRAL_STATION.slice();
    }

    const geocoded = await geocodeAddress(inputValue);
    if (geocoded) {
        return geocoded;
    }

    alert('Unable to find the starting point. Please try another address or use your current location.');
    return null;
}

// Modal functionality
const rulesModal = document.getElementById('rulesModal');
const helpModal = document.getElementById('helpModal');
const rulesBtn = document.getElementById('rulesBtn');
const helpBtn = document.getElementById('helpBtn');
const logoutBtn = document.getElementById('logoutBtn');

rulesBtn.addEventListener('click', () => {
    rulesModal.classList.add('show');
});

helpBtn.addEventListener('click', () => {
    helpModal.classList.add('show');
});

logoutBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('userLoggedIn');
        window.location.href = 'index.html';
    }
});

// Close modals
document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', function() {
        this.closest('.modal').classList.remove('show');
    });
});

// Close modal when clicking outside
window.addEventListener('click', function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('show');
        if (event.target.id === 'navigationModal') {
            selectedLocation = null;
            if (startLocationInput) {
                startLocationInput.value = '';
            }
        }
    }
});

// Navigation prompt functionality
function showNavigationPrompt(location) {
    if (!location) return;
    selectedLocation = location;
    navLocationNameEl.textContent = location.name;
    navLocationDetailsEl.innerHTML = `
        <p><strong>Address:</strong> ${location.address}</p>
        <p><strong>Capacity:</strong> ${location.capacity} bikes</p>
        <p><strong>Cost:</strong> ${location.cost}</p>
        <p><strong>Type:</strong> ${location.type}</p>
    `;
    if (startLocationInput) {
        startLocationInput.value = '';
    }
    addRecentLocation(location);
    navigationModal.classList.add('show');
}

// Start live navigation
async function startNavigation() {
    if (!selectedLocation) {
        alert('Please select a bike parking location first.');
        return;
    }

    try {
        startNavBtn.disabled = true;
        startNavBtn.textContent = 'Starting...';

        const startPoint = await resolveStartLocation();
        if (!startPoint) {
            return;
        }

        userLocation = startPoint.slice();
        map.setView(userLocation, 15);
        updateUserMarker(userLocation);

        isNavigating = true;
        navigationModal.classList.remove('show');
        navigationUIContainer.classList.remove('hidden');
        navDestinationNameEl.textContent = selectedLocation.name;

        showRoute(userLocation, [selectedLocation.lat, selectedLocation.lng]);

        if (watchPositionId !== null && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchPositionId);
            watchPositionId = null;
        }

        if (navigator.geolocation) {
            watchPositionId = navigator.geolocation.watchPosition(
                position => {
                    locationAccessGranted = true;
                    const newLocation = [position.coords.latitude, position.coords.longitude];
                    updateNavigation(newLocation);
                },
                error => {
                    console.error('Navigation position error:', error);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 6000,
                    maximumAge: 0
                }
            );
        }
    } catch (error) {
        console.error('Unable to start navigation:', error);
    } finally {
        startNavBtn.disabled = false;
        startNavBtn.textContent = 'Start Navigation';
    }
}

// Update navigation with new position
function updateNavigation(newLocation) {
    if (!isNavigating || !selectedLocation) return;

    userLocation = newLocation.slice();
    updateUserMarker(newLocation);

    // Keep map centered on user during navigation
    map.setView(newLocation, 16);

    // Update route
    showRoute(newLocation, [selectedLocation.lat, selectedLocation.lng]);
}

function updateRouteUI(route) {
    if (!route) return;

    if (route.summary) {
        const distance = (route.summary.totalDistance / 1000).toFixed(1);
        const time = Math.round(route.summary.totalTime / 60);
        navDistanceEl.textContent = `${distance} km`;
        navTimeEl.textContent = `${time} min`;
    }

    if (route.instructions && route.instructions.length > 0) {
        navInstructionTextEl.textContent = route.instructions[0].text || 'Follow the route';
        if (route.instructions.length > 1) {
            navNextInstructionEl.textContent = `Next: ${route.instructions[1].text || ''}`;
        } else {
            navNextInstructionEl.textContent = 'Arriving at destination';
        }
    }
}

function handleRoutesFound(e) {
    if (!isNavigating) return;
    if (e.routes && e.routes.length > 0) {
        updateRouteUI(e.routes[0]);
    }
}

function setupRouteListener() {
    if (!routingControl) return;
    routingControl.off('routesfound', handleRoutesFound);
    routingControl.on('routesfound', handleRoutesFound);
}

// Stop navigation
function stopNavigation() {
    isNavigating = false;

    if (watchPositionId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchPositionId);
        watchPositionId = null;
    }

    navigationUIContainer.classList.add('hidden');

    if (routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
    }

    if (startLocationInput) {
        startLocationInput.value = '';
    }

    selectedLocation = null;
}

// Recent locations
function addRecentLocation(location) {
    if (!location) return;
    const existsIndex = recentLocations.findIndex(
        item => item.name === location.name && item.address === location.address
    );
    if (existsIndex !== -1) {
        recentLocations.splice(existsIndex, 1);
    }
    recentLocations.unshift({ ...location, timestamp: Date.now() });
    if (recentLocations.length > MAX_RECENT_LOCATIONS) {
        recentLocations.pop();
    }
    renderRecentList();
}

function formatRelativeTime(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
}

function renderRecentList() {
    if (!recentListEl) return;
    recentListEl.innerHTML = '';

    if (recentLocations.length === 0) {
        recentListEl.innerHTML = '<p class="recent-empty">No recent locations yet.</p>';
        return;
    }

    recentLocations.forEach(location => {
        const item = document.createElement('div');
        item.className = 'recent-item';

        const info = document.createElement('div');
        info.className = 'recent-info';

        const name = document.createElement('div');
        name.className = 'recent-name';
        name.textContent = location.name;

        const address = document.createElement('div');
        address.className = 'recent-address';
        address.textContent = location.address;

        const type = document.createElement('div');
        type.className = 'recent-type';
        type.textContent = `${location.type} • Capacity: ${location.capacity}`;

        info.appendChild(name);
        info.appendChild(address);
        info.appendChild(type);

        const timeEl = document.createElement('div');
        timeEl.className = 'recent-time';
        timeEl.textContent = formatRelativeTime(location.timestamp);

        item.appendChild(info);
        item.appendChild(timeEl);

        item.addEventListener('click', () => {
            recentModal.classList.remove('show');
            selectedLocation = location;
            showNavigationPrompt(location);
        });

        recentListEl.appendChild(item);
    });
}

// Navigation modal event handlers
startNavBtn.addEventListener('click', () => {
    startNavigation();
});

cancelNavBtn.addEventListener('click', () => {
    navigationModal.classList.remove('show');
    selectedLocation = null;
    if (startLocationInput) {
        startLocationInput.value = '';
    }
});

document.getElementById('stopNavBtn').addEventListener('click', stopNavigation);

document.querySelectorAll('#navigationModal .close').forEach(closeBtn => {
    closeBtn.addEventListener('click', () => {
        navigationModal.classList.remove('show');
        selectedLocation = null;
        if (startLocationInput) {
            startLocationInput.value = '';
        }
    });
});

if (recentBtn) {
    recentBtn.addEventListener('click', () => {
        renderRecentList();
        recentModal.classList.add('show');
    });
}

if (clearRecentBtn) {
    clearRecentBtn.addEventListener('click', () => {
        recentLocations = [];
        renderRecentList();
    });
}

// Initialize parking locations
addParkingLocations();
