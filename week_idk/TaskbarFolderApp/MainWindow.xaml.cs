using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using System.Security.Principal;
using FlaUI.UIA3;
using FlaUI.Core.Definitions;

namespace TaskbarFolderApp
{
    public partial class MainWindow : System.Windows.Window
    {
        // --- Fields ---
        private bool _isDragging = false;
        private Point _startPoint;
        private List<double> _taskbarSnapPoints = new List<double>();
        private readonly DispatcherTimer _zOrderTimer;

        // --- P/Invoke Definitions ---
        private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
        private const uint SWP_NOSIZE = 0x0001;
        private const uint SWP_NOMOVE = 0x0002;
        private const uint SWP_NOACTIVATE = 0x0010;
        private const uint SWP_SHOWWINDOW = 0x0040;

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

        [DllImport("gdi32.dll", SetLastError = true)]
        private static extern bool DeleteObject(IntPtr hObject);

        // --- Constructor ---
        public MainWindow()
        {
            InitializeComponent();
            
            // CRITICAL CHECK FOR ADMIN PRIVILEGES
            if (IsRunningAsAdmin())
            {
                System.Diagnostics.Debug.WriteLine("\n\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                System.Diagnostics.Debug.WriteLine("CRITICAL WARNING: APPLICATION RUNNING AS ADMINISTRATOR");
                System.Diagnostics.Debug.WriteLine("Windows BLOCKS Drag & Drop from File Explorer to Admin Apps.");
                System.Diagnostics.Debug.WriteLine("Please restart VS Code or Terminal as a STANDARD USER.");
                System.Diagnostics.Debug.WriteLine("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n\n");
            }
            else
            {
                System.Diagnostics.Debug.WriteLine("App running as Standard User (Good for Drag & Drop).");
            }

            PositionOnTaskbar();

            // Timer to enforce "Always on Top" aggressively (every 500ms)
            _zOrderTimer = new DispatcherTimer();
            _zOrderTimer.Interval = TimeSpan.FromMilliseconds(500);
            _zOrderTimer.Tick += EnforceTopmost;
            _zOrderTimer.Start();
        }

        // --- Initialization & Positioning ---
        public void PositionOnTaskbar()
        {
            var screenWidth = SystemParameters.PrimaryScreenWidth;
            var screenHeight = SystemParameters.PrimaryScreenHeight;
            var workArea = SystemParameters.WorkArea;

            // Calculate taskbar height (Screen - WorkArea)
            double taskbarHeight = screenHeight - workArea.Height;
            if (taskbarHeight <= 0) taskbarHeight = 50; // Fallback

            // Size and Position the Window
            this.Height = taskbarHeight - 4; 
            this.Top = screenHeight - taskbarHeight + 2;
            this.Left = (screenWidth - this.Width) / 2;
        }

        private void EnforceTopmost(object? sender, EventArgs e)
        {
            IntPtr hwnd = new WindowInteropHelper(this).Handle;
            if (hwnd != IntPtr.Zero)
            {
                SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
            }
        }
        
        private bool IsRunningAsAdmin()
        {
            using (var identity = WindowsIdentity.GetCurrent())
            {
                var principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
        }

        // --- Taskbar Scanning Logic (FlaUI) ---
        private void UpdateIconSnapPoints()
        {
            var snapPoints = new List<double>();
            
            // Get DPI Scale for conversion (Physical -> Logical)
            double dpiScaleX = 1.0;
            var source = PresentationSource.FromVisual(this);
            if (source?.CompositionTarget != null)
            {
                dpiScaleX = source.CompositionTarget.TransformToDevice.M11;
            }

            try
            {
                using (var automation = new UIA3Automation())
                {
                    var desktop = automation.GetDesktop();
                    var taskbar = desktop.FindFirstDescendant(cf => cf.ByClassName("Shell_TrayWnd"));

                    if (taskbar == null)
                    {
                        System.Diagnostics.Debug.WriteLine("Error: Could not find Shell_TrayWnd");
                        return;
                    }

                    // Attempt 1: Look for MSTaskListWClass (Running apps/Pins)
                    var taskList = taskbar.FindFirstDescendant(cf => cf.ByClassName("MSTaskListWClass"));
                    
                    if (taskList != null)
                    {
                        var taskItems = taskList.FindAllChildren();
                        foreach (var item in taskItems)
                        {
                            try
                            {
                                var rect = item.BoundingRectangle;
                                if (rect.Width > 0 && rect.Height > 0)
                                {
                                    // SNAP LOGIC: We want to snap our LEFT edge to the RIGHT edge of the icon.
                                    // Formula: IconRect.X + IconRect.Width => This becomes our new Left.
                                    
                                    double rightEdgeLogical = (rect.X + rect.Width) / dpiScaleX;
                                    snapPoints.Add(rightEdgeLogical);
                                }
                            }
                            catch { }
                        }
                    }
                    else
                    {
                        // Fallback: Scan all buttons
                        var allButtons = taskbar.FindAllDescendants(cf => cf.ByControlType(ControlType.Button));
                        foreach (var btn in allButtons)
                        {
                            try
                            {
                                var rect = btn.BoundingRectangle;
                                if (rect.Width > 0 && rect.Height > 0)
                                {
                                    double rightEdgeLogical = (rect.X + rect.Width) / dpiScaleX;
                                    snapPoints.Add(rightEdgeLogical);
                                }
                            }
                            catch { }
                        }
                    }
                }
            }
            catch (Exception ex) 
            { 
                System.Diagnostics.Debug.WriteLine($"Scanning Error: {ex.Message}"); 
            }

            _taskbarSnapPoints = snapPoints;
        }

        // --- Dragging Logic ---

        private void ContainerBorder_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
            {
                _isDragging = true;
                _startPoint = e.GetPosition(this); // Relative to Window
                ContainerBorder.CaptureMouse();

                // Refresh scan on grab
                UpdateIconSnapPoints();
            }
        }

        private void ContainerBorder_MouseMove(object sender, MouseEventArgs e)
        {
            if (_isDragging)
            {
                // 1. Get Physical Mouse Pos
                var currentMousePosPhysical = PointToScreen(e.GetPosition(this));

                // 2. DPI Conversion
                double dpiScaleX = 1.0;
                var source = PresentationSource.FromVisual(this);
                if (source?.CompositionTarget != null)
                {
                    dpiScaleX = source.CompositionTarget.TransformToDevice.M11;
                }
                double currentMousePosLogicalX = currentMousePosPhysical.X / dpiScaleX;

                // 3. Calculate "Raw" Position (Mouse - Offset)
                var rawLeft = currentMousePosLogicalX - _startPoint.X;

                // 4. Magnetic Snapping
                double snapThreshold = 15.0; // Pixels
                double closestDist = double.MaxValue;
                double finalPos = rawLeft;

                foreach (double targetX in _taskbarSnapPoints)
                {
                    double dist = Math.Abs(rawLeft - targetX);
                    if (dist < snapThreshold && dist < closestDist)
                    {
                        closestDist = dist;
                        finalPos = targetX;
                    }
                }

                // 5. Apply
                this.Left = finalPos;
            }
        }

        private void ContainerBorder_MouseUp(object sender, MouseButtonEventArgs e)
        {
            _isDragging = false;
            ContainerBorder.ReleaseMouseCapture();
            FinalizeSnap();
        }

        private void FinalizeSnap()
        {
            // If no magnets found, snap to implicit grid of 48px
            if (_taskbarSnapPoints.Count == 0)
            {
                double gridSize = 48.0;
                this.Left = Math.Round(this.Left / gridSize) * gridSize;
                return;
            }
            // (Otherwise the magnetic drag already placed us correctly)
        }

        // --- Drag & Drop (App Icons) ---

        private void ContainerBorder_DragEnter(object sender, DragEventArgs e)
        {
            System.Diagnostics.Debug.WriteLine("\n============== [DragEnter] ==============");
            System.Diagnostics.Debug.WriteLine($"Time: {DateTime.Now:HH:mm:ss.fff}");
            System.Diagnostics.Debug.WriteLine($"Allowed Effects: {e.AllowedEffects}");
            System.Diagnostics.Debug.WriteLine($"Key States: {e.KeyStates}");
            
            string[] formats = e.Data.GetFormats();
            System.Diagnostics.Debug.WriteLine($"Available Formats: {string.Join(", ", formats)}");

            // Check if the dragged item is a file (which usually has an icon)
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                System.Diagnostics.Debug.WriteLine(">>> STATUS: FileDrop Data Found! (Valid Icon Candidate)");
                
                try
                {
                    // Peek at files
                    string[] files = (string[])e.Data.GetData(DataFormats.FileDrop);
                    if (files != null)
                    {
                        System.Diagnostics.Debug.WriteLine($">>> Peek Count: {files.Length} files.");
                        foreach (var f in files)
                        {
                            System.Diagnostics.Debug.WriteLine($"   File: {f}");
                        }
                    }
                }
                catch { System.Diagnostics.Debug.WriteLine(">>> Note: Could not peek specific file paths yet."); }

                // Visual Signal: Change border to Green to indicate "Accepting"
                ContainerBorder.BorderBrush = Brushes.LightGreen;
                ContainerBorder.BorderThickness = new Thickness(4);
                
                // Show "Copy" cursor
                e.Effects = DragDropEffects.Copy;
            }
            else
            {
                System.Diagnostics.Debug.WriteLine(">>> STATUS: No FileDrop data. Ignoring.");
                e.Effects = DragDropEffects.None;
            }
            e.Handled = true;
        }

