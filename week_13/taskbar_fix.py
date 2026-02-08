import ctypes
from ctypes import wintypes
import win32gui
import win32con
import uuid

# Define GUID/CLSID
class GUID(ctypes.Structure):
    _fields_ = [
        ("Data1", wintypes.DWORD),
        ("Data2", wintypes.WORD),
        ("Data3", wintypes.WORD),
        ("Data4", wintypes.BYTE * 8)
    ]
    
    def __init__(self, l, w1, w2, b1, b2, b3, b4, b5, b6, b7, b8):
        self.Data1 = l
        self.Data2 = w1
        self.Data3 = w2
        self.Data4 = (wintypes.BYTE * 8)(b1, b2, b3, b4, b5, b6, b7, b8)

# PROPERTYKEY structure
class PROPERTYKEY(ctypes.Structure):
    _fields_ = [
        ("fmtid", GUID),
        ("pid", wintypes.DWORD),
    ]

# PROPVARIANT structure (simplified for string)
class PROPVARIANT(ctypes.Structure):
    class _U(ctypes.Union):
        class _S(ctypes.Structure):
            _fields_ = [
                ("vt", wintypes.WORD),
                ("wReserved1", wintypes.WORD),
                ("wReserved2", wintypes.WORD),
                ("wReserved3", wintypes.WORD),
                ("pwszVal", wintypes.LPCWSTR),
            ]
        _fields_ = [
             ("s", _S),
             ("padding", ctypes.c_byte * 16) # Simplify variant binding
        ]
    _fields_ = [
        ("u", _U)
    ]

# IPropertyStore Interface (manual definition)
class IPropertyStore(ctypes.Structure):
    pass

# Interface VTable
class IPropertyStoreVtbl(ctypes.Structure):
    _fields_ = [
        ("QueryInterface", ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.POINTER(IPropertyStore), ctypes.POINTER(GUID), ctypes.POINTER(ctypes.c_void_p))),
        ("AddRef", ctypes.WINFUNCTYPE(ctypes.c_ulong, ctypes.POINTER(IPropertyStore))),
        ("Release", ctypes.WINFUNCTYPE(ctypes.c_ulong, ctypes.POINTER(IPropertyStore))),
        ("GetCount", ctypes.c_void_p),
        ("GetAt", ctypes.c_void_p),
        ("GetValue", ctypes.c_void_p),
        ("SetValue", ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.POINTER(IPropertyStore), ctypes.POINTER(PROPERTYKEY), ctypes.POINTER(PROPVARIANT))),
        ("Commit", ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.POINTER(IPropertyStore))),
    ]

IPropertyStore._fields_ = [("lpVtbl", ctypes.POINTER(IPropertyStoreVtbl))]

# Constants from propsys.h
# PKEY_AppUserModel_ID {9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}, 5
PKEY_AppUserModel_ID = PROPERTYKEY(
    GUID(0x9F4C2855, 0x9F79, 0x4B39, 0xA8, 0xD0, 0xE1, 0xD4, 0x2D, 0xE1, 0xD5, 0xF3),
    5
)
# PKEY_AppUserModel_RelaunchIconResource {9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}, 2
PKEY_AppUserModel_RelaunchIconResource = PROPERTYKEY(
    GUID(0x9F4C2855, 0x9F79, 0x4B39, 0xA8, 0xD0, 0xE1, 0xD4, 0x2D, 0xE1, 0xD5, 0xF3),
    2
)

# shell32 definitions
try:
    SHGetPropertyStoreForWindow = ctypes.windll.shell32.SHGetPropertyStoreForWindow
    SHGetPropertyStoreForWindow.restype = ctypes.c_long
    SHGetPropertyStoreForWindow.argtypes = [wintypes.HWND, ctypes.POINTER(GUID), ctypes.POINTER(ctypes.POINTER(IPropertyStore))]
except AttributeError:
    SHGetPropertyStoreForWindow = None

IID_IPropertyStore = GUID(0x886d8eeb, 0x8cf2, 0x4446, 0x8d, 0x02, 0xcd, 0xba, 0x1d, 0xbd, 0xcf, 0x99)

