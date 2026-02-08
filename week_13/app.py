import argparse
import logging
from logging.handlers import RotatingFileHandler
import threading
import time
import queue
import os
import sys
import psutil
import glob
import win32gui
import win32process
import win32ui
import win32con
import win32api
import ctypes
import tkinter as tk
import tempfile
from tkinter import scrolledtext
from PIL import Image, ImageTk
from taskbar_fix import force_detached_app_id
from icon_editor import IconEditor
from icon_utils import set_window_icon, set_application_icon

# Attempt to fix TCL_LIBRARY on Windows if tcl/tk not found
if os.name == 'nt':
    try:
        # Check if tcl is already working and attempt to fix TCL_LIBRARY/TK_LIBRARY
        # This is needed for some Windows Python installations (e.g. embedded or venv)
        base_prefix = getattr(sys, 'base_prefix', sys.prefix)
        
        # Search for tcl8* folder in typical locations
        search_paths = [
            os.path.join(base_prefix, 'tcl', 'tcl8*'),
            os.path.join(base_prefix, 'lib', 'tcl8*'),
            os.path.join(os.path.dirname(sys.executable), 'tcl', 'tcl8*'),
            # Also try explicitly looking relative to the venv if base_prefix is wrong
            os.path.abspath(os.path.join(os.path.dirname(sys.executable), '..', '..', '..', 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'tcl', 'tcl8*')),
        ]
        
        tcl_path = None
        for pattern in search_paths:
            dirs = glob.glob(pattern)
            # Sort dirs to prefer higher versions or longer names like tcl8.6 over tcl8
            dirs.sort(key=lambda x: len(x), reverse=True)
            for d in dirs:
                 if os.path.exists(os.path.join(d, 'init.tcl')):
                      tcl_path = d
                      break
            if tcl_path:
                break
        
        if tcl_path:
            os.environ['TCL_LIBRARY'] = tcl_path
            # Guess TK_LIBRARY (usually sibling tk8*)
            parent = os.path.dirname(tcl_path)
            tk_pattern = os.path.join(parent, 'tk8*')
            tk_dirs = glob.glob(tk_pattern)
            tk_path = None
            # Find a tk dir that likely looks correct
            tk_dirs.sort(key=lambda x: len(x), reverse=True)
            if tk_dirs:
                 os.environ['TK_LIBRARY'] = tk_dirs[0]
    except Exception as e:
        pass

LOG_DIR = "logs"
LOG_FILE = os.path.join(LOG_DIR, "app.log")

def setup_logger(level=logging.INFO, max_bytes=5 * 1024 * 1024, backup_count=3):
    os.makedirs(LOG_DIR, exist_ok=True)
    logger = logging.getLogger("procmon")
    logger.setLevel(level)
    if not logger.handlers:
        fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
        sh = logging.StreamHandler(sys.stdout)
        sh.setFormatter(fmt)
        logger.addHandler(sh)
        fh = RotatingFileHandler(LOG_FILE, maxBytes=max_bytes, backupCount=backup_count, encoding="utf-8")
        fh.setFormatter(fmt)
        logger.addHandler(fh)
    return logger

logger = setup_logger()

def get_process_icon(pid):
    try:
        proc = psutil.Process(pid)
        exe_path = proc.exe()
        
        # Extract small icon (index 0 for small)
        large, small = win32gui.ExtractIconEx(exe_path, 0)
        hicon = None
        if small:
            hicon = small[0]
            # destroy others
            for h in small[1:]: win32gui.DestroyIcon(h)
            for h in large: win32gui.DestroyIcon(h)
        elif large:
            hicon = large[0]
            for h in large[1:]: win32gui.DestroyIcon(h)
            
        if not hicon:
            return None
            
        # Convert HICON to PIL
        hdc = win32ui.CreateDCFromHandle(win32gui.GetDC(0))
        hbmp = win32ui.CreateBitmap()
        hbmp.CreateCompatibleBitmap(hdc, 16, 16)
        hdc = hdc.CreateCompatibleDC()
        hdc.SelectObject(hbmp)
        
        # Draw the icon into the bitmap
        win32gui.DrawIconEx(hdc.GetHandleOutput(), 0, 0, hicon, 16, 16, 0, None, 0x0003) # DI_NORMAL
        
        bmpinfo = hbmp.GetInfo()
        bmpstr = hbmp.GetBitmapBits(True)
        img = Image.frombuffer(
            'RGB',
            (bmpinfo['bmWidth'], bmpinfo['bmHeight']),
            bmpstr, 'raw', 'BGRX', 0, 1)
            
        win32gui.DestroyIcon(hicon)
        return img
    except Exception:
        return None

