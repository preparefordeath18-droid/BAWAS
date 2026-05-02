// Initialize data structure if not exists
function initializeData() {
    if (!localStorage.getItem('bawasData')) {
        const initialData = {
            users: {
                admin: { password: 'admin123', type: 'admin' },
                resident: { password: 'resident123', type: 'resident' }
            },
            reports: [],
            schedules: []
        };
        localStorage.setItem('bawasData', JSON.stringify(initialData));
    }
}

// Login function
function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const userType = document.getElementById('userType').value;
    const errorMsg = document.getElementById('errorMsg');

    if (!username || !password) {
        errorMsg.textContent = 'Please enter username and password';
        return;
    }

    initializeData();
    const data = JSON.parse(localStorage.getItem('bawasData'));

    if (data.users[username] && data.users[username].password === password) {
        if (data.users[username].type === userType) {
            // Store session
            sessionStorage.setItem('currentUser', username);
            sessionStorage.setItem('userType', userType);
            
            // Redirect based on user type
            if (userType === 'admin') {
                window.location.href = 'admin-dashboard.html';
            } else {
                window.location.href = 'resident-dashboard.html';
            }
        } else {
            errorMsg.textContent = 'Invalid user type selected';
        }
    } else {
        errorMsg.textContent = 'Invalid username or password';
    }
}

// Check if user is logged in
function checkAuth() {
    const currentUser = sessionStorage.getItem('currentUser');
    if (!currentUser) {
        window.location.href = 'index.html';
    }
}

// Logout function
function logout() {
    sessionStorage.clear();
    window.location.href = 'index.html';
}

// Initialize on page load
initializeData();
