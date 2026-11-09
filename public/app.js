// Base API URL configuration
const API_BASE_URL = '/api';

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

function logout() {
    if (podChatSocket) podChatSocket.disconnect();
    localStorage.removeItem('campussync_token');
    window.location.replace('login.html');
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
    document.getElementById('user-display-name').textContent = name;
    const menuName = document.getElementById('user-menu-name');
    const menuEmail = document.getElementById('user-menu-email');
    if (menuName) menuName.textContent = name;
    if (menuEmail) menuEmail.textContent = user.email || '';
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
let matchProfiles = new Map();

function renderMatches(matches) {
    const gridContainer = document.querySelector('.matches-grid');
    gridContainer.innerHTML = '';
    matchProfiles = new Map((matches || []).map(match => [match.userId, match]));

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
        description.textContent = 'We’ll show you coursemates and tutors who share your courses. Adding your free time helps us put the most compatible partners first.';

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
        const hasOverlappingSlots = match.overlappingSlots && match.overlappingSlots.length > 0;
        const slotsText = hasOverlappingSlots
            ? match.overlappingSlots.map(slot => `• ${slot.replace(/_/g, ' ')}`).join('<br>')
            : 'No shared time found yet';

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
                    <span class="course-tag">${match.courseTitle}</span>
                    <div class="slots-section">
                        <strong>Shared Free Time:</strong><br>
                        ${slotsText}${hasOverlappingSlots ? ` (${match.overlappingSlotsCount} slots)` : ''}
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn btn-outline" onclick="viewProfile('${match.userId}')">View Profile</button>
                    <button class="btn btn-primary" onclick="createPodForCourse('${match.courseId}')">Create Pod</button>
                </div>
            </div>
        `;

        gridContainer.insertAdjacentHTML('beforeend', cardHTML);
    });
}

// 3. Action: Create a Study Pod
async function createPodForCourse(courseId) {
    const token = checkAuth();
    const courseTitle = [...matchProfiles.values()].find(match => match.courseId === courseId)?.courseTitle || 'Course';
    const podName = prompt(`Enter a name for your ${courseTitle} study pod:`, `${courseTitle} Study Group`);
    
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
            card.dataset.podId = pod.pod_id;

            const title = document.createElement('h2');
            title.textContent = pod.pod_name;
            card.appendChild(title);

            const course = document.createElement('p');
            course.textContent = pod.course_title;
            card.appendChild(course);

            if (pod.department) {
                const department = document.createElement('p');
                department.className = 'pod-course-department';
                department.textContent = pod.department;
                card.appendChild(department);
            }

            appendPodTopics(card, pod.core_topics);
            appendCrossCampusConnection(card, pod.campuses);

            const creator = document.createElement('p');
            creator.textContent = `Organizer: ${pod.creator_name || 'CampusSync student'}`;
            card.appendChild(creator);

            const members = document.createElement('p');
            members.textContent = `Members: ${pod.current_members_count} / ${pod.max_members}`;
            card.appendChild(members);

            const actions = document.createElement('div');
            actions.className = 'pod-actions';
            if (pod.is_member) {
                const badge = document.createElement('span');
                badge.className = 'joined-badge';
                badge.textContent = 'Joined';
                actions.appendChild(badge);
                if (pod.is_creator) {
                    const renameButton = document.createElement('button');
                    renameButton.type = 'button';
                    renameButton.className = 'btn btn-outline';
                    renameButton.textContent = 'Rename pod';
                    renameButton.addEventListener('click', () => renameStudyPod(pod.pod_id, title));
                    actions.appendChild(renameButton);

                    const requestsButton = document.createElement('button');
                    requestsButton.type = 'button';
                    requestsButton.className = 'btn btn-outline';
                    requestsButton.textContent = `Membership requests${pod.pending_requests_count ? ` (${pod.pending_requests_count})` : ''}`;
                    actions.appendChild(requestsButton);

                    const deleteButton = document.createElement('button');
                    deleteButton.type = 'button';
                    deleteButton.className = 'btn btn-outline pod-delete-button';
                    deleteButton.textContent = 'Delete pod';
                    deleteButton.addEventListener('click', () => deleteStudyPod(pod.pod_id, pod.pod_name));
                    actions.appendChild(deleteButton);
                }
            } else {
                const joinButton = document.createElement('button');
                joinButton.type = 'button';
                joinButton.className = 'btn btn-primary';
                if (pod.request_status === 'pending') {
                    joinButton.textContent = 'Request pending';
                    joinButton.disabled = true;
                } else {
                    joinButton.textContent = pod.is_full ? 'Full' : pod.request_status === 'rejected' ? 'Request again' : 'Request to join';
                    joinButton.disabled = pod.is_full;
                    joinButton.addEventListener('click', () => joinStudyPod(pod.pod_id));
                }
                actions.appendChild(joinButton);
            }
            card.appendChild(actions);

            if (pod.is_creator) {
                const requestList = document.createElement('div');
                requestList.className = 'pod-request-list';
                card.appendChild(requestList);
                if (pod.pending_requests_count > 0) {
                    loadMembershipRequests(pod.pod_id, requestList);
                } else {
                    requestList.textContent = 'No pending membership requests.';
                }
            }

            if (pod.is_member) {
                const chatSection = document.createElement('section');
                chatSection.className = 'pod-chat-section';
                const chatHeading = document.createElement('h3');
                chatHeading.textContent = 'Pod chat';
                const chatToggle = document.createElement('button');
                chatToggle.type = 'button';
                chatToggle.className = 'btn btn-outline pod-chat-toggle';
                chatToggle.textContent = 'Open chat';
                chatToggle.setAttribute('aria-expanded', 'false');
                const chatPanel = document.createElement('div');
                chatPanel.className = 'pod-chat-panel hidden';
                chatPanel.dataset.podId = pod.pod_id;
                const chatStatus = document.createElement('p');
                chatStatus.className = 'pod-chat-status';
                chatStatus.setAttribute('aria-live', 'polite');
                chatStatus.textContent = 'Open chat to view messages.';
                const chatMessages = document.createElement('div');
                chatMessages.className = 'pod-chat-messages';
                chatMessages.setAttribute('role', 'log');
                chatMessages.setAttribute('aria-label', `${pod.pod_name} chat messages`);
                chatMessages.setAttribute('aria-live', 'polite');
                const chatForm = document.createElement('form');
                chatForm.className = 'pod-chat-form';
                chatForm.dataset.podId = pod.pod_id;
                const chatInput = document.createElement('textarea');
                chatInput.name = 'messageText';
                chatInput.maxLength = 2000;
                chatInput.rows = 2;
                chatInput.required = true;
                chatInput.placeholder = 'Write a message to your pod...';
                chatInput.setAttribute('aria-label', 'Chat message');
                const sendButton = document.createElement('button');
                sendButton.type = 'submit';
                sendButton.className = 'btn btn-primary';
                sendButton.textContent = 'Send';
                chatForm.append(chatInput, sendButton);
                chatPanel.append(chatStatus, chatMessages, chatForm);
                chatToggle.addEventListener('click', () => {
                    const isOpen = !chatPanel.classList.contains('hidden');
                    chatPanel.classList.toggle('hidden', isOpen);
                    chatToggle.setAttribute('aria-expanded', String(!isOpen));
                    chatToggle.textContent = isOpen ? 'Open chat' : 'Close chat';
                    if (!isOpen) openPodChat(pod.pod_id, chatPanel);
                    else leavePodChat(pod.pod_id);
                });
                chatSection.append(chatHeading, chatToggle, chatPanel);
                card.appendChild(chatSection);

                const aiSection = document.createElement('section');
                aiSection.className = 'pod-ai-section';
                const aiHeading = document.createElement('h3');
                aiHeading.textContent = 'CampusSync AI Study Copilot';
                const aiDescription = document.createElement('p');
                aiDescription.className = 'pod-ai-privacy';
                aiDescription.textContent = 'Your request and notes are sent to Google Gemini to generate a response. Avoid sharing personal or sensitive information.';
                const aiForm = document.createElement('form');
                aiForm.className = 'pod-ai-form';
                aiForm.dataset.podId = pod.pod_id;
                const promptLabel = document.createElement('label');
                promptLabel.textContent = 'What would you like help with?';
                const promptInput = document.createElement('textarea');
                promptInput.name = 'prompt';
                promptInput.rows = 2;
                promptInput.maxLength = 1000;
                promptInput.required = true;
                promptInput.placeholder = 'e.g. Explain central tendency or generate 3 practice questions.';
                promptLabel.appendChild(promptInput);
                const notesLabel = document.createElement('label');
                notesLabel.textContent = 'Study notes (optional)';
                const notesInput = document.createElement('textarea');
                notesInput.name = 'notes';
                notesInput.rows = 3;
                notesInput.maxLength = 12000;
                notesInput.placeholder = 'Paste notes for the Copilot to summarize or use in its answer.';
                notesLabel.appendChild(notesInput);
                const aiSubmit = document.createElement('button');
                aiSubmit.type = 'submit';
                aiSubmit.className = 'btn btn-primary';
                aiSubmit.textContent = 'Ask AI Copilot';
                const aiStatus = document.createElement('p');
                aiStatus.className = 'pod-ai-status';
                aiStatus.setAttribute('aria-live', 'polite');
                const aiResponse = document.createElement('pre');
                aiResponse.className = 'pod-ai-response hidden';
                aiResponse.setAttribute('aria-live', 'polite');
                aiForm.append(promptLabel, notesLabel, aiSubmit);
                aiSection.append(aiHeading, aiDescription, aiForm, aiStatus, aiResponse);
                card.appendChild(aiSection);

                const meetupSection = document.createElement('section');
                meetupSection.className = 'pod-meetup-section';
                const meetupHeading = document.createElement('h3');
                meetupHeading.textContent = 'Plan a meetup';
                meetupSection.appendChild(meetupHeading);

                const meetupForm = document.createElement('form');
                meetupForm.className = 'pod-meetup-form';
                meetupForm.dataset.podId = pod.pod_id;
                meetupForm.innerHTML = `
                    <label>What are you studying?
                        <input name="title" type="text" maxlength="100" required placeholder="e.g. Review for the midterm">
                    </label>
                    <label>When?
                        <input name="startsAt" type="datetime-local" required>
                    </label>
                    <label>Where?
                        <input name="location" type="text" maxlength="200" required placeholder="Balme Library">
                    </label>
                    <label>Extra details (optional)
                        <input name="notes" type="text" maxlength="500" placeholder="Bring your lecture notes">
                    </label>
                    <button class="btn btn-primary" type="submit">Suggest meetup</button>
                `;
                meetupSection.appendChild(meetupForm);

                const meetupStatus = document.createElement('p');
                meetupStatus.className = 'pod-meetup-status';
                meetupStatus.setAttribute('aria-live', 'polite');
                meetupSection.appendChild(meetupStatus);

                const meetupList = document.createElement('div');
                meetupList.className = 'pod-meetup-list';
                meetupSection.appendChild(meetupList);
                card.appendChild(meetupSection);
                loadPodMeetups(pod.pod_id, meetupList, meetupStatus);
            }

            container.appendChild(card);

            const requestButton = actions.querySelector('.btn-outline');
            if (requestButton && pod.is_creator) {
                requestButton.addEventListener('click', () => loadMembershipRequests(pod.pod_id, card.querySelector('.pod-request-list')));
            }
        });
    } catch (err) {
        console.error('Error loading study pods:', err);
        message.textContent = err.message;
        message.classList.add('error');
    }
}

async function deleteStudyPod(podId, podName) {
    if (!window.confirm(`Delete "${podName}"? This will permanently remove its membership requests, members, and meetups.`)) {
        return;
    }

    const message = document.getElementById('pods-message');
    message.textContent = 'Deleting study pod...';
    message.classList.remove('error');

    try {
        const response = await fetch(`${API_BASE_URL}/pods/${encodeURIComponent(podId)}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete study pod');
        }

        message.textContent = data.message;
        await Promise.all([
            loadStudyPods(),
            loadDiscoverablePods('matches-pods-container', 'matches-pods-message'),
            loadDiscoverablePods('catalog-pods-container', 'catalog-pods-message')
        ]);
        message.textContent = data.message;
    } catch (err) {
        console.error('Error deleting study pod:', err);
        message.textContent = err.message;
        message.classList.add('error');
    }
}