def get_active_app_info():
    try:
        hwnd = win32gui.GetForegroundWindow()
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        process = psutil.Process(pid)
        return process.name(), pid, hwnd
    except Exception:
        return None, None, None

def snapshot_processes():
    procs = {}
    for p in psutil.process_iter(['pid', 'name', 'create_time']):
        try:
            info = p.info
            procs[info['pid']] = (info.get('name'), info.get('create_time'))
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return procs

def get_taskbar_windows():
    windows = {}
    
    def enum_handler(hwnd, ctx):
        if win32gui.IsWindowVisible(hwnd):
            try:
                # GWL_EXSTYLE = -20. WS_EX_TOOLWINDOW = 0x00000080
                if not (win32gui.GetWindowLong(hwnd, -20) & 0x80):
                    length = win32gui.GetWindowTextLength(hwnd)
                    if length > 0:
                        title = win32gui.GetWindowText(hwnd)
                        _, pid = win32process.GetWindowThreadProcessId(hwnd)
                        try:
                            name = psutil.Process(pid).name()
                        except Exception:
                            name = "unknown"
                        ctx[hwnd] = (title, name, pid)
            except Exception:
                pass
                
    try:
        win32gui.EnumWindows(enum_handler, windows)
    except Exception:
        pass
    return windows

class Monitor(threading.Thread):
    def __init__(self, event_queue, poll_interval=1.0, show_started=True, show_focused=True, show_taskbar=True, whitelist=None, blacklist=None):
        super().__init__(daemon=True)
        self.event_queue = event_queue
        self.poll_interval = poll_interval
        self.show_started = show_started
        self.show_focused = show_focused
        self.show_taskbar = show_taskbar
        self.whitelist = set(n.lower() for n in (whitelist or []))
        self.blacklist = set(n.lower() for n in (blacklist or []))
        self._stop = threading.Event()
        self.history = []
        self.lock = threading.Lock()

    def matches_filter(self, name):
        if not name:
            return False
        n = name.lower()
        if self.whitelist:
            return n in self.whitelist
        if self.blacklist:
            return n not in self.blacklist
        return True

    def stop(self):
        self._stop.set()

    def add_event(self, msg, pid=None, hwnd=None):
        logger.info(msg)
        self.event_queue.put((msg, pid, hwnd))
        with self.lock:
            self.history.append(msg)
            if len(self.history) > 100:
                self.history.pop(0)

    def run(self):
        last_app = None
        known_procs = snapshot_processes()
        known_windows = get_taskbar_windows()
        self.add_event("Monitoring started")
        
        while not self._stop.is_set():
            try:
                if self.show_focused:
                    current_app, pid, hwnd = get_active_app_info()
                    if current_app and current_app != last_app and self.matches_filter(current_app):
                        self.add_event(f"[Focused]: {current_app} (pid {pid})", pid, hwnd)
                        last_app = current_app

                current_procs = snapshot_processes()
                
                new_items = []
                for pid, (name, ctime) in current_procs.items():
                    if pid not in known_procs:
                        new_items.append((ctime or 0, pid, name))
                    else:
                        old_name, old_ct = known_procs[pid]
                        if ctime and old_ct and ctime > old_ct:
                           new_items.append((ctime, pid, name))

                for _, pid, name in sorted(new_items):
                    if self.show_started and self.matches_filter(name):
                        self.add_event(f"[Started]: {name or 'unknown'} (pid {pid})", pid, None)

                known_procs = current_procs

                if self.show_taskbar:
                    current_windows = get_taskbar_windows()
                    new_hwnds = set(current_windows.keys()) - set(known_windows.keys())
                    for hwnd in new_hwnds:
                        title, name, pid = current_windows[hwnd]
                        
                        # Data-binding/PopupHost noise
                        if title == "PopupHost" and name.lower() == "explorer.exe":
                            continue
                        
                        if title == "Draw Icon" and name.lower() == "python.exe":
                            continue
                            
                        if self.matches_filter(name):
                             self.add_event(f"[Taskbar]: {title} ({name}) (pid {pid})", pid, hwnd)
                    known_windows = current_windows

                time.sleep(self.poll_interval)
            except Exception:
                logger.exception("Error in monitor loop")
        
        self.add_event("Monitoring stopped")

