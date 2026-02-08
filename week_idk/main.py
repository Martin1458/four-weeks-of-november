import tkinter as tk
from tkinter import ttk
import ctypes
from ctypes import wintypes
import sys
import os

# --- Windows API Constants for DWM ---
DWMWA_FORCE_ICONIC_REPRESENTATION = 7
DWMWA_HAS_ICONIC_BITMAP = 10

# Load DLLs
dwmapi = ctypes.windll.dwmapi
user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32

# FIX: Force Python to find the local Tcl/Tk library files
if sys.platform == 'win32':
    import os.path
    # Check if running in a virtual environment
    base_path = getattr(sys, 'base_prefix', os.path.dirname(sys.executable))
    
    tcl_path = os.path.join(base_path, 'tcl', 'tcl8.6')
    tk_path = os.path.join(base_path, 'tcl', 'tk8.6')
    
    if os.path.exists(tcl_path) and os.path.exists(tk_path):
        os.environ['TCL_LIBRARY'] = tcl_path
        os.environ['TK_LIBRARY'] = tk_path

def create_solid_hbitmap(width, height, r, g, b):
    """Creates a Windows HBITMAP (Handle to Bitmap) of a solid color."""
    hdc_screen = user32.GetDC(0)
    hdc_mem = gdi32.CreateCompatibleDC(hdc_screen)
    hbitmap = gdi32.CreateCompatibleBitmap(hdc_screen, width, height)
    
    old_obj = gdi32.SelectObject(hdc_mem, hbitmap)
    
    # Create brush and fill
    color = r | (g << 8) | (b << 16)
    brush = gdi32.CreateSolidBrush(color)
    rect = wintypes.RECT(0, 0, width, height)
    user32.FillRect(hdc_mem, ctypes.byref(rect), brush)
    
    # Cleanup
    gdi32.DeleteObject(brush)
    gdi32.SelectObject(hdc_mem, old_obj)
    gdi32.DeleteDC(hdc_mem)
    user32.ReleaseDC(0, hdc_screen)
    
    return hbitmap

class TaskbarWindow:
    def __init__(self, root):
        self.root = root
        self.root.title("Taskbar App")
        self.root.geometry("400x300")
        
        # 1. Get the real Windows Window Handle (HWND)
        # Tkinter's 'winfo_id' is just the child panel, we need the OS Frame.
        self.root.update_idletasks()
        try:
             self.hwnd = ctypes.windll.user32.GetParent(self.root.winfo_id())
        except:
             self.hwnd = self.root.winfo_id()

        self.setup_taskbar_identity()
        self.setup_custom_preview()
        
        # Add some content
        label = ttk.Label(
            self.root, 
            text="Hover over my taskbar icon!\n\n(It should show a Blue Rectangle\ninstead of this text)",
            font=("Arial", 12),
            justify="center"
        )
        label.pack(expand=True)

    def setup_taskbar_identity(self):
        """
        Configures the process so Windows treats it as a separate application
        rather than just 'Python'.
        """
        if sys.platform == 'win32':
            myappid = 'custom.taskbar.window.object.v1'
            try:
                ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
            except Exception as e:
                print(f"Note: Could not set AppUserModelID: {e}")

    def setup_custom_preview(self):
        """
        Tells Windows DWM: 'Don't take a screenshot of me. 
        I will provide my own bitmap for the taskbar preview.'
        """
        try:
            true_val = ctypes.c_int(1)
            
            # Enable iconic representation (custom thumbnails)
            dwmapi.DwmSetWindowAttribute(
                self.hwnd, 
                DWMWA_FORCE_ICONIC_REPRESENTATION, 
                ctypes.byref(true_val), 
                ctypes.sizeof(true_val)
            )
            
            dwmapi.DwmSetWindowAttribute(
                self.hwnd, 
                DWMWA_HAS_ICONIC_BITMAP, 
                ctypes.byref(true_val), 
                ctypes.sizeof(true_val)
            )
            
            # Immediately set a static thumbnail (e.g., a Blue Rectangle)
            # In a full app, you would listen for WM_DWMSENDICONICTHUMBNAIL
            # and update this dynamically.
            self.set_preview_color(0, 120, 215) # Windows Blue
            
        except Exception as e:
            print(f"DWM setup failed: {e}")

    def set_preview_color(self, r, g, b):
        try:
            # Create a 200x120 bitmap for the preview
            hbitmap = create_solid_hbitmap(200, 120, r, g, b)
            dwmapi.DwmSetIconicThumbnail(self.hwnd, hbitmap, 0)
        except Exception as e:
            print(f"Could not set preview bitmap: {e}")

    def set_icon(self, icon_path):

    def set_icon(self, icon_path):
        """
        Helper method to set the icon if you have a .ico or .png file
        """
        try:
            # For .ico files
            if icon_path.endswith('.ico'):
                self.root.iconbitmap(icon_path)
            # For .png files
            else:
                icon = tk.PhotoImage(file=icon_path)
                self.root.iconphoto(False, icon)
        except Exception as e:
            print(f"Could not load icon: {e}")

if __name__ == "__main__":
    import icon_creator
    
    # Generate the custom icon
    icon_path = "my_custom_icon.ico"
    # Choose your color here (e.g. #00FF00 for green, #FF0000 for red)
    icon_creator.create_colored_icon("#D48309", output_path=icon_path)
    
    root = tk.Tk()
    app = TaskbarWindow(root)
    
    # Set the icon we just generated
    app.set_icon(icon_path)
    
    root.mainloop()