async function loadDiscoverablePods(containerId, messageId) {
    const container = document.getElementById(containerId);
    const message = document.getElementById(messageId);
    if (!container || !message) return;

    container.replaceChildren();
    message.textContent = 'Loading study pods...';
    message.classList.remove('error');

    try {
        const response = await fetch(`${API_BASE_URL}/pods/discover`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to discover study pods');
        }

        const pods = data.pods || [];
        renderDiscoverablePods(pods, containerId, messageId);
    } catch (err) {
        console.error('Error discovering study pods:', err);
        message.textContent = err.message;
        message.classList.add('error');
    }
}

function renderDiscoverablePods(pods, containerId, messageId) {
    const container = document.getElementById(containerId);
    const message = document.getElementById(messageId);
    if (!container || !message) return;

    container.replaceChildren();
    message.classList.remove('error');
    message.textContent = pods.length
        ? ''
        : 'No study pods have been created yet. Start one for a course you enjoy.';

    pods.forEach(pod => {
        const card = document.createElement('article');
        card.className = 'pod-card';

        const title = document.createElement('h2');
        title.textContent = pod.pod_name;
        const course = document.createElement('p');
        course.className = 'pod-course-title';
        course.textContent = pod.course_title;
        const organizer = document.createElement('p');
        organizer.textContent = `Organizer: ${pod.creator_name || 'CampusSync student'}`;
        const members = document.createElement('p');
        members.textContent = `Members: ${pod.current_members_count} / ${pod.max_members}`;
        const actions = document.createElement('div');
        actions.className = 'pod-actions';
        const reason = document.createElement('p');
        reason.className = 'course-match-reason';
        reason.textContent = pod.match_reason ? `Suggested because: ${pod.match_reason}` : '';

        if (pod.is_creator || pod.is_member) {
            const badge = document.createElement('span');
            badge.className = 'joined-badge';
            badge.textContent = pod.is_creator ? 'Your pod' : 'Joined';
            actions.appendChild(badge);

            const viewButton = document.createElement('button');
            viewButton.type = 'button';
            viewButton.className = 'btn btn-outline';
            viewButton.textContent = 'View pod';
            viewButton.addEventListener('click', () => openStudyPod(pod.pod_id));
            actions.appendChild(viewButton);
        } else {
            const requestButton = document.createElement('button');
            requestButton.type = 'button';
            requestButton.className = 'btn btn-primary';
            requestButton.textContent = pod.is_full
                ? 'Full'
                : pod.request_status === 'pending'
                    ? 'Request pending'
                    : pod.request_status === 'rejected'
                        ? 'Request again'
                        : 'Request to join';
            requestButton.disabled = pod.is_full || pod.request_status === 'pending';
            requestButton.addEventListener('click', () => joinStudyPod(pod.pod_id, message, pod.course_id));
            actions.appendChild(requestButton);
        }

        card.append(title, course);
        if (pod.department) {
            const department = document.createElement('p');
            department.className = 'pod-course-department';
            department.textContent = pod.department;
            card.appendChild(department);
        }
        appendPodTopics(card, pod.core_topics);
        appendCrossCampusConnection(card, pod.campuses);
        card.append(organizer, members);
        if (containerId === 'course-match-pods-container' && pod.match_reason) card.append(reason);
        card.append(actions);
        container.appendChild(card);
    });
}

