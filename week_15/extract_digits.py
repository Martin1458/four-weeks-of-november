from PIL import Image, ImageFont, ImageDraw
import os
import numpy as np

def extract_digits_from_font(font_path, output_dir=None, image_size=(200, 200), font_size=150, shift=(0,0)):
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)

    try:
        font = ImageFont.truetype(font_path, font_size)
    except IOError:
        print(f"Error: Cannot open font resource at {font_path}")
        return {}

    digits = "0123456789"
    results = {}

    for digit in digits:
        # Create a new image with a white background
        image = Image.new("L", image_size, color=0) # White background
        draw = ImageDraw.Draw(image)

        # Calculate text position to center it
        bbox = draw.textbbox((0, 0), digit, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        # Center the text
        x = (image_size[0] - text_width) / 2 - bbox[0]
        y = (image_size[1] - text_height) / 2 - bbox[1]

        draw.text((x + shift[0], y + shift[1]), digit, font=font, fill=255) # Black text
        
        # Convert PIL image to OpenCV format (numpy array)
        cv2_img = np.array(image)
        results[digit] = cv2_img

        if output_dir:
            output_path = os.path.join(output_dir, f"{digit}.png")
            image.save(output_path)
            #print(f"Saved {output_path}")

    return results

if __name__ == "__main__":
    font_file = "Bourgeois-Book.otf"
    output_directory = "digit_imgs"
    
    extract_digits_from_font(font_file, output_directory)