        private void ContainerBorder_DragLeave(object sender, DragEventArgs e)
        {
            System.Diagnostics.Debug.WriteLine("============== [DragLeave] ==============");
            System.Diagnostics.Debug.WriteLine("Mouse Exited Drop Zone.");
            
            // Reset visual signal
            ContainerBorder.BorderBrush = Brushes.White;
            ContainerBorder.BorderThickness = new Thickness(2);
        }
        
        private void ContainerBorder_DragOver(object sender, DragEventArgs e)
        {
            // This is CRITICAL for showing the "Copy" cursor instead of "None"
             if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                e.Effects = DragDropEffects.Copy;
                e.Handled = true;
            }
        }

        private void ContainerBorder_Drop(object sender, DragEventArgs e)
        {
            System.Diagnostics.Debug.WriteLine("\n============== [Drop] ==============");
            
            // Reset visuals regardless of outcome
            ContainerBorder.BorderBrush = Brushes.White;
            ContainerBorder.BorderThickness = new Thickness(2);

            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                string[] files = (string[])e.Data.GetData(DataFormats.FileDrop);
                foreach (string file in files)
                {
                    AddIconToDock(file);
                }
            }
        }

        private void AddIconToDock(string filePath)
        {
            try 
            {
                // Extract Icon from file
                var sysIcon = System.Drawing.Icon.ExtractAssociatedIcon(filePath);
                if (sysIcon == null) return;

                var imageSource = ToImageSource(sysIcon);
                
                // Create Button Container
                var btn = new Button
                {
                    Width = 40,
                    Height = 40,
                    Margin = new Thickness(2),
                    Padding = new Thickness(0),
                    Background = Brushes.Transparent,
                    BorderBrush = Brushes.Transparent,
                    Tag = filePath, // Store path for launching
                    ToolTip = System.IO.Path.GetFileNameWithoutExtension(filePath)
                };
                
                // Icon Image
                var img = new Image
                {
                    Source = imageSource,
                    Width = 32,
                    Height = 32
                };
                btn.Content = img;
                
                // Click Event
                btn.Click += AppIcon_Click;
                
                IconStackPanel.Children.Add(btn);
            } 
            catch (Exception ex) 
            {
                System.Diagnostics.Debug.WriteLine($"Error adding icon: {ex.Message}");
            }
        }

        private void AppIcon_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is string path)
            {
                try 
                { 
                     System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(path) { UseShellExecute = true }); 
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"Error launching app: {ex.Message}");
                }
            }
        }

        // Helper: Convert System.Drawing.Icon to WPF ImageSource
        private ImageSource ToImageSource(System.Drawing.Icon icon)
        {
            System.Drawing.Bitmap bitmap = icon.ToBitmap();
            IntPtr hBitmap = bitmap.GetHbitmap();

            ImageSource wpfBitmap = Imaging.CreateBitmapSourceFromHBitmap(
                hBitmap,
                IntPtr.Zero,
                Int32Rect.Empty,
                System.Windows.Media.Imaging.BitmapSizeOptions.FromEmptyOptions());

            if (!DeleteObject(hBitmap))
            {
                throw new System.ComponentModel.Win32Exception();
            }

            return wpfBitmap;
        }
    }
}