if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.info('CampusSync offline support is ready:', registration.scope);
            })
            .catch(error => {
                console.error('CampusSync service worker registration failed:', error);
            });
    });
}
