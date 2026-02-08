# Taskbar Dock Overlay

A custom Windows Taskbar extension written in C# (WPF) that creates a movable, always-on-top "dock" section directly on your taskbar. 

This project allows you to have a persistent container that sits over the taskbar, capable of snapping to the icon grid, intended for holding shortcuts, folders, or tools.

## Features

- **Taskbar Integration**: Sits directly on top of the native Windows taskbar.
- **Always on Top**: Aggressively maintains Z-order visibility using `SetWindowPos` and `HWIND_TOPMOST`.
- **Horizontal Docking**: Drag the container left or right to position it anywhere along the taskbar.
- **Grid Snapping**: Automatically snaps to 48px increments (standard Windows taskbar icon width) when dropped, keeping it aligned with your existing icons.
- **DPI Awareness**: Correctly handles dragging and positioning properly across different screen scalings.
- **Icon Position Scanning**: Includes debugging functionality to scan and log the coordinates of existing taskbar icons (using FlaUI), ensuring pixel-perfect alignment in future updates.

## Prerequisites

- **OS**: Windows 10 or Windows 11
- **Runtime**: .NET 9.0 SDK

## Getting Started

1. **Clone the repository** (or navigate to the folder):
   ```bash
   cd week_idk
   ```

2. **Restore Dependencies**:
   This project uses `FlaUI.UIA3` for UI automation interaction.
   ```bash
   dotnet restore TaskbarFolderApp/TaskbarFolderApp.csproj
   ```

3. **Run the Application**:
   ```bash
   dotnet run --project TaskbarFolderApp/TaskbarFolderApp.csproj
   ```

## Controls

- **Left Click & Drag**: Move the dock horizontally along the taskbar.
- **Release**: The dock will snap to the nearest 48px grid line.
- **Click**: (Currently in Debug Mode) triggers a scan of all taskbar icons and prints their coordinates to the Debug Console.

## Technical Implementation

- **WPF (Windows Presentation Foundation)**: Used for the borderless, transparent UI.
- **P/Invoke (User32.dll)**:
  - `SetWindowPos`: Used to force the window to be topmost.
- **FlaUI**: Used to inspect the `Shell_TrayWnd` (Windows Taskbar) structure to find existing button locations.

## License

MIT
