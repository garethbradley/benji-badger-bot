from flask import Flask, request, jsonify, Response, send_file
import cv2
import threading
import time
import io
import os
import sys
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Motor pin definitions (BCM numbering for Raspberry Pi by default)
# Motor A (Left)
MOTOR_A_EN = 17  # Enable pin
MOTOR_A_IN1 = 27  # Direction pin 1
MOTOR_A_IN2 = 22  # Direction pin 2

# Motor B (Right)
MOTOR_B_EN = 18  # Enable pin
MOTOR_B_IN1 = 23  # Direction pin 1
MOTOR_B_IN2 = 24  # Direction pin 2

# Detect platform and initialize GPIO library accordingly
def detect_platform():
    """Detect which platform we're running on and return appropriate GPIO module"""
    platform_info = {
        "name": None,
        "gpio_module": None
    }
    
    # Try to identify platform
    try:
        with open('/proc/device-tree/model', 'r') as f:
            model = f.read().lower()
            if 'raspberry pi' in model:
                platform_info["name"] = "raspberry_pi"
                import RPi.GPIO as GPIO
                platform_info["gpio_module"] = GPIO
                print("Detected Raspberry Pi hardware")
            elif 'odroid' in model:
                platform_info["name"] = "odroid"
                try:
                    # Attempt to import WiringPi for Odroid
                    import wiringpi
                    platform_info["gpio_module"] = wiringpi
                    print("Detected Odroid hardware (using WiringPi)")
                except ImportError:
                    try:
                        # Try pyA20 for Odroid C/C2 and similar
                        import pyA20.gpio as GPIO
                        platform_info["gpio_module"] = GPIO
                        print("Detected Odroid hardware (using pyA20)")
                    except ImportError:
                        print("Couldn't load GPIO library for Odroid")
    except:
        # Fallback detection methods
        if os.path.exists('/sys/class/gpio'):
            # Generic Linux with GPIO
            try:
                import gpiod
                platform_info["name"] = "generic_linux"
                platform_info["gpio_module"] = gpiod
                print("Using libgpiod for generic Linux")
            except ImportError:
                try:
                    import RPi.GPIO as GPIO
                    platform_info["name"] = "raspberry_pi"
                    platform_info["gpio_module"] = GPIO
                    print("Assuming Raspberry Pi compatible")
                except ImportError:
                    print("WARNING: No GPIO library available")
        else:
            print("WARNING: No GPIO system detected, running in simulation mode")
            # Create a GPIO simulator for testing on non-GPIO systems
            from types import ModuleType
            SimGPIO = ModuleType('SimGPIO')
            SimGPIO.BCM = "BCM"
            SimGPIO.OUT = "OUT"
            SimGPIO.IN = "IN"
            SimGPIO.HIGH = 1
            SimGPIO.LOW = 0
            SimGPIO.setmode = lambda mode: print(f"GPIO setmode: {mode}")
            SimGPIO.setup = lambda pin, mode: print(f"GPIO setup: pin {pin}, mode {mode}")
            SimGPIO.output = lambda pin, value: print(f"GPIO output: pin {pin}, value {value}")
            SimGPIO.cleanup = lambda: print("GPIO cleanup called")
            
            class SimPWM:
                def __init__(self, pin, freq):
                    self.pin = pin
                    self.freq = freq
                    print(f"PWM initialized: pin {pin}, freq {freq}")
                
                def start(self, duty):
                    print(f"PWM start: pin {self.pin}, duty {duty}")
                
                def ChangeDutyCycle(self, duty):
                    print(f"PWM duty cycle change: pin {self.pin}, duty {duty}")
                
                def stop(self):
                    print(f"PWM stop: pin {self.pin}")
            
            SimGPIO.PWM = SimPWM
            platform_info["name"] = "simulation"
            platform_info["gpio_module"] = SimGPIO
            
    return platform_info

# Initialize GPIO based on detected platform
platform = detect_platform()
GPIO = platform["gpio_module"]
platform_name = platform["name"]