def set_app_icon_resource(hwnd, icon_path):
    """
    Sets PKEY_AppUserModel_RelaunchIconResource for the window.
    This helps the taskbar find the icon when the window is detached.
    """
    if not SHGetPropertyStoreForWindow:
        return False
        
    prop_store = ctypes.POINTER(IPropertyStore)()
    hr = SHGetPropertyStoreForWindow(hwnd, ctypes.byref(IID_IPropertyStore), ctypes.byref(prop_store))
    if hr != 0:
        return False
    
    # VP_LPWSTR = 31
    val = PROPVARIANT()
    val.u.s.vt = 31 
    val.u.s.pwszVal = icon_path

    hr = prop_store.contents.lpVtbl.contents.SetValue(prop_store, ctypes.byref(PKEY_AppUserModel_RelaunchIconResource), ctypes.byref(val))
    if hr != 0:
        print(f"DEBUG: Failed to set RelaunchIconResource: {hex(hr)}")
    else:
        print(f"DEBUG: Successfully set RelaunchIconResource to {icon_path}")
        prop_store.contents.lpVtbl.contents.Commit(prop_store)
        
    prop_store.contents.lpVtbl.contents.Release(prop_store)
    return hr == 0

def detach_window_with_custom_icon(hwnd, icon_path):
    """
    Sets both AppUserModelID and RelaunchIconResource in one transaction.
    """
    if not SHGetPropertyStoreForWindow:
        return False, "No SHGetPropertyStoreForWindow"
        
    prop_store = ctypes.POINTER(IPropertyStore)()
    hr = SHGetPropertyStoreForWindow(hwnd, ctypes.byref(IID_IPropertyStore), ctypes.byref(prop_store))
    if hr != 0:
        return False, f"SHGetPropertyStoreForWindow failed: {hex(hr)}"

    try:
        # 1. Generate New AppID
        new_app_id = f"DetachedAppID.{uuid.uuid4()}"
        
        # 2. Set AppID
        val_id = PROPVARIANT()
        val_id.u.s.vt = 31 # VT_LPWSTR
        val_id.u.s.pwszVal = new_app_id
        
        hr = prop_store.contents.lpVtbl.contents.SetValue(prop_store, ctypes.byref(PKEY_AppUserModel_ID), ctypes.byref(val_id))
        if hr != 0:
            return False, f"SetValue(AppID) failed: {hex(hr)}"
            
        # 3. Set Icon Resource
        if icon_path:
            val_ico = PROPVARIANT()
            val_ico.u.s.vt = 31 # VT_LPWSTR
            val_ico.u.s.pwszVal = icon_path # e.g. "C:\Path\To\Icon.ico" (Taskbar allows direct paths sometimes, or "path,0")
            
            hr = prop_store.contents.lpVtbl.contents.SetValue(prop_store, ctypes.byref(PKEY_AppUserModel_RelaunchIconResource), ctypes.byref(val_ico))
            if hr != 0:
                print(f"DEBUG: SetValue(Icon) failed: {hex(hr)}") 
                # Proceed anyway, AppID is more important

        # 4. Commit
        hr = prop_store.contents.lpVtbl.contents.Commit(prop_store)
        if hr != 0:
             return False, f"Commit failed: {hex(hr)}"
             
    finally:
        prop_store.contents.lpVtbl.contents.Release(prop_store)
        
    return True, new_app_id

def force_detached_app_id(hwnd):
    """
    Sets a unique AppUserModelID on the window to detach it from its taskbar group.
    """
    if not SHGetPropertyStoreForWindow:
        print("DEBUG: SHGetPropertyStoreForWindow not available.")
        return False
        
    prop_store = ctypes.POINTER(IPropertyStore)()
    
    # 1. Get IPropertyStore for the window
    hr = SHGetPropertyStoreForWindow(hwnd, ctypes.byref(IID_IPropertyStore), ctypes.byref(prop_store))
    if hr != 0:
        print(f"DEBUG: SHGetPropertyStoreForWindow failed with HRESULT {hex(hr)}")
        return False
        
    # 2. Prepare the new AppID (random unique string)
    new_app_id = f"DetachedAppID.{uuid.uuid4()}"
    
    # VP_LPWSTR = 31
    val = PROPVARIANT()
    val.u.s.vt = 31 
    val.u.s.pwszVal = new_app_id
    
    # 3. SetValue
    hr = prop_store.contents.lpVtbl.contents.SetValue(prop_store, ctypes.byref(PKEY_AppUserModel_ID), ctypes.byref(val))
    if hr != 0:
        print(f"DEBUG: SetValue failed with HRESULT {hex(hr)}")
        prop_store.contents.lpVtbl.contents.Release(prop_store)
        return False
        
    # 4. Commit
    # Note: SHGetPropertyStoreForWindow actually returns an in-memory store that might not strictly require commit, 
    # but the interface has it.
    prop_store.contents.lpVtbl.contents.Commit(prop_store)
    
    # 5. Release
    prop_store.contents.lpVtbl.contents.Release(prop_store)
    
    print(f"DEBUG: Successfully detached window {hwnd} to new AppID: {new_app_id}")
    return True
