// Base API URL configuration
const API_BASE_URL = 'http://localhost:5000/api';

// Helper: Get stored JWT token from localStorage
function getAuthToken() {
    return localStorage.getItem('campussync_token');
}

// Helper: Handle unauthorized redirects
function checkAuth() {
    const token = getAuthToken();
    if (!token) {
        // Redirect to login page if token is missing
        window.location.href = 'login.html';
    }
    return token;
}

function getAuthHeaders() {
    return {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
    };
}

function updateDashboardUser(user) {
    if (!user) return;
    const name = user.fullName || user.full_name || 'Student Account';
    const roleLabels = {
        student_seeking_help: 'Student seeking help',
        peer_tutor: 'Peer tutor',
        both: 'Student and peer tutor'
    };
    document.getElementById('user-display-name').textContent = name;
    document.getElementById('user-display-role').textContent = roleLabels[user.role] || 'Campus Member';
    document.getElementById('user-avatar-initials').textContent = name
        .split(/\s+/)
        .filter(Boolean)
        .map(part => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

async function fetchUserProfile() {
    const response = await fetch(`${API_BASE_URL}/profile`, {
        headers: getAuthHeaders()
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'Failed to load your profile');
    }
    return data;
}

// 1. Fetch and Render Live Matches
async function loadMatches() {
    const token = checkAuth();
    const gridContainer = document.querySelector('.matches-grid');
    
    if (!gridContainer) return;

    try {
        gridContainer.innerHTML = '<p style="color: var(--text-muted); padding: 1rem;">Loading your study partners...</p>';

        const response = await fetch(`${API_BASE_URL}/matches`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch matches');
        }

        renderMatches(data.matches);

    } catch (err) {
        console.error("Error loading matches:", err);
        gridContainer.innerHTML = `<p style="color: #ef4444; padding: 1rem;">Error: ${err.message}</p>`;
    }
}

// 2. Render Match Cards Dynamically into DOM
function renderMatches(matches) {
    const gridContainer = document.querySelector('.matches-grid');
    gridContainer.innerHTML = '';

    if (!matches || matches.length === 0) {
        const emptyState = document.createElement('article');
        emptyState.className = 'match-empty';

        const illustration = document.createElement('div');
        illustration.className = 'match-empty-mark';
        illustration.setAttribute('aria-hidden', 'true');
        illustration.textContent = '✦';

        const heading = document.createElement('h2');
        heading.textContent = 'Your study circle starts here';

        const description = document.createElement('p');
        description.textContent = 'We’ll show you coursemates and tutors as soon as we find a shared course and study time. Make sure your profile is up to date to get the best matches.';

        const action = document.createElement('a');
        action.className = 'btn btn-primary';
        action.href = 'onboarding.html';
        action.textContent = 'Review courses & availability';

        emptyState.append(illustration, heading, description, action);
        gridContainer.appendChild(emptyState);
        return;
    }

    matches.forEach(match => {
        // Generate initials for avatar
        const initials = match.fullName
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);

        // Format slots text
        const slotsText = match.overlappingSlots && match.overlappingSlots.length > 0
            ? match.overlappingSlots.map(slot => `• ${slot.replace('_', ' ')}`).join('<br>')
            : '• Flexible hours';

        const cardHTML = `
            <div class="match-card" data-user-id="${match.userId}">
                <div class="card-header">
                    <div class="peer-details">
                        <div class="peer-avatar">${initials}</div>
                        <div>
                            <div class="peer-name">${match.fullName}</div>
                            <div class="peer-role">${match.role === 'peer_tutor' ? 'Peer Tutor' : 'Student Seeking Help'}</div>
                        </div>
                    </div>
                    <div class="score-badge">${match.compatibilityScore}% Match</div>
                </div>
                <div>
                    <span class="course-tag">${match.courseCode} • ${match.courseTitle}</span>
                    <div class="slots-section">
                        <strong>Overlapping Free Time:</strong><br>
                        ${slotsText} (${match.overlappingSlotsCount} slots)
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn btn-outline" onclick="viewProfile('${match.userId}')">View Profile</button>
                    <button class="btn btn-primary" onclick="createPodForCourse('${match.courseCode}', '${match.courseId}')">Create Pod</button>
                </div>
            </div>
        `;

        gridContainer.insertAdjacentHTML('beforeend', cardHTML);
    });
}

// 3. Action: Create a Study Pod
async function createPodForCourse(courseCode, courseId) {
    const token = checkAuth();
    const podName = prompt(`Enter a name for your ${courseCode} study pod:`, `${courseCode} Study Group`);
    
    if (!podName) return;

    try {
        const response = await fetch(`${API_BASE_URL}/pods`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                podName: podName,
                courseId: courseId,
                maxMembers: 5
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to create study pod');
        }

        alert('Study pod created successfully! Check your "My Study Pods" tab.');
        showDashboardView('pods');
    } catch (err) {
        console.error("Error creating pod:", err);
        alert(`Error: ${err.message}`);
    }
}

async function loadPodCourses() {
    const courseSelect = document.getElementById('pod-course');
    const message = document.getElementById('pods-message');

    try {
        const response = await fetch(`${API_BASE_URL}/profile`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load your courses');
        }

        courseSelect.replaceChildren();
        const courses = data.courses || [];
        if (courses.length === 0) {
            courseSelect.add(new Option('Add courses to your profile first', ''));
            message.textContent = 'Add at least one course in your profile before creating or joining course study pods.';
            return;
        }

        courseSelect.add(new Option('Select a course', ''));
        courses.forEach(course => {
            courseSelect.add(new Option(
                `${course.course_code} — ${course.course_title}`,
                course.course_id
            ));
        });
    } catch (err) {
        console.error('Error loading courses for study pods:', err);
        courseSelect.replaceChildren(new Option('Could not load courses', ''));
        message.textContent = err.message;
        message.classList.add('error');
    }
}

async function loadStudyPods() {
    const container = document.getElementById('pods-container');
    const message = document.getElementById('pods-message');
    if (!container) return;

    container.replaceChildren();
    message.textContent = 'Loading study pods...';
    message.classList.remove('error');

    try {
        const response = await fetch(`${API_BASE_URL}/pods`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load study pods');
        }

        const pods = data.pods || [];
        message.textContent = pods.length
            ? ''
            : 'No study pods for your courses yet. Create one to get started.';

        pods.forEach(pod => {
            const card = document.createElement('article');
            card.className = 'pod-card';

            const title = document.createElement('h2');
            title.textContent = pod.pod_name;
            card.appendChild(title);

            const course = document.createElement('p');
            course.textContent = `${pod.course_code} — ${pod.course_title}`;
            card.appendChild(course);

            const creator = document.createElement('p');
            creator.textContent = `Organizer: ${pod.creator_name || 'CampusSync student'}`;
            card.appendChild(creator);

            const members = document.createElement('p');
            members.textContent = `Members: ${pod.current_members_count} / ${pod.max_members}`;
            card.appendChild(members);

            if (pod.is_member) {
                const badge = document.createElement('span');
                badge.className = 'joined-badge';
                badge.textContent = 'Joined';
                card.appendChild(badge);
            } else {
                const joinButton = document.createElement('button');
                joinButton.type = 'button';
                joinButton.className = 'btn btn-primary';
                joinButton.textContent = pod.is_full ? 'Full' : 'Join pod';
                joinButton.disabled = pod.is_full;
                joinButton.addEventListener('click', () => joinStudyPod(pod.pod_id));
                card.appendChild(joinButton);
            }

            container.appendChild(card);
        });
    } catch (err) {
        console.error('Error loading study pods:', err);
        message.textContent = err.message;
        message.classList.add('error');
    }
}

async function joinStudyPod(podId) {
    try {
        const response = await fetch(`${API_BASE_URL}/pods/${encodeURIComponent(podId)}/join`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to join study pod');
        }
        await loadStudyPods();
    } catch (err) {
        console.error('Error joining study pod:', err);
        const message = document.getElementById('pods-message');
        message.textContent = err.message;
        message.classList.add('error');
    }
}

const DASHBOARD_VIEWS = {
    matches: { id: 'matches-view', title: 'Compatible Study Partners' },
    pods: { id: 'pods-view', title: 'My Study Pods' },
    schedule: { id: 'schedule-view', title: 'My Schedule' },
    catalog: { id: 'catalog-view', title: 'Course Catalog' },
    settings: { id: 'settings-view', title: 'Settings' }
};

async function loadStudentSchedule() {
    const message = document.getElementById('schedule-message');
    const grid = document.getElementById('schedule-grid');
    const days = [
        ['MON', 'Monday'], ['TUE', 'Tuesday'], ['WED', 'Wednesday'],
        ['THU', 'Thursday'], ['FRI', 'Friday'], ['SAT', 'Saturday'], ['SUN', 'Sunday']
    ];
    const blocks = [
        ['09_12', '9:00 AM – 12:00 PM'],
        ['12_15', '12:00 PM – 3:00 PM'],
        ['15_18', '3:00 PM – 6:00 PM'],
        ['18_21', '6:00 PM – 9:00 PM']
    ];

    grid.replaceChildren();
    message.textContent = 'Loading your availability...';
    message.classList.remove('error');
    try {
        const data = await fetchUserProfile();
        updateDashboardUser(data.user);
        const available = new Set(data.availabilities || []);
        days.forEach(([code, label]) => {
            const day = document.createElement('article');
            day.className = 'schedule-day';
            const heading = document.createElement('h2');
            heading.textContent = label;
            day.appendChild(heading);
            blocks.forEach(([block, time]) => {
                const slot = document.createElement('div');
                const isAvailable = available.has(`${code}_${block}`);
                slot.className = `schedule-slot${isAvailable ? ' available' : ''}`;
                slot.textContent = `${time} · ${isAvailable ? 'Available' : 'Not selected'}`;
                day.appendChild(slot);
            });
            grid.appendChild(day);
        });
        message.textContent = available.size
            ? 'Your saved weekly availability. To change it, update your profile.'
            : 'No availability saved yet. Add your free time from Update courses & availability.';
    } catch (err) {
        console.error('Error loading schedule:', err);
        message.textContent = err.message;
        message.classList.add('error');
    }
}

let catalogCourses = [];

function renderCourseCatalog() {
    const grid = document.getElementById('catalog-grid');
    const search = document.getElementById('catalog-search').value.trim().toLowerCase();
    const department = document.getElementById('catalog-department').value;
    grid.replaceChildren();

    const filteredCourses = catalogCourses.filter(course => {
        const matchesText = `${course.course_code} ${course.course_title} ${course.department}`.toLowerCase().includes(search);
        return matchesText && (!department || course.department === department);
    });

    filteredCourses.forEach(course => {
        const card = document.createElement('article');
        card.className = 'catalog-card';
        const title = document.createElement('h2');
        title.textContent = course.course_code;
        const description = document.createElement('p');
        description.textContent = course.course_title;
        const departmentName = document.createElement('p');
        departmentName.textContent = course.department;
        card.append(title, description, departmentName);
        grid.appendChild(card);
    });

    const message = document.getElementById('catalog-message');
    message.classList.remove('error');
    message.textContent = filteredCourses.length
        ? `${filteredCourses.length} course${filteredCourses.length === 1 ? '' : 's'}`
        : 'No courses match your search.';
}

async function loadFullCourseCatalog() {
    const message = document.getElementById('catalog-message');
    message.textContent = 'Loading course catalog...';
    message.classList.remove('error');
    try {
        const response = await fetch(`${API_BASE_URL}/profile/courses`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load course catalog');
        }

        catalogCourses = data.courses || [];
        const departments = [...new Set(catalogCourses.map(course => course.department))].sort();
        const departmentSelect = document.getElementById('catalog-department');
        const selectedDepartment = departmentSelect.value;
        departmentSelect.replaceChildren(new Option('All departments', ''));
        departments.forEach(name => departmentSelect.add(new Option(name, name)));
        departmentSelect.value = departments.includes(selectedDepartment) ? selectedDepartment : '';
        renderCourseCatalog();
    } catch (err) {
        console.error('Error loading course catalog:', err);
        message.textContent = err.message;
        message.classList.add('error');
    }
}

let currentProfileUser = null;

async function loadUserSettings() {
    const message = document.getElementById('account-settings-message');
    message.textContent = 'Loading your account...';
    message.classList.remove('error');
    try {
        const data = await fetchUserProfile();
        currentProfileUser = data.user;
        updateDashboardUser(data.user);
        document.getElementById('settings-name').value = data.user.full_name;
        document.getElementById('settings-email').value = data.user.email;
        document.getElementById('settings-role').value = data.user.role;
        message.textContent = '';
    } catch (err) {
        console.error('Error loading account settings:', err);
        message.textContent = err.message;
        message.classList.add('error');
    }
}

async function saveAccountSettings(values, messageElement) {
    const response = await fetch(`${API_BASE_URL}/profile/settings`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(values)
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'Failed to update account settings');
    }

    localStorage.setItem('campussync_token', data.token);
    currentProfileUser = {
        full_name: data.user.fullName,
        email: data.user.email,
        role: data.user.role
    };
    updateDashboardUser(data.user);
    messageElement.textContent = data.message;
    messageElement.classList.remove('error');
}

