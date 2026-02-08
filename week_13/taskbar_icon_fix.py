import ctypes
from ctypes import wintypes
import win32gui
import win32con

# --- Ctypes Definitions for Property System ---

# GUID/IID structures
class GUID(ctypes.Structure):
    _fields_ = [
        ("Data1", ctypes.c_ulong),
        ("Data2", ctypes.c_ushort),
        ("Data3", ctypes.c_ushort),
        ("Data4", ctypes.c_ubyte * 8)
    ]

    def __init__(self, l, w1, w2, b1, b2, b3, b4, b5, b6, b7, b8):
        self.Data1 = l
        self.Data2 = w1
        self.Data3 = w2
        self.Data4 = (ctypes.c_ubyte * 8)(b1, b2, b3, b4, b5, b6, b7, b8)

# PROPERTYKEY structure
class PROPERTYKEY(ctypes.Structure):
    _fields_ = [
        ("fmtid", GUID),
        ("pid", ctypes.c_ulong)
    ]

# PROPVARIANT structure (Simplified for string/VT_LPWSTR)
class PROPVARIANT(ctypes.Structure):
    class _U(ctypes.Union):
        class _S(ctypes.Structure):
            _fields_ = [
                ("vt", ctypes.c_ushort),
                ("wReserved1", ctypes.c_ushort),
                ("wReserved2", ctypes.c_ushort),
                ("wReserved3", ctypes.c_ushort),
                ("pwszVal", ctypes.c_wchar_p), # For VT_LPWSTR
            ]
        _fields_ = [
            ("s", _S),
            ("padding", ctypes.c_byte * 8) # simplistic padding
        ]
    _fields_ = [("u", _U)]

# Defines
STGM_READWRITE = 0x00000002
VT_LPWSTR = 31

# PKEY_AppUserModel_ID: {9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}, 5
PKEY_AppUserModel_ID = PROPERTYKEY(
    GUID(0x9F4C2855, 0x9F79, 0x4B39, 0xA8, 0xD0, 0xE1, 0xD4, 0x2D, 0xE1, 0xD5, 0xF3),
    5
)

# IPropertyStore Interface
class IPropertyStore(ctypes.Structure):
    _fields_ = [("lpVtbl", ctypes.c_void_p)]

# VTable for IPropertyStore
# QueryInterface, AddRef, Release, GetCount, GetAt, GetValue, SetValue, Commit
IPropertyStore_SetValue_Type = ctypes.WINFUNCTYPE(
    ctypes.c_long, 
    ctypes.POINTER(IPropertyStore), 
    ctypes.POINTER(PROPERTYKEY), 
    ctypes.POINTER(PROPVARIANT)
)
IPropertyStore_Commit_Type = ctypes.WINFUNCTYPE(
    ctypes.c_long, 
    ctypes.POINTER(IPropertyStore)
)

# Setup Shell32
shell32 = ctypes.windll.shell32

def set_window_aumid(hwnd, aumid_string):
    """
    Sets the AppUserModelID for a specific window.
    This dissociates it from the taskbar group and allows WM_SETICON to take effect.
    """
    # UUID for IPropertyStore {886d8beb-c005-494b-9b42-2310aad2845a}
    IID_IPropertyStore = GUID(0x886d8beb, 0xc005, 0x494b, 0x9b, 0x42, 0x23, 0x10, 0xaa, 0xd2, 0x84, 0x5a)
    
    pps = ctypes.POINTER(IPropertyStore)()
    
    # SHGetPropertyStoreForWindow
    hr = shell32.SHGetPropertyStoreForWindow(
        ctypes.c_void_p(hwnd),
        ctypes.POINTER(GUID)(IID_IPropertyStore), 
        ctypes.POINTER(ctypes.POINTER(IPropertyStore))(pps)
    )
    
    if hr != 0:
        print(f"Failed to get PropertyStore: {hr}")
        return False
        
    # Prepare Value
    val = PROPVARIANT()
    val.u.s.vt = VT_LPWSTR
    val.u.s.pwszVal = aumid_string
    
    # Get VTable
    # Standard COM vtable layout: IUnknown methods (3) + GetCount(1) + GetAt(1) + GetValue(1) + SetValue(1)
    # SetValue is at index 6 (0-based)
    # Commit is at index 7
    
    # We need to manually traverse the vtable since we don't have comtypes definitions handy
    # A cleaner way using raw offset access:
    vtable = ctypes.cast(pps.contents.lpVtbl, ctypes.POINTER(ctypes.c_void_p))
    
    set_value_addr = vtable[6]
    commit_addr = vtable[7]
    
    SetValue = IPropertyStore_SetValue_Type(set_value_addr)
    Commit = IPropertyStore_Commit_Type(commit_addr)
    
    # Set Value
    hr = SetValue(pps, ctypes.byref(PKEY_AppUserModel_ID), ctypes.byref(val))
    if hr != 0:
        print(f"Failed to SetValue: {hr}")
        return False
        
    # Commit
    hr = Commit(pps)
    if hr != 0:
        print(f"Failed to Commit: {hr}")
        return False
        
    # Release (manual simplistic release)
    release_addr = vtable[2]
    Release = ctypes.WINFUNCTYPE(ctypes.c_ulong, ctypes.POINTER(IPropertyStore))(release_addr)
    Release(pps)
    
    return True

def force_taskbar_icon(hwnd, icon_path):
    """
    Forces the taskbar icon to change by:
    1. Breaking the window out of its AUMID group.
    2. Sending WM_SETICON.
    """
    
    # 1. Break grouping by setting a unique AUMID
    #    using timestamp or random ensures it doesn't match the pinned shortcut
    import time
    new_id = f"CustomIcon.{time.time()}.{hwnd}"
    print(f"Setting AUMID to: {new_id}")
    
    if set_window_aumid(hwnd, new_id):
        print("Success: AUMID changed.")
    else:
        print("Warning: Could not change AUMID. Icon might not update on Taskbar.")

    # 2. Update Icon via WM_SETICON (Standard method)
    #    Now that AUMID is unique, Taskbar looks at this.
    try:
        hicon_big = win32gui.LoadImage(0, icon_path, win32con.IMAGE_ICON, 32, 32, 0x0010) # LR_LOADFROMFILE
        hicon_small = win32gui.LoadImage(0, icon_path, win32con.IMAGE_ICON, 16, 16, 0x0010)
        
        # Send to blocking and non-blocking
        win32gui.SendMessageTimeout(hwnd, win32con.WM_SETICON, win32con.ICON_BIG, hicon_big, win32con.SMTO_ABORTIFHUNG, 100)
        win32gui.SendMessageTimeout(hwnd, win32con.WM_SETICON, win32con.ICON_SMALL, hicon_small, win32con.SMTO_ABORTIFHUNG, 100)
        
        # Force a repaint of the non-client area
        win32gui.RedrawWindow(hwnd, None, None, win32con.RDW_FRAME | win32con.RDW_INVALIDATE | win32con.RDW_ERASE | win32con.RDW_TITLE)
        
        print("Sent WM_SETICON messages.")
    except Exception as e:
        print(f"Error setting icon: {e}")

