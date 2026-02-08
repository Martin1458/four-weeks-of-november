import mss
import cv2
import numpy as np
import pytesseract
import time
from PIL import Image, ImageDraw, ImageFont

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

# OCR Configuration
FONT_PATH = "Bourgeois-Book.otf"
REFERENCE_TEMPLATES = {}

def get_centered_char_image(image_array, target_size=(32, 32)):
    # image_array: binary numpy array (white text on black)
    # returns: 32x32 numpy array with centered character
    
    h, w = image_array.shape
    scale = min(target_size[0] / h, target_size[1] / w)
    new_h, new_w = int(h * scale), int(w * scale)
    
    resized = cv2.resize(image_array, (new_w, new_h), interpolation=cv2.INTER_AREA)
    
    canvas = np.zeros(target_size, dtype=np.uint8)
    y_off = (target_size[0] - new_h) // 2
    x_off = (target_size[1] - new_w) // 2
    
    canvas[y_off:y_off+new_h, x_off:x_off+new_w] = resized
    return canvas

def init_templates():
    global REFERENCE_TEMPLATES
    if REFERENCE_TEMPLATES:
        return

    try:
        # Load font - size 64 for good resolution template generation
        font = ImageFont.truetype(FONT_PATH, 64)
    except IOError:
        print(f"Warning: Could not load {FONT_PATH}, falling back to default/Tesseract.")
        return

    chars = "0123456789."
    for char in chars:
        # Draw char on PIL image
        img = Image.new('L', (100, 100), 0)
        draw = ImageDraw.Draw(img)
        draw.text((20, 20), char, font=font, fill=255)
        
        # Crop to bounding box
        bbox = img.getbbox()
        if bbox:
            cropped = img.crop(bbox)
            # Convert to numpy
            char_np = np.array(cropped)
            # Normalize to fixed size
            REFERENCE_TEMPLATES[char] = get_centered_char_image(char_np)


specs_rect = (147, 63)
specs_columns = [1764, 1969, 2174, 2379, 2584] # score, assists, score, points, saves
specs_rows = [839, 954, 1243, 1358] # individual player
# move up a bit
specs_rows = [y - 40 for y in specs_rows]


def look_for_number(x_range, y_range, expected_rgb=None, col_idx=0, row_idx=0):
    """
    x_range: tuple or list [x_start, x_end] relative to the monitor's top-left
    y_range: tuple or list [y_start, y_end] relative to the monitor's top-left
    expected_rgb: tuple (r, g, b) of the text color
    col_idx: column index for saving file
    row_idx: row index for saving file
    """
    # Initialize templates once
    init_templates()

    detected_value = ""

    with mss.mss() as sct:

        # Calculate the bounding box for the region relative to the monitor
        x1, x2 = x_range
        y1, y2 = y_range
        region = {"top": y1, "left": x1, "width": x2 - x1, "height": y2 - y1}
        
        # Capture the screen
        sct_img = sct.grab(region)
        img = np.array(sct_img)
        
        if expected_rgb:
            # Color filtering approach
            r, g, b = expected_rgb
            # Convert RGB to BGR for OpenCV
            target_bgr = np.array([b, g, r], dtype=np.uint8)
            
            # Use BGR image (drop alpha)
            img_bgr = img[:, :, :3]
            
            # Define color range with tolerance
            tolerance = 40
            lower = np.clip(target_bgr - tolerance, 0, 255)
            upper = np.clip(target_bgr + tolerance, 0, 255)
            
            # Create mask (matches will be white, others black)
            thresh = cv2.inRange(img_bgr, lower, upper)
        else:
            gray = cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
            
            # Thresholding (Otsu)
            _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            
            # Check if we need to invert (we want white text on black bg)
            # If mean is high (>127), background is white, so invert
            if cv2.mean(thresh)[0] > 127:
                thresh = cv2.bitwise_not(thresh)

        # Template Matching Approach using Custom Font
        if REFERENCE_TEMPLATES:
            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            # Filter contours by size/area to remove noise
            char_rois = []
            for c in contours:
                x, y, w, h = cv2.boundingRect(c)
                if h > 10 and w > 2: # Minimal size filter
                    char_rois.append((x, y, w, h, thresh[y:y+h, x:x+w]))
            
            # Sort by x coordinate (left to right)
            char_rois.sort(key=lambda r: r[0])
            
            detected_text = ""
            for x, y, w, h, roi in char_rois:
                # Normalize ROI
                target = get_centered_char_image(roi)
                
                best_score = -1
                best_char = ""
                
                for char, template in REFERENCE_TEMPLATES.items():
                    # Simple Correlation or Normalized Cross-Correlation
                    res = cv2.matchTemplate(target, template, cv2.TM_CCORR_NORMED)
                    score = res[0][0]
                    if score > best_score:
                        best_score = score
                        best_char = char
                
                if best_score > 0.6: # Confidence threshold
                    detected_text += best_char
            
            detected_value = detected_text

        else:
            # Fallback to Tesseract if initialization failed
            custom_config = r'--psm 6 -c tessedit_char_whitelist=0123456789.'
            try:
                text = pytesseract.image_to_string(thresh, config=custom_config)
                digits = ''.join(filter(lambda x: x.isdigit() or x == '.', text))
                detected_value = digits
            except pytesseract.TesseractNotFoundError:
                print("Error: Tesseract is not installed or not in PATH.")
                detected_value = ""

    # Save the captured image with the result
    filename = f"{col_idx}_{row_idx}_{detected_value}.png"
    cv2.imwrite(filename, img)
    
    return detected_value

def look_for_everything():
    headers = ["Score", "Goals", "Assists", "Saves", "Shots"]
    col_width = 12
    format_str = "| " + " | ".join([f"{{:<{col_width}}}" for _ in headers]) + " |"
    separator = "-" * len(format_str.format(*headers))

    print("\n" + separator)
    print(format_str.format(*headers))
    print(separator)

    # Note: Iterate rows first (Players) then columns (Stats) for correct table orientation
    for i, row_start in enumerate(specs_rows):
        # Determine text color based on row index
        # First two rows: rgb(247,253,255), Last two rows: rgb(255, 244, 174)
        if i < 2:
            color = (247, 253, 255)
        else:
            color = (255, 244, 174)

        row_values = []
        row_end = row_start + specs_rect[1]
        for j, col_start in enumerate(specs_columns):
            col_end = col_start + specs_rect[0]
            num = look_for_number([col_start, col_end], [row_start, row_end], expected_rgb=color, col_idx=j, row_idx=i)
            row_values.append(num if num else "")
        print(format_str.format(*row_values))
    print(separator)
    

if __name__ == "__main__":
    target_x_range = [2026, 2026 + 159]
    target_y_range = [1923, 1923 + 48]

    while True:
        time.sleep(4)    
        look_for_everything()
