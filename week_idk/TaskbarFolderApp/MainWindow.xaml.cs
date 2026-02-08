using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using FlaUI.UIA3;
// Explicitly use the correct UIA types
using FlaUI.Core;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;

namespace TaskbarFolderApp
{
    public partial class MainWindow : System.Windows.Window
    {
        private bool _isDragging = false;
        private Point _startPoint;

        // P/Invoke constants
        private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
        private const uint SWP_NOSIZE = 0x0001;
        private const uint SWP_NOMOVE = 0x0002;
        private const uint SWP_NOACTIVATE = 0x0010;
        private const uint SWP_SHOWWINDOW = 0x0040;

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

        public MainWindow()
        {
            InitializeComponent();
            PositionOnTaskbar();
            
            // Timer to enforce "Always on Top" aggressively
            var timer = new DispatcherTimer();
            timer.Interval = TimeSpan.FromMilliseconds(500);
            timer.Tick += (s, e) => EnforceTopmost();
            timer.Start();
        }

        private void EnforceTopmost()
        {
            // Use low-level API to force the window to the very top of the Z-order
            IntPtr hwnd = new WindowInteropHelper(this).Handle;
            if (hwnd != IntPtr.Zero)
            {
                SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
            }
        }



        public void PositionOnTaskbar()
        {
            // Simple logic to find taskbar position on primary screen
            var screenWidth = SystemParameters.PrimaryScreenWidth;
            var screenHeight = SystemParameters.PrimaryScreenHeight;
            var workArea = SystemParameters.WorkArea;

            // Assumption: Taskbar is at the bottom (Standard Windows layout)
            // Height = Total Screen Height - Work Area Height
            double taskbarHeight = screenHeight - workArea.Height;
            
            // If taskbar is hidden or on side, this simple math might need adjustment,
            // but for 99% of cases this finds the "strip" at the bottom.
            if (taskbarHeight <= 0) taskbarHeight = 50; // Fallback

            this.Height = taskbarHeight - 4; // Slightly smaller to look "inside"
            this.Top = screenHeight - taskbarHeight + 2;
            
            // Start in the middle
            this.Left = (screenWidth - this.Width) / 2;
        }

        // --- Dragging Logic ---
        // We implement custom dragging because Window.DragMove() allows moving anywhere.
        // We want to restrict movement to the X-axis (horizontally along the taskbar).

        private void ContainerBorder_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
            {
                _isDragging = true;
                // Capture the mouse offset relative to the Window's top-left corner
                _startPoint = e.GetPosition(this);
                ContainerBorder.CaptureMouse();
                
                // --- DEBUG: Print Taskbar Icons ---
                PrintTaskbarIcons();
            }
        }

        private void PrintTaskbarIcons()
        {
            // Run on a background thread to avoid freezing the UI while scanning
            System.Threading.Tasks.Task.Run(() => 
            {
                System.Diagnostics.Debug.WriteLine("\n--- SCANNING TASKBAR ICONS ---");
                try
                {
                    using (var automation = new UIA3Automation())
                    {
                        var desktop = automation.GetDesktop();
                        
                        // 1. Find the Taskbar ("Shell_TrayWnd")
                        // Usually top level of desktop
                        var taskbar = desktop.FindFirstDescendant(cf => cf.ByClassName("Shell_TrayWnd"));
                        if (taskbar == null)
                        {
                            System.Diagnostics.Debug.WriteLine("Error: Could not find Shell_TrayWnd");
                            return;
                        }

                        // 2. Find internal structure
                        // On Win10/11, it varies. We just want to find ALL Buttons inside the taskbar recursively.
                        var allButtons = taskbar.FindAllDescendants(cf => cf.ByControlType(ControlType.Button));
                        
                        int i = 0;
                        foreach (var btn in allButtons)
                        {
                            try 
                            { 
                                // BoundingRectangle usually throws if element is invalid/gone
                                var rect = btn.BoundingRectangle;
                                string name = btn.Name;

                                // Filter out 0x0 hidden buttons or items far off screen
                                if (rect.Width > 0 && rect.Height > 0)
                                {
                                    System.Diagnostics.Debug.WriteLine($"Icon [{i}]: '{name}' @ X={rect.X}, Y={rect.Y}, W={rect.Width}, H={rect.Height}");
                                    i++;
                                }
                            }
                            catch {}
                        }
                    }
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"Error scanning taskbar: {ex.Message}");
                }
                System.Diagnostics.Debug.WriteLine("------------------------------\n");
            });
        }

        private void ContainerBorder_MouseMove(object sender, MouseEventArgs e)
        {
            if (_isDragging)
            {
                // Get current mouse position in Screen coordinates (Physical Pixels)
                var currentMousePosPhysical = PointToScreen(e.GetPosition(this));

                // Get DPI Scale to convert Physical Pixels -> Device Independent Pixels (Logical)
                double dpiScaleX = 1.0;
                var source = PresentationSource.FromVisual(this);
                if (source != null && source.CompositionTarget != null)
                {
                    dpiScaleX = source.CompositionTarget.TransformToDevice.M11;
                }

                // Convert Physical X to Logical X
                double currentMousePosLogicalX = currentMousePosPhysical.X / dpiScaleX;
                
                // Set position: MouseScreenX (Logical) - OffsetInsideWindow (Logical)
                this.Left = currentMousePosLogicalX - _startPoint.X;
                
                // NOTE: We do NOT change 'this.Top'. 
                // This keeps it locked to the vertical "Level" of the taskbar.
            }
        }

        private void ContainerBorder_MouseUp(object sender, MouseButtonEventArgs e)
        {
            _isDragging = false;
            ContainerBorder.ReleaseMouseCapture();
            SnapToGrid();
        }

        private void SnapToGrid()
        {
            // Approximate width of a taskbar icon slot (usually 48px or 40px depending on scaling)
            // We use 48 as a safe default for standard 100-125% scaling
            double gridSize = 48.0;

            // Simply round the current Left position to the nearest grid step
            // This gives it that "notched" feel
            this.Left = Math.Round(this.Left / gridSize) * gridSize;
        }
    }
}