# Configure GPIO based on platform
if platform_name == "raspberry_pi":
    GPIO.setmode(GPIO.BCM)
    
    # Set up GPIO pins
    GPIO.setup(MOTOR_A_EN, GPIO.OUT)
    GPIO.setup(MOTOR_A_IN1, GPIO.OUT)
    GPIO.setup(MOTOR_A_IN2, GPIO.OUT)
    GPIO.setup(MOTOR_B_EN, GPIO.OUT)
    GPIO.setup(MOTOR_B_IN1, GPIO.OUT)
    GPIO.setup(MOTOR_B_IN2, GPIO.OUT)

    # Set up PWM
    pwm_a = GPIO.PWM(MOTOR_A_EN, 1000)  # 1000 Hz frequency
    pwm_b = GPIO.PWM(MOTOR_B_EN, 1000)  # 1000 Hz frequency

    # Start PWM with 0% duty cycle
    pwm_a.start(0)
    pwm_b.start(0)
    
elif platform_name == "odroid" and "wiringpi" in str(GPIO.__module__):
    # WiringPi setup for Odroid
    GPIO.wiringPiSetupGpio()  # Use GPIO numbering
    
    # Set up GPIO pins
    GPIO.pinMode(MOTOR_A_EN, GPIO.OUTPUT)
    GPIO.pinMode(MOTOR_A_IN1, GPIO.OUTPUT)
    GPIO.pinMode(MOTOR_A_IN2, GPIO.OUTPUT)
    GPIO.pinMode(MOTOR_B_EN, GPIO.OUTPUT)
    GPIO.pinMode(MOTOR_B_IN1, GPIO.OUTPUT)
    GPIO.pinMode(MOTOR_B_IN2, GPIO.OUTPUT)

    # Set up PWM 
    # WiringPi has a different PWM interface
    pwm_a = GPIO
    pwm_b = GPIO
    
    # Start PWM with 0% duty cycle
    GPIO.softPwmCreate(MOTOR_A_EN, 0, 100)
    GPIO.softPwmCreate(MOTOR_B_EN, 0, 100)

elif platform_name == "odroid" and "pyA20" in str(GPIO.__module__):
    # pyA20 setup for Odroid
    # You may need to map BCM pins to Odroid pins
    GPIO.init()
    
    # Set up GPIO pins  
    GPIO.setcfg(MOTOR_A_EN, GPIO.OUTPUT)
    GPIO.setcfg(MOTOR_A_IN1, GPIO.OUTPUT)
    GPIO.setcfg(MOTOR_A_IN2, GPIO.OUTPUT)
    GPIO.setcfg(MOTOR_B_EN, GPIO.OUTPUT)
    GPIO.setcfg(MOTOR_B_IN1, GPIO.OUTPUT)
    GPIO.setcfg(MOTOR_B_IN2, GPIO.OUTPUT)

    # Create PWM wrapper classes to maintain compatible interface
    class PyA20PWM:
        def __init__(self, pin, freq):
            self.pin = pin
            
        def start(self, duty):
            self.ChangeDutyCycle(duty)
            
        def ChangeDutyCycle(self, duty):
            # PyA20 doesn't have built-in PWM, simulating with rapid GPIO toggles
            # In a real implementation, consider using hardware PWM or more efficient software PWM
            if duty > 0:
                GPIO.output(self.pin, GPIO.HIGH)
            else:
                GPIO.output(self.pin, GPIO.LOW)
                
        def stop(self):
            GPIO.output(self.pin, GPIO.LOW)
            
    pwm_a = PyA20PWM(MOTOR_A_EN, 1000)
    pwm_b = PyA20PWM(MOTOR_B_EN, 1000) 
    
    pwm_a.start(0)
    pwm_b.start(0)
else:
    # Simulation or fallback mode
    if hasattr(GPIO, 'setmode'):
        GPIO.setmode(GPIO.BCM)
        
    # Set up GPIO pins as in Raspberry Pi setup
    if hasattr(GPIO, 'setup'):
        GPIO.setup(MOTOR_A_EN, GPIO.OUT)
        GPIO.setup(MOTOR_A_IN1, GPIO.OUT)
        GPIO.setup(MOTOR_A_IN2, GPIO.OUT)
        GPIO.setup(MOTOR_B_EN, GPIO.OUT)
        GPIO.setup(MOTOR_B_IN1, GPIO.OUT)
        GPIO.setup(MOTOR_B_IN2, GPIO.OUT)

    # Set up PWM
    if hasattr(GPIO, 'PWM'):
        pwm_a = GPIO.PWM(MOTOR_A_EN, 1000)  # 1000 Hz frequency
        pwm_b = GPIO.PWM(MOTOR_B_EN, 1000)  # 1000 Hz frequency

        # Start PWM with 0% duty cycle
        pwm_a.start(0)
        pwm_b.start(0)

