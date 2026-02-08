import mss
import cv2
import numpy as np
import pytesseract
import time

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

def list_monitors():
    with mss.mss() as sct:
        monitors = sct.monitors
        print("Available monitors:")
        for i, monitor in enumerate(monitors):
            if i == 0:
                print(f"  {i}: All Monitors Combined {monitor}")
            else:
                print(f"  {i}: Monitor {i} {monitor}")
        return monitors

def look_for_number(monitor_idx, x_range, y_range):
    """
    monitor_idx: Index of the monitor from list_monitors() (starts at 1 for individual monitors)
    x_range: tuple or list [x_start, x_end] relative to the monitor's top-left
    y_range: tuple or list [y_start, y_end] relative to the monitor's top-left
    """
    with mss.mss() as sct:
        monitors = sct.monitors
        if monitor_idx >= len(monitors):
            print(f"Error: Monitor index {monitor_idx} out of range.")
            return

        monitor = monitors[monitor_idx]
        
        # Calculate the bounding box for the region relative to the monitor
        # mss bbox: {'top': int, 'left': int, 'width': int, 'height': int}
        
        x1, x2 = x_range
        y1, y2 = y_range
        
        left = monitor["left"] + x1
        top = monitor["top"] + y1
        width = x2 - x1
        height = y2 - y1
        
        region = {"top": top, "left": left, "width": width, "height": height}
        
        print(f"Capturing region: {region} on Monitor {monitor_idx}")
        
        # Capture the screen
        sct_img = sct.grab(region)
        
        # Convert to numpy array for OpenCV
        img = np.array(sct_img)
        
        # Convert BGRA to BGR or Grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
        
        # Preprocessing for better OCR
        # 1. Resize if text is too small (optional)
        # gray = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
        
        # 2. Thresholding to get black text on white background (or vice versa)
        # Use Otsu's thresholding
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Debug: Save or show image to verify region
        # cv2.imwrite("debug_region.png", thresh)
        # cv2.imshow("Region", thresh)
        # cv2.waitKey(1000) # Show for 1 second
        # cv2.destroyAllWindows()

        # Configure Tesseract to look for digits
        # --psm 6: Assume a single uniform block of text
        # outputbase digits: Limit to digits (requires compatible config files, or just post-process)
        custom_config = r'--psm 6 -c tessedit_char_whitelist=0123456789.'
        
        try:
            text = pytesseract.image_to_string(thresh, config=custom_config)
            print(f"Raw detected text: '{text.strip()}'")
            
            # Filter just in case
            digits = ''.join(filter(lambda x: x.isdigit() or x == '.', text))
            print(f"Extracted number: {digits}")
            return digits
        except pytesseract.TesseractNotFoundError:
            print("Error: Tesseract is not installed or not in PATH.")
            print("Please install Tesseract-OCR and restart.")

if __name__ == "__main__":
    mons = list_monitors()
    
    print("mons:", mons)
    print(mons[0])
    
if False:
    
    # 2. Select monitor X (e.g., Monitor 1)
    target_monitor_idx = 1
    
    # 3. Define Region ([x1, x2], [y1, y2])
    # Example: Top-left corner 100x50 box
    target_x_range = [0, 200]
    target_y_range = [0, 100]
    
    if len(mons) > target_monitor_idx:
        look_for_number(target_monitor_idx, target_x_range, target_y_range)
    else:
        print("Target monitor not found.")
