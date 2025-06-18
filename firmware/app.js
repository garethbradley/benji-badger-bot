document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const cameraFeed = document.getElementById('camera-feed');
    const noCamera = document.getElementById('no-camera');
    const leftJoystick = document.getElementById('joystick-left');
    const rightJoystick = document.getElementById('joystick-right');
    const leftValue = document.getElementById('left-value');
    const rightValue = document.getElementById('right-value');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsOverlay = document.getElementById('settings-overlay');
    const saveSettingsBtn = document.getElementById('server-connect-btn');
    const closeSettingsBtn = document.getElementById('close-settings');
    const cameraSelect = document.getElementById('camera-select');
    const gpioAddressInput = document.getElementById('gpio-address');
    const connectionStatuses = document.getElementsByClassName('status-indicator');
    const refreshCamerasBtn = document.getElementById('refresh-cameras');
    // const connectBtn = document.getElementById('connect-btn');

    // Add connection/control container elements
    const controlContainer = document.getElementById('control-container') || document.querySelector('.control-container');
    const connectionContainer = document.getElementById('connection-container')/* || createConnectionContainer()*/;

    // State variables
    let leftJoystickActive = false;
    let rightJoystickActive = false;
    let leftJoystickValue = 0;
    let rightJoystickValue = 0;
    let streamUrl = '';
    let cameraUpdateInterval = null;
    let serverCheckInterval = null;
    let isServerConnected = false;
    let connectionState = 'disconnected'; // 'disconnected', 'server_connected', 'camera_connected'

    // Load settings from localStorage
    const settings = {
        cameraId: localStorage.getItem('cameraId') || '0',
        gpioAddress: localStorage.getItem('gpioAddress') || '192.168.0.208:8080'
    };

    // Initialize settings inputs
    gpioAddressInput.value = settings.gpioAddress;

    // Initialize joystick elements
    const leftKnob = leftJoystick.querySelector('.joystick-knob');
    const rightKnob = rightJoystick.querySelector('.joystick-knob');

    // Calculate joystick dimensions
    const joystickSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--joystick-size'));
    const knobSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--knob-size'));
    const maxDistance = (joystickSize - knobSize) / 2;

    // Create connection container if it doesn't exist
    // function createConnectionContainer() {
    //     const container = document.createElement('div');
    //     container.id = 'connection-container';
    //     container.className = 'fullscreen-container';

    //     container.innerHTML = `
    //         <div class="connection-panel">
    //             <h2>Robot Control</h2>
    //             <div class="connection-form">
    //                 <div class="form-group">
    //                     <label for="gpio-address">Server Address:</label>
    //                     <input type="text" id="gpio-address-connect" value="${settings.gpioAddress}">
    //                 </div>
    //                 <button id="connect-btn" class="primary-button">Connect</button>
    //                 <div class="connection-status">
    //                     <span class="status-label">Status:</span>
    //                     <span id="connection-status-text" class="status-indicator disconnected">Disconnected</span>
    //                 </div>
    //             </div>
    //         </div>
    //     `;

    //     document.body.appendChild(container);

    //     // Set up event listener for the connect button
    //     container.querySelector('#connect-btn').addEventListener('click', () => {
    //         const addressInput = container.querySelector('#gpio-address-connect');
    //         settings.gpioAddress = addressInput.value;
    //         localStorage.setItem('gpioAddress', settings.gpioAddress);
    //         gpioAddressInput.value = settings.gpioAddress;
    //         checkServerConnection();
    //     });

    //     // Add some basic styles
    //     const style = document.createElement('style');
    //     style.textContent = `
    //         .fullscreen-container {
    //             position: fixed;
    //             top: 0;
    //             left: 0;
    //             right: 0;
    //             bottom: 0;
    //             background: rgba(0, 0, 0, 0.8);
    //             display: flex;
    //             align-items: center;
    //             justify-content: center;
    //             z-index: 1000;
    //         }
    //         .connection-panel {
    //             background: white;
    //             border-radius: 8px;
    //             padding: 20px;
    //             width: 80%;
    //             max-width: 400px;
    //         }
    //         .connection-form {
    //             display: flex;
    //             flex-direction: column;
    //             gap: 15px;
    //         }
    //         .form-group {
    //             display: flex;
    //             flex-direction: column;
    //             gap: 5px;
    //         }
    //         .connection-status {
    //             display: flex;
    //             align-items: center;
    //             gap: 10px;
    //         }
    //         .primary-button {
    //             padding: 10px;
    //             background: #4CAF50;
    //             color: white;
    //             border: none;
    //             border-radius: 4px;
    //             cursor: pointer;
    //             font-size: 16px;
    //         }
    //         .primary-button:hover {
    //             background: #388E3C;
    //         }
    //         .status-indicator {
    //             padding: 5px 10px;
    //             border-radius: 4px;
    //             font-weight: bold;
    //         }
    //         .status-indicator.connected {
    //             background-color: #4CAF50;
    //             color: white;
    //         }
    //         .status-indicator.connecting {
    //             background-color: #FFC107;
    //             color: black;
    //         }
    //         .status-indicator.disconnected {
    //             background-color: #F44336;
    //             color: white;
    //         }
    //     `;
    //     document.head.appendChild(style);

    //     return container;
    // }

    // Update UI based on connection state
    function updateUIForConnectionState() {
        switch (connectionState) {
            case 'disconnected':
                // Show connection panel, hide controls
                if (connectionContainer) connectionContainer.style.display = 'flex';
                if (controlContainer) controlContainer.style.display = 'none';
                break;

            case 'server_connected':
            case 'camera_connected':
                // Hide connection panel, show controls
                if (connectionContainer) connectionContainer.style.display = 'none';
                if (controlContainer) controlContainer.style.display = 'block';
                break;
        }
    }

    // Initialize camera options
    function initCameraOptions() {
        // Clear previous options
        cameraSelect.innerHTML = '';

        // Add a loading option while we fetch cameras
        const loadingOption = document.createElement('option');
        loadingOption.text = 'Loading cameras...';
        loadingOption.disabled = true;
        cameraSelect.appendChild(loadingOption);
        cameraSelect.value = loadingOption.value;

        // Check server connection
        checkServerConnection();
    }

    // Check if server is reachable
    function checkServerConnection() {
        // Clear previous status check interval
        if (serverCheckInterval) {
            clearInterval(serverCheckInterval);
        }

        // Show connecting message
        updateConnectionStatus('connecting');

        // Try to connect to server
        fetch(`http://${settings.gpioAddress}/status`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            // Short timeout to avoid long waits
            signal: AbortSignal.timeout(5000)
        })
            .then(response => {
                if (response.ok) {
                    return response.json();
                }
                throw new Error('Server returned error status');
            })
            .then(data => {
                isServerConnected = true;
                updateConnectionStatus('connected');
                connectionState = 'server_connected';
                updateUIForConnectionState();

                // Fetch available cameras
                fetchAvailableCameras();

                // Set up periodic server check
                serverCheckInterval = setInterval(() => {
                    // Use a simple ping check that doesn't update the UI
                    fetch(`http://${settings.gpioAddress}/status`, {
                        method: 'GET',
                        headers: { 'Accept': 'application/json' },
                        signal: AbortSignal.timeout(3000)
                    })
                        .then(response => response.ok ? response.json() : Promise.reject())
                        .then(() => {
                            // Still connected, do nothing
                            if (!isServerConnected) {
                                isServerConnected = true;
                                updateConnectionStatus('connected');
                            }
                        })
                        .catch(() => {
                            if (isServerConnected) {
                                isServerConnected = false;
                                updateConnectionStatus('disconnected');
                                connectionState = 'disconnected';
                                updateUIForConnectionState();
                                showCameraError('Server connection lost');
                            }
                        });
                }, 5000);
            })
            .catch(error => {
                console.error('Server connection error:', error);
                isServerConnected = false;
                updateConnectionStatus('disconnected');
                connectionState = 'disconnected';
                updateUIForConnectionState();

                // Show no camera message
                showCameraError('Cannot connect to robot server');

                // Clear camera options and add default options as fallback
                populateFallbackCameraOptions();

                // Try again in 5 seconds
                serverCheckInterval = setInterval(checkServerConnection, 5000);
            });
    }

    // Fetch available cameras from the server
    function fetchAvailableCameras() {
        fetch(`http://${settings.gpioAddress}/cameras`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(3000)
        })
            .then(response => {
                if (response.ok) {
                    return response.json();
                }
                throw new Error('Failed to get camera list');
            })
            .then(data => {
                // Clear existing options
                cameraSelect.innerHTML = '';

                // Check if we got camera data
                if (data.status === 'success' && data.cameras) {
                    let camerasFound = false;

                    // Add each available camera as an option
                    Object.keys(data.cameras).forEach(camId => {
                        const cameraInfo = data.cameras[camId];
                        const isAvailable = cameraInfo.available;
                        const cameraName = cameraInfo.name || `Camera ${camId}`;

                        // Skip unavailable cameras
                        if (isAvailable) {
                            const option = document.createElement('option');
                            option.value = camId;

                            // Format the camera name
                            option.text = cameraName;

                            cameraSelect.appendChild(option);
                        }

                        camerasFound = camerasFound || isAvailable;
                    });

                    // If no cameras were found, add a message
                    if (!camerasFound) {
                        const noOption = document.createElement('option');
                        noOption.text = 'No cameras detected';
                        noOption.disabled = true;
                        cameraSelect.appendChild(noOption);
                        showCameraError('No cameras available');
                    } else {
                        // Try to select the previously saved camera if available
                        if (settings.cameraId && selectCameraIfAvailable(settings.cameraId)) {
                            // If successful, start the camera stream
                            startCameraStream();
                        } else {
                            // Otherwise select the first available camera
                            for (let i = 0; i < cameraSelect.options.length; i++) {
                                if (!cameraSelect.options[i].disabled) {
                                    cameraSelect.selectedIndex = i;
                                    settings.cameraId = cameraSelect.options[i].value;
                                    localStorage.setItem('cameraId', settings.cameraId);
                                    startCameraStream();
                                    break;
                                }
                            }
                        }
                    }
                } else {
                    // Fall back to default options if data format is unexpected
                    populateFallbackCameraOptions();
                    showCameraError('Failed to get camera list');
                }
            })
            .catch(error => {
                console.error('Error fetching cameras:', error);
                populateFallbackCameraOptions();
                showCameraError('Error accessing cameras');
            });
    }

    // Select a camera from the dropdown if it exists and is available
    function selectCameraIfAvailable(cameraId) {
        for (let i = 0; i < cameraSelect.options.length; i++) {
            if (cameraSelect.options[i].value === cameraId && !cameraSelect.options[i].disabled) {
                cameraSelect.selectedIndex = i;
                return true;
            }
        }
        return false;
    }

    // Add fallback camera options when server cannot be reached
    function populateFallbackCameraOptions() {
        // Clear existing options
        cameraSelect.innerHTML = '';

        const noOption = document.createElement('option');
        noOption.text = 'No cameras available';
        noOption.disabled = true;
        cameraSelect.appendChild(noOption);
    }

    // Update connection status display
    function updateConnectionStatus(status) {
        console.log('Connection status:', status);
        if (connectionStatuses) {
            console.log('Updating connection status element');

            // Update all connection status indicators
            for (let i = 0; i < connectionStatuses.length; i++) {
                const connectionStatus = connectionStatuses[i];

                connectionStatus.className = `status-indicator ${status}`;

                switch (status) {
                    case 'connected':
                        connectionStatus.textContent = 'Connected';
                        break;
                    case 'connecting':
                        connectionStatus.textContent = 'Connecting...';
                        break;
                    case 'disconnected':
                        connectionStatus.textContent = 'Disconnected';
                        break;
                }
            }


        }
    }

    // Show camera error message
    function showCameraError(message) {
        noCamera.textContent = message || 'Camera not available';
        noCamera.style.display = 'block';
        cameraFeed.style.display = 'none';

        // Stop any existing camera update interval
        if (cameraUpdateInterval) {
            clearInterval(cameraUpdateInterval);
            cameraUpdateInterval = null;
        }
    }

    // Start camera stream from server
    function startCameraStream() {
        try {
            // Only proceed if server is connected
            if (!isServerConnected) {
                showCameraError('Server not connected');
                return;
            }

            // Get the selected camera ID and save to local storage
            settings.cameraId = cameraSelect.value;
            localStorage.setItem('cameraId', settings.cameraId);

            // Construct camera stream URL (without query parameters to prevent connection issues)
            streamUrl = `http://${settings.gpioAddress}/camera/${settings.cameraId}/stream`;

            // Show loading message
            noCamera.textContent = 'Loading camera...';
            noCamera.style.display = 'block';
            cameraFeed.style.display = 'none';

            // First check if camera is available with status endpoint
            fetch(`http://${settings.gpioAddress}/camera/${settings.cameraId}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(3000)
            })
                .then(response => {
                    if (!response.ok) throw new Error('Camera status check failed');
                    return response.json();
                })
                .then(data => {
                    if (data.status === 'success' && data.is_open) {
                        // Camera is available, show video feed
                        noCamera.style.display = 'none';
                        cameraFeed.style.display = 'block';

                        // Set the image source directly to the MJPEG stream URL
                        cameraFeed.src = streamUrl;

                        // Update connection state
                        connectionState = 'camera_connected';

                        // Call updateUIForConnectionState to reflect the new state in the UI
                        updateUIForConnectionState();

                        // Handle image load error
                        cameraFeed.onerror = () => {
                            showCameraError('Error loading camera feed');
                            connectionState = 'server_connected';
                            updateUIForConnectionState(); // Update UI on error too
                        };

                        // Add a successful load handler
                        cameraFeed.onload = () => {
                            console.log('Camera stream loaded successfully');
                        };
                    } else {
                        throw new Error('Camera not available');
                    }
                })
                .catch(error => {
                    console.error('Camera error:', error);
                    showCameraError('Camera not available or not connected');
                    connectionState = 'server_connected';
                    updateUIForConnectionState(); // Update UI on error
                });
        } catch (error) {
            console.error('Error starting camera stream:', error);
            showCameraError('Error accessing camera');
            connectionState = 'server_connected';
            updateUIForConnectionState(); // Update UI on exception
        }
    }

    // Joystick control functions
    function setupJoystick(joystick, knob, valueDisplay, isVertical = true) {
        // Touch start event
        joystick.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (isVertical) {
                leftJoystickActive = true;
            } else {
                rightJoystickActive = true;
            }
            updateJoystickPosition(e.touches[0], joystick, knob, valueDisplay, isVertical);
        });

        // Mouse down event (for testing on desktop)
        joystick.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (isVertical) {
                leftJoystickActive = true;
            } else {
                rightJoystickActive = true;
            }
            updateJoystickPosition(e, joystick, knob, valueDisplay, isVertical);
        });

        // Reset joystick position
        function resetJoystick() {
            knob.style.transform = 'translate(-50%, -50%)';
            if (isVertical) {
                leftJoystickActive = false;
                leftJoystickValue = 0;
                valueDisplay.textContent = '0';
            } else {
                rightJoystickActive = false;
                rightJoystickValue = 0;
                valueDisplay.textContent = '0';
            }
            sendControlValues();
        }

        // Touch end event
        joystick.addEventListener('touchend', resetJoystick);
        joystick.addEventListener('touchcancel', resetJoystick);

        // Mouse up event
        window.addEventListener('mouseup', () => {
            if ((isVertical && leftJoystickActive) || (!isVertical && rightJoystickActive)) {
                resetJoystick();
            }
        });
    }

    // Update joystick position and value
    function updateJoystickPosition(event, joystick, knob, valueDisplay, isVertical) {
        const joystickRect = joystick.getBoundingClientRect();
        const centerX = joystickRect.width / 2;
        const centerY = joystickRect.height / 2;

        // Get touch/mouse position relative to joystick center
        const clientX = event.clientX || event.touches[0].clientX;
        const clientY = event.clientY || event.touches[0].clientY;

        let x = clientX - joystickRect.left - centerX;
        let y = clientY - joystickRect.top - centerY;

        // Restrict movement based on joystick type
        if (isVertical) {
            // Left joystick - vertical movement only
            x = 0;
        } else {
            // Right joystick - horizontal movement only
            y = 0;
        }

        // Calculate distance from center
        const distance = Math.sqrt(x * x + y * y);

        // Limit distance to max radius
        if (distance > maxDistance) {
            const ratio = maxDistance / distance;
            x *= ratio;
            y *= ratio;
        }

        // Update knob position
        knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;

        // Calculate value (-255 to 255)
        let value;
        if (isVertical) {
            // For left joystick (forward/reverse), use Y axis
            // Invert Y so up is positive (forward)
            value = Math.round((-y / maxDistance) * 255);
            leftJoystickValue = value;
        } else {
            // For right joystick (left/right), use X axis
            value = Math.round((x / maxDistance) * 255);
            rightJoystickValue = value;
        }

        // Update value display
        valueDisplay.textContent = value;

        // Send control values to server
        sendControlValues();
    }

    // Move joystick on touch/mouse move
    function handleMove(event) {
        event.preventDefault();

        if (leftJoystickActive) {
            updateJoystickPosition(event, leftJoystick, leftKnob, leftValue, true);
        }

        if (rightJoystickActive) {
            updateJoystickPosition(event, rightJoystick, rightKnob, rightValue, false);
        }
    }

    // Add move event listeners
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('mousemove', handleMove);

    // Setup joysticks
    setupJoystick(leftJoystick, leftKnob, leftValue, true);
    setupJoystick(rightJoystick, rightKnob, rightValue, false);

    // Send control values to server
    function sendControlValues() {
        // Only send if server is connected
        if (!isServerConnected) return;

        fetch(`http://${settings.gpioAddress}/control`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: `{
                "forwardReverse": ${leftJoystickValue},
                "leftRight": ${rightJoystickValue}
            }`,
            // Short timeout to avoid blocking UI
            signal: AbortSignal.timeout(1000)
        }).catch(error => {
            console.error('Error sending control values:', error);
            // If we get a connection error, check server connection
            if (error.name === 'AbortError' || error.name === 'TypeError') {
                isServerConnected = false;
                updateConnectionStatus('disconnected');
                connectionState = 'disconnected';
                updateUIForConnectionState();
                showCameraError('Lost connection to server');
            }
        });
    }

    // Settings panel functionality
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            settingsOverlay.classList.remove('hidden');
        });
    }

    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => {
            settingsOverlay.classList.add('hidden');
        });
    }

    // Save settings event listener
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            // Save settings to localStorage
            settings.cameraId = cameraSelect.value;
            settings.gpioAddress = gpioAddressInput.value;

            localStorage.setItem('cameraId', settings.cameraId);
            localStorage.setItem('gpioAddress', settings.gpioAddress);

            console.log('Settings saved:', settings);

            // Close settings panel
            settingsOverlay.classList.add('hidden');

            // Check if server address changed
            checkServerConnection();
        });
    }

    // Camera selection change event
    cameraSelect.addEventListener('change', () => {
        settings.cameraId = cameraSelect.value;
        localStorage.setItem('cameraId', settings.cameraId);
        startCameraStream();
    });

    // Add camera refresh button event listener
    if (refreshCamerasBtn) {
        refreshCamerasBtn.addEventListener('click', () => {
            fetchAvailableCameras();
        });
    }

    // Check for orientation changes
    window.addEventListener('resize', checkOrientation);

    function checkOrientation() {
        const orientationWarning = document.getElementById('orientation-warning');
        if (orientationWarning) {
            if (window.innerHeight > window.innerWidth) {
                orientationWarning.style.display = 'flex';
            } else {
                orientationWarning.style.display = 'none';
            }
        }
    }

    // Initial orientation check
    checkOrientation();

    // Initial UI update
    updateUIForConnectionState();

    // Initialize app
    initCameraOptions();
});