// Service Worker for Robot Control Interface
const CACHE_NAME = 'robot-control-cache-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

// Install event - cache assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Caching app assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.filter(cacheName => {
                    return cacheName !== CACHE_NAME;
                }).map(cacheName => {
                    return caches.delete(cacheName);
                })
            );
        })
    );
});

// Fetch event - serve from cache if available
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                return response || fetch(event.request);
            })
            .catch(() => {
                // Return a fallback for offline usage
                if (event.request.url.indexOf('.html') > -1) {
                    return caches.match('/index.html');
                }
            })
    );
});

// GPIO control variables
let lastForwardReverse = 0;
let lastLeftRight = 0;
let gpioAddress = '127.0.0.1:8000';
let controlInterval = null;

// Handle messages from the main thread
self.addEventListener('message', event => {
    const data = event.data;
    
    if (data.type === 'CONTROL_UPDATE') {
        // Update control values
        lastForwardReverse = data.forwardReverse;
        lastLeftRight = data.leftRight;
        gpioAddress = data.gpioAddress;
        
        // Ensure control loop is running
        if (!controlInterval) {
            startControlLoop();
        }
    }
});

// Start control loop to send PWM values to Raspberry Pi
function startControlLoop() {
    // Clear any existing interval
    if (controlInterval) {
        clearInterval(controlInterval);
    }
    
    // Set up interval to send control values to GPIO
    controlInterval = setInterval(() => {
        sendPwmToGpio(lastForwardReverse, lastLeftRight);
    }, 50); // Send updates 20 times per second
}

// Send PWM values to Raspberry Pi GPIO
async function sendPwmToGpio(forwardReverse, leftRight) {
    try {
        // Calculate motor values based on joystick inputs
        // This is a simple differential drive calculation
        let leftMotor, rightMotor;
        
        // Forward/reverse affects both motors equally
        leftMotor = forwardReverse;
        rightMotor = forwardReverse;
        
        // Left/right differential
        leftMotor += leftRight;
        rightMotor -= leftRight;
        
        // Clamp values to -255 to 255 range
        leftMotor = Math.max(-255, Math.min(255, leftMotor));
        rightMotor = Math.max(-255, Math.min(255, rightMotor));
        
        // Send to Raspberry Pi GPIO server
        const response = await fetch(`http://${gpioAddress}/control`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                leftMotor,
                rightMotor
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
    } catch (error) {
        console.error('Error sending PWM to GPIO:', error);
    }
}