function showDashboardView(viewName) {
    const selectedView = DASHBOARD_VIEWS[viewName] ? viewName : 'matches';
    Object.entries(DASHBOARD_VIEWS).forEach(([name, view]) => {
        document.getElementById(view.id).classList.toggle('hidden', name !== selectedView);
    });
    document.getElementById('dashboard-view-title').textContent = DASHBOARD_VIEWS[selectedView].title;

    document.querySelectorAll('[data-dashboard-view]').forEach(link => {
        const isActive = link.dataset.dashboardView === selectedView;
        link.classList.toggle('active', isActive);
        if (isActive) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });

    if (selectedView === 'pods') {
        loadPodCourses();
        loadStudyPods();
    } else if (selectedView === 'schedule') {
        loadStudentSchedule();
    } else if (selectedView === 'catalog') {
        loadFullCourseCatalog();
    } else if (selectedView === 'settings') {
        loadUserSettings();
    }
}

// Stub for viewing profile
function viewProfile(userId) {
    alert(`Viewing profile details for user ID: ${userId}`);
}

// Run when dashboard loads
document.addEventListener('DOMContentLoaded', () => {
    loadMatches();

    document.querySelectorAll('[data-dashboard-view]').forEach(link => {
        link.addEventListener('click', event => {
            event.preventDefault();
            const viewName = link.dataset.dashboardView;
            history.replaceState(null, '', `#${viewName}`);
            showDashboardView(viewName);
        });
    });

    document.getElementById('catalog-search').addEventListener('input', renderCourseCatalog);
    document.getElementById('catalog-department').addEventListener('change', renderCourseCatalog);

    document.getElementById('create-pod-form').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        const message = document.getElementById('pods-message');
        message.textContent = '';
        message.classList.remove('error');

        try {
            const response = await fetch(`${API_BASE_URL}/pods`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    podName: formData.get('podName'),
                    courseId: formData.get('courseId'),
                    maxMembers: Number(formData.get('maxMembers'))
                })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to create study pod');
            }

            form.reset();
            document.getElementById('pod-max-members').value = '5';
            message.textContent = 'Study pod created. You are its first member.';
            await loadStudyPods();
        } catch (err) {
            console.error('Error creating study pod:', err);
            message.textContent = err.message;
            message.classList.add('error');
        }
    });

    document.getElementById('account-settings-form').addEventListener('submit', async event => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const message = document.getElementById('account-settings-message');
        message.textContent = 'Saving account details...';
        message.classList.remove('error');
        try {
            await saveAccountSettings({
                fullName: formData.get('fullName'),
                email: formData.get('email'),
                role: formData.get('role')
            }, message);
        } catch (err) {
            message.textContent = err.message;
            message.classList.add('error');
        }
    });

    document.getElementById('password-settings-form').addEventListener('submit', async event => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const message = document.getElementById('password-settings-message');
        message.textContent = 'Changing password...';
        message.classList.remove('error');
        try {
            if (!currentProfileUser) await loadUserSettings();
            if (!currentProfileUser) throw new Error('Could not load your account details. Please try again.');
            await saveAccountSettings({
                fullName: currentProfileUser.full_name,
                email: currentProfileUser.email,
                role: currentProfileUser.role,
                currentPassword: formData.get('currentPassword'),
                newPassword: formData.get('newPassword')
            }, message);
            event.currentTarget.reset();
        } catch (err) {
            message.textContent = err.message;
            message.classList.add('error');
        }
    });

    const initialView = window.location.hash.slice(1);
    showDashboardView(DASHBOARD_VIEWS[initialView] ? initialView : 'matches');
});