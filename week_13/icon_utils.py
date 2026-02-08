import win32gui
import win32con
import ctypes
from taskbar_fix import force_detached_app_id
import time

def set_window_icon(hwnd, icon_path):
    """
    Sets the icon for a specific window handle (HWND).
    """
    try:
        # Load the icons
        # LR_LOADFROMFILE = 0x0010
        hicon_big = win32gui.LoadImage(0, icon_path, win32con.IMAGE_ICON, 32, 32, 0x0010)
        hicon_small = win32gui.LoadImage(0, icon_path, win32con.IMAGE_ICON, 16, 16, 0x0010)
    except Exception as e:
        print(f"Error loading icon from {icon_path}: {e}")
        return False

    try:
        # Fix: Detach from Taskbar Group (AUMID) to allow custom icon
        # We rely on taskbar_fix.force_detached_app_id for this
        force_detached_app_id(hwnd)

        # Set Big Icon (Taskbar/Alt-Tab)
        # WM_SETICON = 0x0080
        win32gui.SendMessageTimeout(hwnd, win32con.WM_SETICON, 1, hicon_big, win32con.SMTO_ABORTIFHUNG, 2000)
        
        # Set Small Icon (Titlebar)
        win32gui.SendMessageTimeout(hwnd, win32con.WM_SETICON, 0, hicon_small, win32con.SMTO_ABORTIFHUNG, 2000)
        
        # Try SetClassLong 
        try:
            # GCLP_HICON = -14
            # GCLP_HICONSM = -34
            if ctypes.sizeof(ctypes.c_void_p) == 8:
                ctypes.windll.user32.SetClassLongPtrW(hwnd, -14, hicon_big)
                ctypes.windll.user32.SetClassLongPtrW(hwnd, -34, hicon_small)
            else:
                ctypes.windll.user32.SetClassLongW(hwnd, -14, hicon_big)
                ctypes.windll.user32.SetClassLongW(hwnd, -34, hicon_small)
        except Exception as ex:
            # Not all windows allow this, or it might fail for other reasons
            # print(f"Debug: SetClassLong failed: {ex}")
            pass 

        # Force redraw
        win32gui.RedrawWindow(hwnd, None, None, win32con.RDW_FRAME | win32con.RDW_INVALIDATE)
        
        return True
    except Exception as e:
        print(f"Warning: Failed to update HWND {hwnd}: {e}")
        return False

def set_application_icon(hwnd, icon_path):
    """
    Sets the icon for a window and its related windows (owner, parent, root).
    This is more robust for taskbar icons.
    """
    # Identify all relevant windows to update
    hwnds_to_update = {hwnd}
    
    try:
        owner = win32gui.GetWindow(hwnd, win32con.GW_OWNER)
        if owner: hwnds_to_update.add(owner)
    except Exception: pass

    try:
        parent = win32gui.GetParent(hwnd)
        if parent: hwnds_to_update.add(parent)
    except Exception: pass
    
    try:
        # GA_ROOT = 2. Get the root window.
        root = win32gui.GetAncestor(hwnd, 2)
        if root: hwnds_to_update.add(root)
    except Exception: pass
    
    success = False
    for h in hwnds_to_update:
        if set_window_icon(h, icon_path):
            success = True
            
    return success