# Wrapper functions to handle platform differences
def gpio_output(pin, value):
    """Abstract GPIO output function that works across platforms"""
    if platform_name == "raspberry_pi" or platform_name == "simulation":
        GPIO.output(pin, value)
    elif platform_name == "odroid" and "wiringpi" in str(GPIO.__module__):
        GPIO.digitalWrite(pin, value)
    elif platform_name == "odroid" and "pyA20" in str(GPIO.__module__):
        GPIO.output(pin, GPIO.HIGH if value else GPIO.LOW)
    else:
        print(f"Setting pin {pin} to {value}")

def pwm_set_duty(pwm_obj, pin, duty):
    """Abstract PWM duty cycle function that works across platforms"""
    if platform_name == "raspberry_pi" or platform_name == "simulation":
        pwm_obj.ChangeDutyCycle(duty)
    elif platform_name == "odroid" and "wiringpi" in str(GPIO.__module__):
        GPIO.softPwmWrite(pin, duty)
    elif platform_name == "odroid" and "pyA20" in str(GPIO.__module__):
        pwm_obj.ChangeDutyCycle(duty)
    else:
        print(f"Setting PWM on pin {pin} to duty {duty}")

# Camera setup
cameras = {}
camera_locks = {}

def get_camera(camera_id):
    """Get or create camera instance with thread-safe access"""
    global cameras, camera_locks
    
    # Initialize camera lock if it doesn't exist
    if camera_id not in camera_locks:
        camera_locks[camera_id] = threading.Lock()
    
    with camera_locks[camera_id]:
        # If camera doesn't exist or is closed, initialize it
        if camera_id not in cameras or not cameras[camera_id].isOpened():
            # Convert string ID to integer if it's numeric
            cam_id = int(camera_id) if camera_id.isdigit() else camera_id
            camera = cv2.VideoCapture(cam_id)
            
            # Configure camera properties if needed
            camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            
            if not camera.isOpened():
                print(f"Error: Could not open camera {camera_id}")
            else:
                print(f"Camera {camera_id} initialized")
                
            cameras[camera_id] = camera
    
    return cameras[camera_id], camera_locks[camera_id]

def generate_camera_frames(camera_id):
    """Generate frames from camera for MJPEG streaming"""
    camera, lock = get_camera(camera_id)
    
    while True:
        with lock:
            success, frame = camera.read()
        
        if not success:
            print(f"Error reading from camera {camera_id}")
            time.sleep(0.5)
            continue
        
        # Encode frame as JPEG
        ret, jpeg = cv2.imencode('.jpg', frame)
        if not ret:
            continue
            
        # Yield the frame in MJPEG format
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
        
        # Small delay to control frame rate
        time.sleep(0.05)  # 20 FPS

