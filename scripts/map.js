// Initialize map centered on Tilburg
let map = L.map('map').setView([51.5653, 5.0913], 13);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

let userLocation = null;
let userMarker = null;
let routingControl = null;
let parkingMarkers = [];

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

function requestUserLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                userLocation = [position.coords.latitude, position.coords.longitude];
                map.setView(userLocation, 15);
                
                // Add user location marker
                userMarker = L.marker(userLocation, {
                    icon: L.divIcon({
                        className: 'user-marker',
                        html: '<div style="background: #667eea; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
                        iconSize: [20, 20]
                    })
                }).addTo(map);
                
                locationModal.classList.remove('show');
            },
            function(error) {
                console.error('Error getting location:', error);
                // Use default location if permission denied
                useDefaultLocation();
            }
        );
    } else {
        // Use default location if geolocation not supported
        useDefaultLocation();
    }
}

function useDefaultLocation() {
    userLocation = TILBURG_CENTRAL_STATION;
    map.setView(userLocation, 15);
    
    // Add user location marker at default location
    userMarker = L.marker(userLocation, {
        icon: L.divIcon({
            className: 'user-marker',
            html: '<div style="background: #667eea; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
            iconSize: [20, 20]
        })
    }).addTo(map);
    
    locationModal.classList.remove('show');
}

allowLocationBtn.addEventListener('click', requestUserLocation);
skipLocationBtn.addEventListener('click', useDefaultLocation);

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

        // Add click event for routing
        marker.on('click', function() {
            if (userLocation) {
                showRoute(userLocation, [location.lat, location.lng]);
            }
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
            routingContainer.style.top = '50%';
            routingContainer.style.transform = 'translateY(-50%)';
        }
    }, 100);
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
    }
});

// Initialize parking locations
addParkingLocations();
