import tkinter as tk
from tkinter import Canvas, Button, Frame
from PIL import Image, ImageTk, ImageDraw

class IconEditor(tk.Toplevel):
    def __init__(self, master, original_image, on_save_callback):
        super().__init__(master)
        self.title("Draw Icon")
        self.geometry("300x400")
        
        self.on_save_callback = on_save_callback
        
        # Prepare images
        # 32x32 is standard icon size
        if original_image:
             # Make sure it's RGBA and 32x32
             self.draw_image = original_image.copy().resize((32, 32), Image.Resampling.NEAREST).convert("RGBA")
             self.original_backup = self.draw_image.copy()
        else:
             self.draw_image = Image.new("RGBA", (32, 32), (255, 255, 255, 255))
             self.original_backup = self.draw_image.copy()

        self.draw = ImageDraw.Draw(self.draw_image)
        
        # Canvas Setup (Scale up x8 for easier drawing)
        self.scale = 8
        self.canvas_size = 32 * self.scale
        
        self.canvas = Canvas(self, width=self.canvas_size, height=self.canvas_size, bg="#333", cursor="cross")
        self.canvas.pack(pady=10)
        
        # Bindings
        self.canvas.bind("<Button-1>", self.on_click)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)
        
        self.last_x = None
        self.last_y = None

        # Draw initial state
        self.tk_img = None
        self.update_canvas_view()
        
        # Controls
        lbl = tk.Label(self, text="Draw with Red Pen over the icon")
        lbl.pack()

        btn_frame = Frame(self)
        btn_frame.pack(side=tk.BOTTOM, fill=tk.X, pady=10)
        
        Button(btn_frame, text="Reset", command=self.reset).pack(side=tk.LEFT, padx=20)
        Button(btn_frame, text="Save & Set", command=self.save, bg="#ccffcc").pack(side=tk.RIGHT, padx=20)

    def get_canvas_coords(self, event):
        return int(event.x / self.scale), int(event.y / self.scale)

    def update_canvas_view(self):
        # Resize for display
        display = self.draw_image.resize((self.canvas_size, self.canvas_size), Image.Resampling.NEAREST)
        self.tk_img = ImageTk.PhotoImage(display)
        self.canvas.create_image(0, 0, image=self.tk_img, anchor=tk.NW)

    def on_click(self, event):
        x, y = self.get_canvas_coords(event)
        self.draw_point(x, y)
        self.last_x, self.last_y = x, y
        self.update_canvas_view()

    def on_drag(self, event):
        x, y = self.get_canvas_coords(event)
        if self.last_x is not None:
             self.draw.line([self.last_x, self.last_y, x, y], fill=(255, 0, 0, 255), width=1)
        self.draw_point(x, y)
        self.last_x, self.last_y = x, y
        self.update_canvas_view()
    
    def on_release(self, event):
        self.last_x = None
        self.last_y = None

    def draw_point(self, x, y):
        # Draw red dot
        if 0 <= x < 32 and 0 <= y < 32:
             self.draw.point((x, y), fill=(255, 0, 0, 255))

    def reset(self):
        self.draw_image = self.original_backup.copy()
        self.draw = ImageDraw.Draw(self.draw_image)
        self.update_canvas_view()

    def save(self):
        self.on_save_callback(self.draw_image)
        self.destroy()