@app.route('/camera/<camera_id>/stream')
def camera_stream(camera_id):
    """Route to stream video from a camera"""
    return Response(generate_camera_frames(camera_id),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/camera/<camera_id>/snapshot')
def camera_snapshot(camera_id):
    """Route to get a single snapshot from a camera"""
    camera, lock = get_camera(camera_id)
    
    with lock:
        success, frame = camera.read()
    
    if not success:
        return jsonify({
            'status': 'error',
            'message': f'Failed to capture image from camera {camera_id}'
        }), 500
    
    # Encode frame as JPEG
    ret, jpeg = cv2.imencode('.jpg', frame)
    if not ret:
        return jsonify({
            'status': 'error',
            'message': 'Failed to encode camera image'
        }), 500
    
    # Return image as response
    return send_file(
        io.BytesIO(jpeg.tobytes()),
        mimetype='image/jpeg',
        as_attachment=False
    )

@app.route('/camera/<camera_id>', methods=['GET'])
def camera_status(camera_id):
    """Route to check camera status"""
    try:
        camera, _ = get_camera(camera_id)
        is_open = camera.isOpened()
        
        if is_open:
            # Get camera properties
            width = int(camera.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(camera.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = camera.get(cv2.CAP_PROP_FPS)
            
            return jsonify({
                'status': 'success',
                'camera_id': camera_id,
                'is_open': is_open,
                'width': width,
                'height': height,
                'fps': fps,
                'stream_url': f'/camera/{camera_id}/stream',
                'snapshot_url': f'/camera/{camera_id}/snapshot'
            })
        else:
            return jsonify({
                'status': 'error',
                'camera_id': camera_id,
                'is_open': is_open,
                'message': 'Camera is not available'
            }), 404
            
    except Exception as e:
        return jsonify({
            'status': 'error',
            'camera_id': camera_id,
            'message': str(e)
        }), 500

@app.route('/cameras', methods=['GET'])
def list_cameras():
    """Route to list all available cameras with their names"""
    available_cameras = {}
    
    # List existing cameras that are already opened
    for cam_id, camera in cameras.items():
        is_open = camera.isOpened()
        name = get_camera_name(cam_id, camera)
        available_cameras[cam_id] = {
            "available": is_open,
            "name": name
        }
    
    # Try to detect cameras on the system
    detected_cameras = detect_system_cameras()
    
    # Add detected cameras to the list if they're not already there
    for cam_id, camera_info in detected_cameras.items():
        if cam_id not in available_cameras:
            available_cameras[cam_id] = camera_info
    
    return jsonify({
        'status': 'success',
        'cameras': available_cameras
    })

def detect_system_cameras():
    """Detect cameras connected to the system"""
    cameras = {}
    
    # First try with video device files (Linux)
    if os.path.exists('/dev'):
        for device in os.listdir('/dev'):
            if device.startswith('video'):
                cam_id = device.replace('video', '')
                if cam_id.isdigit():
                    # Try to open the device
                    cap = cv2.VideoCapture(int(cam_id))
                    is_available = cap.isOpened()
                    name = get_camera_name(cam_id, cap) if is_available else f"Camera {cam_id}"
                    
                    cameras[cam_id] = {
                        "available": is_available,
                        "name": name
                    }
                    
                    # Release the camera
                    if is_available:
                        cap.release()
    
    # If no cameras were found with device files, or we're not on Linux,
    # try a few indices as fallback (more portable)
    if not cameras:
        for i in range(10):  # Try indices 0-9
            cam_id = str(i)
            cap = cv2.VideoCapture(i)
            is_available = cap.isOpened()
            
            if is_available or i < 3:  # Always include first 3 indices as potential cameras
                name = get_camera_name(cam_id, cap) if is_available else f"Camera {i}"
                cameras[cam_id] = {
                    "available": is_available,
                    "name": name
                }
            
            # Release the camera
            if is_available:
                cap.release()
            
            # Stop after first unavailable camera to avoid long delays
            if not is_available and i >= 3:
                break
    
    return cameras

def get_camera_name(cam_id, camera):
    """Get the camera name based on device info or position"""
    # Default name based on ID
    if cam_id == "0":
        name = "Default Camera"
    elif cam_id.isdigit():
        name = f"Camera {cam_id}"
    else:
        name = f"{cam_id}"
    
    # Try to get better name from camera properties if available
    try:
        # On some systems, this might provide the actual camera name
        if hasattr(camera, 'getBackendName'):
            backend = camera.getBackendName()
            if backend and backend != "":
                name += f" ({backend})"
        
        # On Raspberry Pi with Pi Camera, this might help identify it
        if platform_name == "raspberry_pi" and cam_id in ["0", 0]:
            if os.path.exists("/proc/device-tree/model"):
                with open("/proc/device-tree/model", "r") as f:
                    model = f.read().lower()
                    if "pi 4" in model or "pi 5" in model:
                        name = "Raspberry Pi Camera"
    except:
        pass  # Ignore errors in name detection
        
    return name

@app.route('/camera/<camera_id>/release', methods=['POST'])
def release_camera(camera_id):
    """Route to release a camera"""
    if camera_id in cameras:
        with camera_locks[camera_id]:
            cameras[camera_id].release()
        
        return jsonify({
            'status': 'success',
            'message': f'Camera {camera_id} released'
        })
    else:
        return jsonify({
            'status': 'error',
            'message': f'Camera {camera_id} not found'
        }), 404


@app.route('/control', methods=['POST'])
def control_motors():
    """Route for controlling motors"""
    try:
        data = request.json
        forward_reverse = data.get('forwardReverse', 0)
        left_right = data.get('leftRight', 0)
        
        # Calculate motor values based on joystick inputs
        # This is a simple differential drive calculation
        left_motor = forward_reverse + left_right
        right_motor = forward_reverse - left_right
        
        # Clamp values to -255 to 255 range
        left_motor = max(-255, min(255, left_motor))
        right_motor = max(-255, min(255, right_motor))
        
        # Control left motor
        if left_motor > 0:  # Forward
            gpio_output(MOTOR_A_IN1, GPIO.HIGH)
            gpio_output(MOTOR_A_IN2, GPIO.LOW)
            pwm_set_duty(pwm_a, MOTOR_A_EN, abs(left_motor) / 255 * 100)
        elif left_motor < 0:  # Reverse
            gpio_output(MOTOR_A_IN1, GPIO.LOW)
            gpio_output(MOTOR_A_IN2, GPIO.HIGH)
            pwm_set_duty(pwm_a, MOTOR_A_EN, abs(left_motor) / 255 * 100)
        else:  # Stop
            gpio_output(MOTOR_A_IN1, GPIO.LOW)
            gpio_output(MOTOR_A_IN2, GPIO.LOW)
            pwm_set_duty(pwm_a, MOTOR_A_EN, 0)
        
        # Control right motor
        if right_motor > 0:  # Forward
            gpio_output(MOTOR_B_IN1, GPIO.HIGH)
            gpio_output(MOTOR_B_IN2, GPIO.LOW)
            pwm_set_duty(pwm_b, MOTOR_B_EN, abs(right_motor) / 255 * 100)
        elif right_motor < 0:  # Reverse
            gpio_output(MOTOR_B_IN1, GPIO.LOW)
            gpio_output(MOTOR_B_IN2, GPIO.HIGH)
            pwm_set_duty(pwm_b, MOTOR_B_EN, abs(right_motor) / 255 * 100)
        else:  # Stop
            gpio_output(MOTOR_B_IN1, GPIO.LOW)
            gpio_output(MOTOR_B_IN2, GPIO.LOW)
            pwm_set_duty(pwm_b, MOTOR_B_EN, 0)
        
        return jsonify({
            'status': 'success',
            'leftMotor': left_motor,
            'rightMotor': right_motor,
            'platform': platform_name
        })
    except Exception as e:
        print(f"Control error: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/status', methods=['GET'])
def get_status():
    """Route for checking server status"""
    camera_status = {}
    for camera_id in cameras:
        camera, _ = get_camera(camera_id)
        camera_status[camera_id] = camera.isOpened()
    
    return jsonify({
        'status': 'online',
        'cameras': camera_status,
        'platform': platform_name,
        'message': f'Robot control server is running on {platform_name}'
    })

if __name__ == '__main__':
    try:
        print(f"Starting GPIO server on platform: {platform_name}")
        app.run(host='0.0.0.0', port=8080, threaded=True)
    finally:
        # Clean up based on platform
        if platform_name == "raspberry_pi" or platform_name == "simulation":
            if hasattr(pwm_a, 'stop'):
                pwm_a.stop()
                pwm_b.stop()
            if hasattr(GPIO, 'cleanup'):
                GPIO.cleanup()
        elif platform_name == "odroid" and "wiringpi" in str(GPIO.__module__):
            # WiringPi cleanup for Odroid
            pass  # WiringPi often doesn't need explicit cleanup
        elif platform_name == "odroid" and "pyA20" in str(GPIO.__module__):
            # pyA20 cleanup for Odroid
            pwm_a.stop()
            pwm_b.stop()
            
        # Release cameras
        for camera_id in cameras:
            cameras[camera_id].release()