class ProcMonGUI:
    def __init__(self, master, queue, monitor):
        self.master = master
        self.queue = queue
        self.monitor = monitor
        master.title("Process Monitor")
        master.geometry("600x400")

        self.text_area = scrolledtext.ScrolledText(master, state='disabled', font=("Consolas", 10), bg="#222", fg="#0f0")
        self.text_area.pack(expand=True, fill='both')

        self.master.protocol("WM_DELETE_WINDOW", self.on_close)
        self.images_cache = [] # keep references to images
        self.check_queue()

    def check_queue(self):
        while not self.queue.empty():
            try:
                item = self.queue.get_nowait()
                # handle both tuple (msg, pid, hwnd) and legacy string msg
                if isinstance(item, tuple):
                    if len(item) == 3:
                        msg, pid, hwnd = item
                    else:
                        msg, pid = item
                        hwnd = None
                else:
                    msg, pid, hwnd = item, None, None
                self.log(msg, pid, hwnd)
            except queue.Empty:
                pass
        self.master.after(100, self.check_queue)

    def log(self, message, pid=None, hwnd=None):
        self.text_area.config(state='normal')
        
        # Insert Icon if PID given
        if pid:
             img = get_process_icon(pid)
             if img:
                 photo = ImageTk.PhotoImage(img)
                 self.images_cache.append(photo) # keep reference
                 if len(self.images_cache) > 50: self.images_cache.pop(0)
                 
                 # Create a Label for the image to make it clickable
                 lbl = tk.Label(self.text_area, image=photo, bg="#222", cursor="hand2")
                 if hwnd:
                     lbl.bind("<Button-1>", lambda e, h=hwnd, l=lbl: self.change_icon(h, l))
                 self.text_area.window_create(tk.END, window=lbl)
                 self.text_area.insert(tk.END, " ")
        
        self.text_area.insert(tk.END, message + "\n")
        self.text_area.see(tk.END)
        self.text_area.config(state='disabled')

        # Auto-detect new windows and prompt for icon edit
        if message.startswith("[Taskbar]") and pid and hwnd:
             # Defer this slightly to ensure window is ready or whatever, 
             # though we are in main thread so it's fine.
             self.open_icon_editor(pid, hwnd)

    def open_icon_editor(self, pid, hwnd):
        # Fetch icon
        img = get_process_icon(pid)
        # If no icon, maybe use a default or empty? 
        # But get_process_icon handles logic to extract from EXE.

        def apply_icon(new_img):
             try:
                 # Save to temp
                 with tempfile.NamedTemporaryFile(suffix=".ico", delete=False) as tmp:
                     path = tmp.name
                 
                 # Save as ICO (containing sizes)
                 # Converting RGBA to ICO
                 # We need to ensure it's saved correctly.
                 new_img.save(path, format="ICO", sizes=[(32,32), (16,16)])
                 
                 # Apply to the window
                 logger.info(f"Applying new icon to HWND {hwnd}")
                 
                 # We can use our helper. 
                 # Since set_window_icon might block slightly (SendMessageTimeout), 
                 # we can run it in a thread or just do it. 
                 # SendMessageTimeout is fast enough usually.
                 
                 # Note: set_window_icon is imported from icon_utils
                 # We need to identify all relevant windows to update like in change_icon?
                 # set_window_icon only takes one HWND. 
                 # Let's do a quick gathering of related windows here or update set_window_icon?
                 # For now, let's just target the HWND we got from Taskbar event.
                 
                 success = set_application_icon(hwnd, path)
                 if success:
                     logger.info("Icon updated successfully.")
                 else:
                     logger.error("Failed to update icon.")
                     
             except Exception as e:
                 logger.error(f"Error applying icon: {e}")

        # Open Editor
        # Verify img is valid?
        if img:
             IconEditor(self.master, img, apply_icon)
        else:
             # Try to get it again? Or just open with blank?
             # Let's pass None.
             IconEditor(self.master, None, apply_icon)

    def change_icon(self, hwnd, label_widget):
        try:
            # Check Admin rights
            is_admin = False
            try:
                is_admin = ctypes.windll.shell32.IsUserAnAdmin()
            except: pass
            
            if not is_admin:
                print("WARNING: Script is not running as Administrator. Changing icons for other apps usually requires Admin rights.")

            # 1. Update the GUI label
            default_ico = "default.png"
            if not os.path.exists(default_ico):
                print(f"Error: {default_ico} not found at {os.path.abspath(default_ico)}.")
                return

            pil_img = Image.open(default_ico).resize((16, 16))
            photo = ImageTk.PhotoImage(pil_img)
            self.images_cache.append(photo)
            label_widget.config(image=photo)
            
            # 2. Update the Windows Taskbar Icon
            with tempfile.NamedTemporaryFile(suffix=".ico", delete=False) as tmp:
                icon_path = tmp.name
            
            pil_img_large = Image.open(default_ico).resize((32, 32))
            pil_img_large.save(icon_path, format="ICO")
            
            hicon_big = win32gui.LoadImage(0, icon_path, win32con.IMAGE_ICON, 32, 32, 0x0010)
            hicon_small = win32gui.LoadImage(0, icon_path, win32con.IMAGE_ICON, 16, 16, 0x0010)

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

            print(f"DEBUG: Targets: {list(hwnds_to_update)}")
            
            for h in hwnds_to_update:
                try:
                    # Fix: Detach from Taskbar Group (AUMID) to allow custom icon
                    force_detached_app_id(h)

                    # Set Big Icon (Taskbar/Alt-Tab)
                    win32gui.SendMessageTimeout(h, 0x0080, 1, hicon_big, 0x0002, 2000)
                    # Set Small Icon (Titlebar)
                    win32gui.SendMessageTimeout(h, 0x0080, 0, hicon_small, 0x0002, 2000)
                    
                    # Try SetClassLong 
                    try:
                        if ctypes.sizeof(ctypes.c_void_p) == 8:
                            ctypes.windll.user32.SetClassLongPtrW(h, -14, hicon_big)
                            ctypes.windll.user32.SetClassLongPtrW(h, -34, hicon_small)
                        else:
                            ctypes.windll.user32.SetClassLongW(h, -14, hicon_big)
                            ctypes.windll.user32.SetClassLongW(h, -34, hicon_small)
                    except Exception as ex:
                        pass 

                    # Force redraw
                    win32gui.RedrawWindow(h, None, None, win32con.RDW_FRAME | win32con.RDW_INVALIDATE)
                    
                except Exception as e:
                     print(f"Warning: Failed to update HWND {h}: {e}")

        except Exception as e:
            print(f"Error changing icon: {e}")
            
            # Cleanup temp file
            # Note: If we delete too fast, the other process might not have grabbed the icon yet.
            # We'll leave it for now or rely on OS cleanup in temp. 
            # os.remove(icon_path) 
            
        except Exception as e:
            print(f"Error changing icon: {e}")

    def on_close(self):
        self.monitor.stop()
        self.master.destroy()

