function showLogin() {
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('registerForm').classList.add('hidden');
}

function showRegister() {
    document.getElementById('registerForm').classList.remove('hidden');
    document.getElementById('loginForm').classList.add('hidden');
}

function hideAuthForms() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.add('hidden');
}

function handleLogin(event) {
    event.preventDefault();
    // In a real app, you would validate credentials with a backend
    // For now, we'll just redirect to the map page
    localStorage.setItem('userLoggedIn', 'true');
    window.location.href = 'map.html';
}

function handleRegister(event) {
    event.preventDefault();
    // In a real app, you would send registration data to a backend
    // For now, we'll just redirect to the map page
    localStorage.setItem('userLoggedIn', 'true');
    window.location.href = 'map.html';
}
