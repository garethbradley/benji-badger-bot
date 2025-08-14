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
    // Add dialog-specific elements
    const cameraSelectDialog = document.getElementById('camera-select-dialog');
    const refreshCamerasBtnDialog = document.getElementById('refresh-cameras-dialog');
    const saveSettingsDialogBtn = document.getElementById('save-settings');

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
        gpioAddress: localStorage.getItem('gpioAddress') || (window.location.host + ':8080')
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
            signal: AbortSignal.timeout(5000)
        })
            .then(response => {
                if (response.ok) {
                    return response.json();
                }
                throw new Error('Failed to get camera list');
            })
            .then(data => {
                // Clear existing options
                if (cameraSelect) cameraSelect.innerHTML = '';
                if (cameraSelectDialog) cameraSelectDialog.innerHTML = '';

                // Check if we got camera data
                if (data.status === 'success' && data.cameras) {
                    let camerasFound = false;

                    // Add each available camera as an option
                    Object.keys(data.cameras).forEach(camId => {
                        const cameraInfo = data.cameras[camId];
                        const isAvailable = cameraInfo.available;
                        const cameraName = cameraInfo.name || `Camera ${camId}`;

                        if (isAvailable) {
                            if (cameraSelect) {
                                const option = document.createElement('option');
                                option.value = camId;
                                option.text = cameraName;
                                cameraSelect.appendChild(option);
                            }
                            if (cameraSelectDialog) {
                                const optionDlg = document.createElement('option');
                                optionDlg.value = camId;
                                optionDlg.text = cameraName;
                                cameraSelectDialog.appendChild(optionDlg);
                            }
                        }

                        camerasFound = camerasFound || isAvailable;
                    });

                    // If no cameras were found, add a message
                    if (!camerasFound) {
                        const noOption = document.createElement('option');
                        noOption.text = 'No cameras detected';
                        noOption.disabled = true;
                        if (cameraSelect) cameraSelect.appendChild(noOption.cloneNode(true));
                        if (cameraSelectDialog) cameraSelectDialog.appendChild(noOption.cloneNode(true));
                        showCameraError('No cameras available');
                    } else {
                        // Try to select the previously saved camera if available
                        if (settings.cameraId) {
                            if (cameraSelect) selectCameraIfAvailable(settings.cameraId);
                            if (cameraSelectDialog) {
                                // mirror selection in dialog
                                for (let i = 0; i < cameraSelectDialog.options.length; i++) {
                                    if (cameraSelectDialog.options[i].value === settings.cameraId && !cameraSelectDialog.options[i].disabled) {
                                        cameraSelectDialog.selectedIndex = i;
                                        break;
                                    }
                                }
                            }
                            // Start the camera stream if we are not already connected
                            startCameraStream();
                        } else if (cameraSelect && cameraSelect.options.length) {
                            // Otherwise select the first available camera
                            for (let i = 0; i < cameraSelect.options.length; i++) {
                                if (!cameraSelect.options[i].disabled) {
                                    cameraSelect.selectedIndex = i;
                                    settings.cameraId = cameraSelect.options[i].value;
                                    localStorage.setItem('cameraId', settings.cameraId);
                                    if (cameraSelectDialog) cameraSelectDialog.value = settings.cameraId;
                                    startCameraStream();
                                    break;
                                }
                            }
                        }
                    }
                } else {
                    // Fall back to default options if data format is unexpected
                    populateFallbackCameraOptions();
                    if (cameraSelectDialog) {
                        cameraSelectDialog.innerHTML = '';
                        const noOption = document.createElement('option');
                        noOption.text = 'No cameras available';
                        noOption.disabled = true;
                        cameraSelectDialog.appendChild(noOption);
                    }
                    showCameraError('Failed to get camera list');
                }
            })
            .catch(error => {
                console.error('Error fetching cameras:', error);
                populateFallbackCameraOptions();
                if (cameraSelectDialog) {
                    cameraSelectDialog.innerHTML = '';
                    const noOption = document.createElement('option');
                    noOption.text = 'No cameras available';
                    noOption.disabled = true;
                    cameraSelectDialog.appendChild(noOption);
                }
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
            // Refresh camera list when opening settings
            fetchAvailableCameras();
            // Ensure dialog reflects current selection
            if (cameraSelectDialog) {
                cameraSelectDialog.value = settings.cameraId || '';
            }
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

    // Save settings from dialog
    if (saveSettingsDialogBtn) {
        saveSettingsDialogBtn.addEventListener('click', () => {
            if (cameraSelectDialog && cameraSelectDialog.value) {
                settings.cameraId = cameraSelectDialog.value;
                localStorage.setItem('cameraId', settings.cameraId);
                // Sync the hidden/main select for consistency
                if (cameraSelect) {
                    selectCameraIfAvailable(settings.cameraId);
                }
                startCameraStream();
            }
            settingsOverlay.classList.add('hidden');
        });
    }

    // Camera selection change event
    cameraSelect.addEventListener('change', () => {
        settings.cameraId = cameraSelect.value;
        localStorage.setItem('cameraId', settings.cameraId);
        startCameraStream();
    });

    // Refresh cameras from dialog
    if (refreshCamerasBtnDialog) {
        refreshCamerasBtnDialog.addEventListener('click', () => {
            fetchAvailableCameras();
        });
    }

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