function appendPodTopics(container, topics) {
    if (!Array.isArray(topics) || topics.length === 0) return;
    const focus = document.createElement('p');
    focus.className = 'pod-core-topics';
    const label = document.createElement('strong');
    label.textContent = 'Core focus: ';
    focus.append(label, document.createTextNode(topics.join(', ')));
    container.appendChild(focus);
}

function appendCrossCampusConnection(container, campuses) {
    if (!Array.isArray(campuses) || campuses.length === 0) return;
    const badge = document.createElement('p');
    badge.className = 'cross-campus-badge';
    badge.textContent = `Students from ${campuses.length} ${campuses.length === 1 ? 'university' : 'universities'} in this pod (${campuses.join(', ')})`;
    container.appendChild(badge);
}

async function findEquivalentCoursePods(form) {
    const status = document.getElementById('course-match-status');
    const summary = document.getElementById('course-match-summary');
    const submit = form.querySelector('button[type="submit"]');
    const podsMessage = document.getElementById('course-match-pods-message');
    summary.replaceChildren();
    summary.classList.add('hidden');
    document.getElementById('course-match-pods-container').replaceChildren();
    status.classList.remove('error');
    status.textContent = 'AI is normalizing your course and searching across universities...';
    podsMessage.textContent = '';
    submit.disabled = true;

    try {
        const formData = new FormData(form);
        const response = await fetch(`${API_BASE_URL}/ai/match-course`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                courseTitle: formData.get('courseTitle'),
                courseDescription: formData.get('courseDescription')
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to find equivalent courses.');

        const title = document.createElement('h3');
        title.textContent = data.normalized.standardCourseName;
        const discipline = document.createElement('p');
        discipline.textContent = `Discipline: ${data.normalized.discipline}`;
        const topics = document.createElement('p');
        topics.textContent = `Core topics: ${data.normalized.coreTopics.join(', ')}`;
        summary.append(title, discipline, topics);
        summary.classList.remove('hidden');

        if (data.pods.length) {
            status.textContent = 'These are AI-suggested equivalents, not verified course equivalencies. Pod organizers may need to approve join requests.';
            renderDiscoverablePods(data.pods, 'course-match-pods-container', 'course-match-pods-message');
        } else {
            status.textContent = 'No existing pod was found for a strongly equivalent course. The normalized title is a suggestion, not a confirmed equivalency.';
            podsMessage.textContent = 'You can create a national study pod from onboarding.';
            const createLink = document.createElement('a');
            createLink.className = 'btn btn-primary';
            createLink.href = 'onboarding.html';
            createLink.textContent = 'Create a national study pod';
            document.getElementById('course-match-pods-container').appendChild(createLink);
        }
    } catch (error) {
        console.error('Error finding equivalent course pods:', error);
        status.textContent = error.message;
        status.classList.add('error');
    } finally {
        submit.disabled = false;
    }
}

async function joinStudyPod(podId, feedbackElement = document.getElementById('pods-message'), courseId) {
    try {
        if (courseId) {
            const enrollmentResponse = await fetch(`${API_BASE_URL}/profile/courses`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ courseId, status: 'learning' })
            });
            const enrollmentData = await enrollmentResponse.json();
            if (!enrollmentResponse.ok) {
                throw new Error(enrollmentData.error || 'Could not add this course to your profile.');
            }
        }

        const response = await fetch(`${API_BASE_URL}/pods/${encodeURIComponent(podId)}/join`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to join study pod');
        }
        await Promise.all([
            loadStudyPods(),
            loadDiscoverablePods('matches-pods-container', 'matches-pods-message'),
            loadDiscoverablePods('catalog-pods-container', 'catalog-pods-message')
        ]);
        if (feedbackElement) {
            feedbackElement.textContent = data.message;
            feedbackElement.classList.remove('error');
        }
    } catch (err) {
        console.error('Error joining study pod:', err);
        const message = feedbackElement || document.getElementById('pods-message');
        if (message) {
            message.textContent = err.message;
            message.classList.add('error');
        }
    }
}