def cli_main():
    parser = argparse.ArgumentParser(description="Process monitor with GUI, filtering, and logging.")
    parser.add_argument("--nogui", action="store_true", help="Run headless (no GUI).")
    parser.add_argument("--poll", type=float, default=1.0, help="Poll interval in seconds.")

    parser.add_argument("--show-started", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument("--show-focused", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument("--show-taskbar", action=argparse.BooleanOptionalAction, default=True)

    parser.add_argument("--blacklist", type=str, default="", help="Comma-separated blacklist of process names.")
    parser.add_argument("--whitelist", type=str, default="", help="Comma-separated whitelist (overrides blacklist).")
    args = parser.parse_args()

    blacklist = [s.strip() for s in args.blacklist.split(",") if s.strip()]
    whitelist = [s.strip() for s in args.whitelist.split(",") if s.strip()]

    q = queue.Queue()
    # Note: whitelist arg is passed as `whitelist`
    mon = Monitor(event_queue=q, poll_interval=args.poll, show_started=args.show_started, show_focused=args.show_focused, show_taskbar=args.show_taskbar, whitelist=whitelist, blacklist=blacklist)
    mon.start()

    if not args.nogui:
        root = tk.Tk()
        gui = ProcMonGUI(root, q, mon)
        try:
            root.mainloop()
        except KeyboardInterrupt:
            mon.stop()
            root.destroy()
        finally:
            mon.join()
    else:
        # Headless mode
        try:
            print("Running in headless mode (Ctrl+C to stop)")
            while True:
                try:
                    msg = q.get(timeout=1.0)
                    print(msg)
                except queue.Empty:
                    pass
        except KeyboardInterrupt:
            print("\nStopping...")
            mon.stop()
            mon.join()

if __name__ == "__main__":
    cli_main()