import os
import re
import cairosvg
from PIL import Image
import io

def create_colored_icon(color_hex, output_path="app_icon.ico", svg_path="640669_folder.svg"):
    """
    Generates an .ico file from an SVG template with a custom fill color using CairoSVG.
    
    Args:
        color_hex (str): The color to use (e.g., "#FF0000").
        output_path (str): Where to save the generated .ico file.
        svg_path (str): Path to the source SVG template.
    """
    
    # 1. Read the SVG content
    if not os.path.exists(svg_path):
        print(f"Error: SVG file '{svg_path}' not found.")
        return

    with open(svg_path, 'r', encoding='utf-8') as f:
        svg_content = f.read()

    # 2. Replace the original color with the new color
    original_color_pattern = r'#ba63c6' 
    new_svg_content = re.sub(original_color_pattern, color_hex, svg_content, flags=re.IGNORECASE)
    
    # 3. Convert SVG string directly to a PNG in memory using CairoSVG
    # We output a large PNG (512x512) to ensure high quality for the ICO
    try:
        png_data = cairosvg.svg2png(
            bytestring=new_svg_content.encode('utf-8'),
            output_width=512,
            output_height=512
        )
        
        # 4. Load into PIL from memory
        pil_image = Image.open(io.BytesIO(png_data))

        # 5. Save as .ico with multiple sizes
        pil_image.save(
            output_path, 
            format='ICO', 
            sizes=[(512, 512), (256, 256), (128, 128), (64, 64)]
        )
        print(f"Icon successfully created at: {output_path} (using CairoSVG)")
            
    except Exception as e:
        print(f"An error occurred during icon generation: {e}")

if __name__ == "__main__":
    # Test it
    create_colored_icon("#FFA500") # Orange