async function loadMembershipRequests(podId, container) {
    if (!container) return;
    container.replaceChildren();
    const loading = document.createElement('p');
    loading.textContent = 'Loading requests...';
    container.appendChild(loading);

    try {
        const response = await fetch(`${API_BASE_URL}/pods/${encodeURIComponent(podId)}/requests`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load membership requests');

        container.replaceChildren();
        const pending = (data.requests || []).filter(request => request.status === 'pending');
        if (pending.length === 0) {
            const empty = document.createElement('p');
            empty.textContent = 'No pending membership requests.';
            container.appendChild(empty);
            return;
        }

        pending.forEach(request => {
            const row = document.createElement('div');
            row.className = 'pod-request-row';
            const name = document.createElement('span');
            name.textContent = request.full_name;
            row.appendChild(name);

            ['approved', 'rejected'].forEach(status => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = status === 'approved' ? 'btn btn-primary' : 'btn btn-outline';
                button.textContent = status === 'approved' ? 'Approve' : 'Decline';
                button.addEventListener('click', async () => {
                    button.disabled = true;
                    try {
                        const result = await fetch(`${API_BASE_URL}/pods/${encodeURIComponent(podId)}/requests/${encodeURIComponent(request.request_id)}`, {
                            method: 'PATCH',
                            headers: getAuthHeaders(),
                            body: JSON.stringify({ status })
                        });
                        const resultData = await result.json();
                        if (!result.ok) throw new Error(resultData.error || 'Could not update request');
                        await loadStudyPods();
                    } catch (error) {
                        button.disabled = false;
                        const message = document.createElement('p');
                        message.className = 'pod-inline-error';
                        message.textContent = error.message;
                        container.appendChild(message);
                    }
                });
                row.appendChild(button);
            });
            container.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading membership requests:', error);
        container.replaceChildren();
        const message = document.createElement('p');
        message.className = 'pod-inline-error';
        message.textContent = error.message;
        container.appendChild(message);
    }
}

async function loadPodMeetups(podId, container, statusElement) {
    container.replaceChildren();
    const loading = document.createElement('p');
    loading.textContent = 'Loading meetups...';
    container.appendChild(loading);

    try {
        const response = await fetch(`${API_BASE_URL}/pods/${encodeURIComponent(podId)}/meetups`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load meetups');

        container.replaceChildren();
        const meetups = data.meetups || [];
        if (!meetups.length) {
            const empty = document.createElement('p');
            empty.textContent = 'No meetups planned yet. Suggest a time and place to get your group started.';
            container.appendChild(empty);
            return;
        }

        meetups.forEach(meetup => {
            const item = document.createElement('article');
            item.className = 'pod-meetup-card';
            const title = document.createElement('h4');
            title.textContent = meetup.title;
            const details = document.createElement('p');
            const date = new Date(meetup.starts_at);
            details.textContent = `${date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · ${meetup.location}`;
            const notes = document.createElement('p');
            notes.textContent = meetup.notes || `Suggested by ${meetup.organizer_name}`;
            const attendees = document.createElement('p');
            attendees.textContent = `${meetup.attendee_count} attending`;
            item.append(title, details, notes, attendees);

            if (meetup.is_attending) {
                const going = document.createElement('span');
                going.className = 'joined-badge';
                going.textContent = 'You’re going';
                item.appendChild(going);
            } else {
                const attend = document.createElement('button');
                attend.type = 'button';
                attend.className = 'btn btn-outline';
                attend.textContent = 'I’ll be there';
                attend.addEventListener('click', async () => {
                    attend.disabled = true;
                    try {
                        const result = await fetch(`${API_BASE_URL}/pods/${encodeURIComponent(podId)}/meetups/${encodeURIComponent(meetup.meetup_id)}/attend`, {
                            method: 'POST',
                            headers: getAuthHeaders()
                        });
                        const resultData = await result.json();
                        if (!result.ok) throw new Error(resultData.error || 'Could not RSVP');
                        await loadPodMeetups(podId, container, statusElement);
                    } catch (error) {
                        attend.disabled = false;
                        statusElement.textContent = error.message;
                        statusElement.classList.add('error');
                    }
                });
                item.appendChild(attend);
            }
            container.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading pod meetups:', error);
        container.replaceChildren();
        const message = document.createElement('p');
        message.className = 'pod-inline-error';
        message.textContent = error.message;
        container.appendChild(message);
    }
}

let podChatSocket = null;
let podChatUserId = null;
const openPodChatIds = new Set();

function initializePodChatSocket() {
    if (podChatSocket) {
        return podChatSocket;
    }

    podChatSocket = window.io({
        auth: { token: getAuthToken() }
    });

    podChatSocket.on('chat_identity', identity => {
        podChatUserId = identity.userId;
    });
    podChatSocket.on('connect', () => {
        openPodChatIds.forEach(podId => {
            podChatSocket.emit('join_pod', podId, result => {
                if (result && result.error) setPodChatStatus(podId, result.error, true);
                else setPodChatStatus(podId, 'Connected. Messages update in real time.');
            });
        });
    });
    podChatSocket.on('disconnect', () => {
        openPodChatIds.forEach(podId => setPodChatStatus(podId, 'Reconnecting to pod chat...'));
    });
    podChatSocket.on('connect_error', error => {
        console.error('Pod chat connection failed:', error);
        openPodChatIds.forEach(podId => setPodChatStatus(podId, error.message, true));
    });
    podChatSocket.on('receive_message', message => appendPodChatMessage(message));

    return podChatSocket;
}

function setPodChatStatus(podId, text, isError = false) {
    const card = [...document.querySelectorAll('#pods-container .pod-card')]
        .find(item => item.dataset.podId === podId);
    const status = card && card.querySelector('.pod-chat-status');
    if (!status) return;
    status.textContent = text;
    status.classList.toggle('error', isError);
}

function appendPodChatMessage(message) {
    const card = [...document.querySelectorAll('#pods-container .pod-card')]
        .find(item => item.dataset.podId === message.pod_id);
    const list = card && card.querySelector('.pod-chat-messages');
    if (!list || list.querySelector(`[data-message-id="${message.id}"]`)) return;

    const item = document.createElement('article');
    item.className = `pod-chat-message${message.user_id === podChatUserId ? ' own-message' : ''}`;
    item.dataset.messageId = message.id;
    const heading = document.createElement('div');
    heading.className = 'pod-chat-message-heading';
    const sender = document.createElement('strong');
    sender.textContent = message.full_name;
    const timestamp = document.createElement('time');
    const date = new Date(message.created_at);
    timestamp.dateTime = date.toISOString();
    timestamp.textContent = date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    const text = document.createElement('p');
    text.textContent = message.message_text;
    heading.append(sender, timestamp);
    item.append(heading, text);
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
}

async function openPodChat(podId, panel) {
    const status = panel.querySelector('.pod-chat-status');
    const socket = initializePodChatSocket();
    openPodChatIds.add(podId);
    status.textContent = 'Connecting to pod chat...';
    status.classList.remove('error');

    try {
        const joined = await new Promise((resolve, reject) => {
            socket.timeout(8000).emit('join_pod', podId, (error, result) => {
                if (error) reject(new Error('Timed out connecting to pod chat.'));
                else if (result && result.error) reject(new Error(result.error));
                else resolve(result);
            });
        });
        if (!joined || !joined.success) throw new Error('Unable to join pod chat.');

        const response = await fetch(`${API_BASE_URL}/pods/${encodeURIComponent(podId)}/messages`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load pod chat.');

        const list = panel.querySelector('.pod-chat-messages');
        list.replaceChildren();
        (data.messages || []).forEach(message => appendPodChatMessage(message));
        status.textContent = 'Connected. Messages update in real time.';
        status.classList.remove('error');
    } catch (error) {
        console.error('Error opening pod chat:', error);
        status.textContent = error.message;
        status.classList.add('error');
        openPodChatIds.delete(podId);
        if (socket.connected) socket.emit('leave_pod', podId);
    }
}

function leavePodChat(podId) {
    openPodChatIds.delete(podId);
    if (podChatSocket && podChatSocket.connected) {
        podChatSocket.emit('leave_pod', podId);
    }
}

const DASHBOARD_VIEWS = {
    matches: { id: 'matches-view', title: 'Compatible Study Partners' },
    pods: { id: 'pods-view', title: 'My Study Pods' },
    schedule: { id: 'schedule-view', title: 'My Schedule' },
    catalog: { id: 'catalog-view', title: 'AI Course Finder' },
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
    if (podChatSocket) {
        podChatSocket.disconnect();
        podChatSocket = null;
        if (openPodChatIds.size) initializePodChatSocket();
    }
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
        return loadStudyPods();
    } else if (selectedView === 'matches') {
        return loadDiscoverablePods('matches-pods-container', 'matches-pods-message');
    } else if (selectedView === 'schedule') {
        return loadStudentSchedule();
    } else if (selectedView === 'catalog') {
        return loadDiscoverablePods('catalog-pods-container', 'catalog-pods-message');
    } else if (selectedView === 'settings') {
        return loadUserSettings();
    }
    return Promise.resolve();
}

async function openStudyPod(podId) {
    history.replaceState(null, '', '#pods');
    await showDashboardView('pods');

    const podCard = [...document.querySelectorAll('#pods-container .pod-card')]
        .find(card => card.dataset.podId === podId);
    if (!podCard) {
        const message = document.getElementById('pods-message');
        message.textContent = 'This pod is not available in your study pods.';
        message.classList.add('error');
        return;
    }

    podCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    podCard.classList.add('pod-card-highlight');
    window.setTimeout(() => podCard.classList.remove('pod-card-highlight'), 2200);
}

async function renameStudyPod(podId, titleElement) {
    const podName = prompt('Enter a new name for this study pod:', titleElement.textContent);
    if (podName === null) return;
    if (!podName.trim()) {
        alert('Pod name is required.');
        return;
    }
    if (podName.trim().length > 100) {
        alert('Pod name must be 100 characters or fewer.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/pods/${encodeURIComponent(podId)}/name`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ podName: podName.trim() })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to rename study pod.');

        titleElement.textContent = data.pod.pod_name;
    } catch (error) {
        console.error('Error renaming study pod:', error);
        alert(error.message);
    }
}

function viewProfile(userId) {
    const profile = matchProfiles.get(userId);
    if (!profile) return;

    document.getElementById('match-profile-name').textContent = profile.fullName;
    document.getElementById('match-profile-role').textContent = profile.role === 'peer_tutor'
        ? 'Peer Tutor'
        : profile.role === 'both'
            ? 'Student and Peer Tutor'
            : 'Student Seeking Help';
    document.getElementById('match-profile-course').textContent = profile.courseTitle;
    const slots = profile.overlappingSlots || [];
    document.getElementById('match-profile-availability').textContent = slots.length
        ? slots.map(slot => slot.replace(/_/g, ' ')).join(', ')
        : 'No shared free-time slots found yet.';
    document.getElementById('match-profile-dialog').showModal();
}

// Run when dashboard loads
document.addEventListener('DOMContentLoaded', () => {
    const userMenuToggle = document.getElementById('user-menu-toggle');
    const userMenu = document.getElementById('user-menu');
    const closeUserMenu = () => {
        userMenu.hidden = true;
        userMenuToggle.setAttribute('aria-expanded', 'false');
    };

    userMenuToggle.addEventListener('click', () => {
        userMenu.hidden = !userMenu.hidden;
        userMenuToggle.setAttribute('aria-expanded', String(!userMenu.hidden));
    });
    document.addEventListener('click', event => {
        if (!event.target.closest('.user-profile')) closeUserMenu();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !userMenu.hidden) {
            closeUserMenu();
            userMenuToggle.focus();
        }
    });
    document.getElementById('account-menu-settings').addEventListener('click', () => {
        closeUserMenu();
        history.replaceState(null, '', '#settings');
        showDashboardView('settings');
    });
    document.getElementById('logout-button').addEventListener('click', logout);

    fetchUserProfile()
        .then(data => {
            currentProfileUser = data.user;
            updateDashboardUser(data.user);
        })
        .catch(error => {
            console.error('Error loading dashboard profile:', error);
            document.getElementById('user-display-name').textContent = 'Account unavailable';
        });

    const feedbackDialog = document.getElementById('feedback-dialog');
    const feedbackForm = document.getElementById('feedback-form');
    const feedbackStatus = document.getElementById('feedback-status');
    const feedbackSubmit = document.getElementById('feedback-submit');

    document.getElementById('feedback-widget-button').addEventListener('click', () => {
        feedbackStatus.textContent = '';
        feedbackStatus.classList.remove('error');
        feedbackDialog.showModal();
    });
    document.getElementById('feedback-dialog-close').addEventListener('click', () => {
        feedbackDialog.close();
    });
    feedbackDialog.addEventListener('click', event => {
        if (event.target === feedbackDialog) feedbackDialog.close();
    });
    feedbackForm.addEventListener('submit', async event => {
        event.preventDefault();
        feedbackStatus.textContent = 'Sending your feedback...';
        feedbackStatus.classList.remove('error');
        feedbackSubmit.disabled = true;

        try {
            const response = await fetch(`${API_BASE_URL}/feedback`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    email: feedbackForm.elements.email.value.trim(),
                    message: feedbackForm.elements.message.value.trim()
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to send feedback.');

            feedbackForm.reset();
            feedbackStatus.textContent = data.message;
            window.setTimeout(() => {
                if (feedbackDialog.open) feedbackDialog.close();
                feedbackStatus.textContent = '';
            }, 1800);
        } catch (error) {
            console.error('Error submitting feedback:', error);
            feedbackStatus.textContent = error.message || 'Failed to send feedback. Please try again.';
            feedbackStatus.classList.add('error');
        } finally {
            feedbackSubmit.disabled = false;
        }
    });

    document.getElementById('match-profile-close').addEventListener('click', () => {
        document.getElementById('match-profile-dialog').close();
    });
    document.querySelectorAll('.password-toggle').forEach(button => {
        button.addEventListener('click', () => {
            const passwordInput = document.getElementById(button.getAttribute('aria-controls'));
            const isVisible = passwordInput.type === 'text';
            passwordInput.type = isVisible ? 'password' : 'text';
            button.textContent = isVisible ? 'Show' : 'Hide';
            const fieldName = button.getAttribute('aria-label').replace(/^(show|hide)\s+/i, '');
            button.setAttribute('aria-label', `${isVisible ? 'Show' : 'Hide'} ${fieldName}`);
            button.setAttribute('aria-pressed', String(!isVisible));
        });
    });
    loadMatches();

    document.querySelectorAll('[data-dashboard-view]').forEach(link => {
        link.addEventListener('click', event => {
            event.preventDefault();
            const viewName = link.dataset.dashboardView;
            history.replaceState(null, '', `#${viewName}`);
            showDashboardView(viewName);
        });
    });

    document.getElementById('course-match-form').addEventListener('submit', event => {
        event.preventDefault();
        findEquivalentCoursePods(event.currentTarget);
    });

    document.getElementById('pods-container').addEventListener('submit', async event => {
        const aiForm = event.target.closest('.pod-ai-form');
        if (aiForm) {
            event.preventDefault();
            const promptInput = aiForm.elements.prompt;
            const notesInput = aiForm.elements.notes;
            const submitButton = aiForm.querySelector('button[type="submit"]');
            const status = aiForm.parentElement.querySelector('.pod-ai-status');
            const responseBox = aiForm.parentElement.querySelector('.pod-ai-response');
            responseBox.classList.remove('hidden', 'error');
            responseBox.textContent = '';
            status.textContent = 'AI Copilot is preparing a response...';
            submitButton.disabled = true;

            try {
                const response = await fetch(`${API_BASE_URL}/pods/${encodeURIComponent(aiForm.dataset.podId)}/ai-helper`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ prompt: promptInput.value.trim(), notes: notesInput.value.trim() })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to generate AI response.');
                responseBox.textContent = data.aiResponse;
                status.textContent = 'Check important details against your course materials.';
            } catch (error) {
                console.error('Error requesting AI study help:', error);
                responseBox.classList.add('error');
                responseBox.textContent = error.message;
                status.textContent = '';
            } finally {
                submitButton.disabled = false;
            }
            return;
        }

        const chatForm = event.target.closest('.pod-chat-form');
        if (chatForm) {
            event.preventDefault();
            const podId = chatForm.dataset.podId;
            const input = chatForm.elements.messageText;
            const submitButton = chatForm.querySelector('button[type="submit"]');
            const status = chatForm.closest('.pod-chat-panel').querySelector('.pod-chat-status');
            const messageText = input.value.trim();
            if (!messageText) return;

            submitButton.disabled = true;
            status.textContent = 'Sending...';
            status.classList.remove('error');
            try {
                const socket = initializePodChatSocket();
                const result = await new Promise((resolve, reject) => {
                    socket.timeout(8000).emit('send_message', { podId, messageText }, (error, response) => {
                        if (error) reject(new Error('Sending timed out. Check your connection and try again.'));
                        else if (response && response.error) reject(new Error(response.error));
                        else resolve(response);
                    });
                });
                if (!result || !result.success) throw new Error('Failed to send message.');
                input.value = '';
                status.textContent = 'Connected. Messages update in real time.';
            } catch (error) {
                console.error('Error sending pod chat message:', error);
                status.textContent = error.message;
                status.classList.add('error');
            } finally {
                submitButton.disabled = false;
                input.focus();
            }
            return;
        }

        const form = event.target.closest('.pod-meetup-form');
        if (!form) return;
        event.preventDefault();

        const formData = new FormData(form);
        const card = form.closest('.pod-card');
        const status = card.querySelector('.pod-meetup-status');
        const submitButton = form.querySelector('button[type="submit"]');
        const startsAt = new Date(formData.get('startsAt'));
        if (!Number.isFinite(startsAt.getTime())) {
            status.textContent = 'Choose a valid date and time.';
            status.classList.add('error');
            return;
        }

        status.textContent = 'Scheduling your meetup...';
        status.classList.remove('error');
        submitButton.disabled = true;
        try {
            const response = await fetch(`${API_BASE_URL}/pods/${encodeURIComponent(form.dataset.podId)}/meetups`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    title: formData.get('title'),
                    startsAt: startsAt.toISOString(),
                    location: formData.get('location'),
                    notes: formData.get('notes')
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to schedule meetup');

            form.reset();
            status.textContent = 'Meetup planned! Pod members can RSVP below.';
            const meetupList = card.querySelector('.pod-meetup-list');
            await loadPodMeetups(form.dataset.podId, meetupList, status);
        } catch (error) {
            console.error('Error scheduling meetup:', error);
            status.textContent = error.message;
            status.classList.add('error');
        } finally {
            submitButton.disabled = false;
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