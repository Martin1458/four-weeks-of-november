# Process Monitor

Features:
- Detects process starts (by PID/create_time) and focused window changes.
- Console + rotating file logging (logs/app.log).
- Filtering: blacklist or whitelist via CLI or GUI.
- Simple Tkinter GUI showing live events and controls.

Install:
```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Run with GUI:
```powershell
python app.py
```

Run headless:
```powershell
python app.py --nogui --blacklist "svchost.exe,conhost.exe"
```
