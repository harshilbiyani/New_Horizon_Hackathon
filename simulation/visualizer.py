import tkinter as tk
from tkinter import ttk
import math

from main import DroneSwarmSimulation
from config import (
    GRID_WIDTH,
    GRID_HEIGHT,
    SIMULATION_SPEED,
    DEFAULT_ENVIRONMENT,
    ENVIRONMENT_PROFILES,
)


FRAME_DELAY_MS = max(20, int(SIMULATION_SPEED * 1000))
ISO_TILE_W = 16
ISO_TILE_H = 9
ISO_HEIGHT_SCALE = 0.55
ZOOM_MIN = 0.55
ZOOM_MAX = 2.6
ZOOM_STEP = 1.08
UI_FONT = "Segoe UI"
UI_BG = "#eff3f8"
PANEL_BG = "#f7fafd"
PANEL_BORDER = "#b8c7da"
TEXT_MUTED = "#4b627a"


class DroneVisualizer(tk.Tk):
    def __init__(self, sim):
        super().__init__()
        self.title("Drone Swarm 3D Visualization")
        self.geometry("1540x920")
        self.minsize(1320, 820)
        self.configure(bg=UI_BG)
        self.sim = sim

        self.default_origin_x = 700
        self.default_origin_y = 110
        self.origin_x = self.default_origin_x
        self.origin_y = self.default_origin_y
        self.view_scale = 1.0
        self.view_rotation_x_deg = 0.0
        self.view_rotation_y_deg = 0.0
        self.view_rotation_z_deg = 0.0
        self._rot_x_cos = 1.0
        self._rot_x_sin = 0.0
        self._rot_y_cos = 1.0
        self._rot_y_sin = 0.0
        self._rot_z_cos = 1.0
        self._rot_z_sin = 0.0
        self._is_panning = False
        self._last_pan_x = 0
        self._last_pan_y = 0

        self.rotation_x_value_var = tk.StringVar(value="0°")
        self.rotation_y_value_var = tk.StringVar(value="0°")
        self.rotation_z_value_var = tk.StringVar(value="0°")
        self.zoom_value_var = tk.StringVar(value="1.00x")

        self.status_vars = {
            "profile": tk.StringVar(value="--"),
            "mode": tk.StringVar(value="--"),
            "step": tk.StringVar(value="0"),
            "coverage": tk.StringVar(value="0.0%"),
            "survivors": tk.StringVar(value="0/0"),
            "wind": tk.StringVar(value="0.00"),
            "visibility": tk.StringVar(value="1.00"),
            "hazards": tk.StringVar(value="0"),
            "battery": tk.StringVar(value="0"),
            "rotation": tk.StringVar(value="X 0° | Y 0° | Z 0°"),
            "zoom": tk.StringVar(value="1.00x"),
        }
        self.obs_height_range_var = tk.StringVar(value="Obstacle min/max: 0.0 / 0.0 m")
        self.drone_height_range_var = tk.StringVar(value="Drone altitude min/max: 0.0 / 0.0 m")
        self.event_var = tk.StringVar(value="No detections yet")
        self.coverage_progress_var = tk.DoubleVar(value=0.0)
        self.battery_progress_var = tk.DoubleVar(value=0.0)

        self._configure_styles()
        self._build_ui()
        self._bind_camera_controls()
        self._update_rotation_cache()
        self._sync_rotation_ui_labels()

        self.draw_scene()
        self.after(FRAME_DELAY_MS, self.update_sim)

    def _configure_styles(self):
        self.style = ttk.Style(self)
        try:
            self.style.theme_use("clam")
        except tk.TclError:
            pass

        self.style.configure(".", font=(UI_FONT, 9))
        self.style.configure("TFrame", background=UI_BG)
        self.style.configure("TLabel", background=UI_BG, foreground="#24374d")
        self.style.configure("Muted.TLabel", background=UI_BG, foreground=TEXT_MUTED)

        self.style.configure(
            "Card.TLabelframe",
            background=PANEL_BG,
            borderwidth=1,
            relief="solid",
            bordercolor=PANEL_BORDER,
        )
        self.style.configure(
            "Card.TLabelframe.Label",
            background=PANEL_BG,
            foreground="#24374d",
            font=(UI_FONT, 10, "bold"),
        )
        self.style.configure("Card.TFrame", background=PANEL_BG)
        self.style.configure("Card.TLabel", background=PANEL_BG, foreground="#24374d")
        self.style.configure("Muted.Card.TLabel", background=PANEL_BG, foreground=TEXT_MUTED)

        self.style.configure("Coverage.Horizontal.TProgressbar", troughcolor="#d8e4f2", background="#2f91ff")
        self.style.configure("Battery.Horizontal.TProgressbar", troughcolor="#e4e9f0", background="#34a853")

    def _build_ui(self):
        shell = ttk.Frame(self, padding=(12, 10, 12, 10))
        shell.pack(fill="both", expand=True)

        sidebar = ttk.Frame(shell, width=360)
        sidebar.pack(side="left", fill="y", padx=(0, 12))
        sidebar.pack_propagate(False)

        title_label = ttk.Label(
            sidebar,
            text="Mission Control",
            font=(UI_FONT, 16, "bold"),
        )
        title_label.pack(anchor="w")

        subtitle_label = ttk.Label(
            sidebar,
            text="3D drone swarm monitoring and camera controls",
            font=(UI_FONT, 9),
            foreground="#3d5269",
        )
        subtitle_label.pack(anchor="w", pady=(0, 8))

        env_frame = ttk.LabelFrame(sidebar, text="Environment", style="Card.TLabelframe")
        env_frame.pack(fill="x", pady=(0, 10))

        ttk.Label(env_frame, text="Profile", font=(UI_FONT, 9, "bold"), style="Card.TLabel").pack(
            anchor="w", padx=10, pady=(6, 0)
        )
        self.environment_var = tk.StringVar(value=self.sim.environment_name)
        env_options = list(ENVIRONMENT_PROFILES.keys())
        self.environment_selector = ttk.Combobox(
            env_frame,
            textvariable=self.environment_var,
            values=env_options,
            state="readonly",
            width=28,
        )
        self.environment_selector.pack(fill="x", padx=10, pady=(4, 8))
        self.environment_selector.bind("<<ComboboxSelected>>", self._on_environment_change)

        env_button_row = ttk.Frame(env_frame, style="Card.TFrame")
        env_button_row.pack(fill="x", padx=10, pady=(0, 8))

        self.reset_view_button = ttk.Button(
            env_button_row,
            text="Reset Camera",
            command=self._reset_view,
        )
        self.reset_view_button.pack(side="left")

        camera_frame = ttk.LabelFrame(sidebar, text="Camera", style="Card.TLabelframe")
        camera_frame.pack(fill="x", pady=(0, 10))

        self.rotation_x_scale = self._create_rotation_control(
            camera_frame,
            "Rotate X",
            self.rotation_x_value_var,
            self._on_rotation_x_slider,
        )
        self.rotation_y_scale = self._create_rotation_control(
            camera_frame,
            "Rotate Y",
            self.rotation_y_value_var,
            self._on_rotation_y_slider,
        )
        self.rotation_z_scale = self._create_rotation_control(
            camera_frame,
            "Rotate Z",
            self.rotation_z_value_var,
            self._on_rotation_z_slider,
        )

        quick_row = ttk.Frame(camera_frame, style="Card.TFrame")
        quick_row.pack(fill="x", padx=10, pady=(4, 8))
        self.rotate_left_button = ttk.Button(
            quick_row,
            text="Z -15°",
            command=lambda: self._rotate_z_by(-15),
            width=10,
        )
        self.rotate_left_button.pack(side="left")

        self.rotate_right_button = ttk.Button(
            quick_row,
            text="Z +15°",
            command=lambda: self._rotate_z_by(15),
            width=10,
        )
        self.rotate_right_button.pack(side="left", padx=(6, 0))

        zoom_row = ttk.Frame(camera_frame, style="Card.TFrame")
        zoom_row.pack(fill="x", padx=10, pady=(0, 8))
        ttk.Label(zoom_row, text="Zoom", font=(UI_FONT, 9, "bold"), style="Card.TLabel").pack(side="left")
        ttk.Label(zoom_row, textvariable=self.zoom_value_var, font=(UI_FONT, 9), style="Card.TLabel").pack(side="right")

        zoom_btn_row = ttk.Frame(camera_frame, style="Card.TFrame")
        zoom_btn_row.pack(fill="x", padx=10, pady=(0, 8))
        ttk.Button(zoom_btn_row, text="Zoom -", command=lambda: self._zoom(False), width=10).pack(side="left")
        ttk.Button(zoom_btn_row, text="Zoom +", command=lambda: self._zoom(True), width=10).pack(
            side="left", padx=(6, 0)
        )

        self.camera_hint_label = ttk.Label(
            camera_frame,
            text=(
                "Mouse drag: pan | Mouse wheel: zoom\n"
                "A/D: Z axis | W/S: X axis | Q/E: Y axis\n"
                "Arrow keys: nudge camera | R: reset"
            ),
            justify="left",
            font=(UI_FONT, 9),
            style="Muted.Card.TLabel",
        )
        self.camera_hint_label.pack(fill="x", padx=10, pady=(0, 10))

        profile_label = ", ".join(
            f"{name} ({'dynamic' if cfg.get('dynamic') else 'static'})"
            for name, cfg in ENVIRONMENT_PROFILES.items()
        )
        self.env_help_label = ttk.Label(
            sidebar,
            text=f"Profiles: {profile_label}",
            justify="left",
            font=(UI_FONT, 8),
            style="Muted.TLabel",
            wraplength=330,
        )
        self.env_help_label.pack(fill="x", pady=(0, 8))

        legend_frame = ttk.LabelFrame(sidebar, text="Legend", style="Card.TLabelframe")
        legend_frame.pack(fill="x", pady=(0, 10))

        entries = [
            ("#e5ecd6", "Unscanned ground tile"),
            ("#d8f0d0", "Scanned ground tile"),
            ("#f6c7c7", "Dynamic hazard zone"),
            ("#6f7685", "Obstacle block top"),
            ("#ff5959", "Found survivor marker"),
            ("#2f91ff", "Drone marker"),
        ]
        for color, label in entries:
            self._add_legend_row(legend_frame, color, label)

        ttk.Label(legend_frame, textvariable=self.obs_height_range_var, font=(UI_FONT, 9), style="Card.TLabel").pack(
            anchor="w", padx=10, pady=(6, 0)
        )
        ttk.Label(
            legend_frame,
            textvariable=self.drone_height_range_var,
            font=(UI_FONT, 9),
            style="Card.TLabel",
        ).pack(
            anchor="w", padx=10, pady=(2, 8)
        )

        status_frame = ttk.LabelFrame(sidebar, text="Live Metrics", style="Card.TLabelframe")
        status_frame.pack(fill="x")
        self._add_status_row(status_frame, "Profile", self.status_vars["profile"])
        self._add_status_row(status_frame, "Mode", self.status_vars["mode"])
        self._add_status_row(status_frame, "Step", self.status_vars["step"])
        self._add_status_row(status_frame, "Coverage", self.status_vars["coverage"])
        self._add_status_row(status_frame, "Survivors", self.status_vars["survivors"])
        self._add_status_row(status_frame, "Wind", self.status_vars["wind"])
        self._add_status_row(status_frame, "Visibility", self.status_vars["visibility"])
        self._add_status_row(status_frame, "Hazards", self.status_vars["hazards"])
        self._add_status_row(status_frame, "Swarm Battery", self.status_vars["battery"])
        self._add_status_row(status_frame, "Rotation", self.status_vars["rotation"])
        self._add_status_row(status_frame, "Zoom", self.status_vars["zoom"])

        ttk.Label(status_frame, text="Coverage Progress", font=(UI_FONT, 9, "bold"), style="Card.TLabel").pack(
            anchor="w", padx=10, pady=(6, 0)
        )
        ttk.Progressbar(
            status_frame,
            variable=self.coverage_progress_var,
            maximum=100.0,
            style="Coverage.Horizontal.TProgressbar",
        ).pack(fill="x", padx=10, pady=(2, 8))

        ttk.Label(status_frame, text="Average Battery", font=(UI_FONT, 9, "bold"), style="Card.TLabel").pack(
            anchor="w", padx=10, pady=(0, 0)
        )
        ttk.Progressbar(
            status_frame,
            variable=self.battery_progress_var,
            maximum=100.0,
            style="Battery.Horizontal.TProgressbar",
        ).pack(fill="x", padx=10, pady=(2, 10))

        main_panel = ttk.Frame(shell)
        main_panel.pack(side="left", fill="both", expand=True)

        self.info_label = ttk.Label(
            main_panel,
            text="Step: 0",
            font=(UI_FONT, 11, "bold"),
            foreground="#24374d",
        )
        self.info_label.pack(fill="x", pady=(0, 4))

        self.event_label = ttk.Label(
            main_panel,
            textvariable=self.event_var,
            font=(UI_FONT, 10, "bold"),
            foreground="#8b2323",
        )
        self.event_label.pack(fill="x", pady=(0, 8))

        self.canvas = tk.Canvas(
            main_panel,
            bg="#e7eef6",
            highlightthickness=1,
            highlightbackground="#96abc6",
        )
        self.canvas.pack(fill="both", expand=True)

    def _create_rotation_control(self, parent, label_text, value_var, command):
        row = ttk.Frame(parent, style="Card.TFrame")
        row.pack(fill="x", padx=10, pady=(6, 0))
        ttk.Label(row, text=label_text, font=(UI_FONT, 9, "bold"), style="Card.TLabel").pack(side="left")
        ttk.Label(row, textvariable=value_var, font=(UI_FONT, 9), style="Card.TLabel").pack(side="right")

        scale = tk.Scale(
            parent,
            from_=-180,
            to=180,
            orient="horizontal",
            length=250,
            resolution=1,
            showvalue=False,
            bg=PANEL_BG,
            activebackground="#d9e5f6",
            highlightthickness=0,
            command=command,
        )
        scale.pack(fill="x", padx=10, pady=(0, 3))
        scale.set(0)
        return scale

    def _add_status_row(self, parent, label_text, value_var):
        row = ttk.Frame(parent, style="Card.TFrame")
        row.pack(fill="x", padx=10, pady=2)
        ttk.Label(row, text=label_text, font=(UI_FONT, 9), style="Card.TLabel").pack(side="left")
        ttk.Label(row, textvariable=value_var, font=(UI_FONT, 9, "bold"), style="Card.TLabel").pack(side="right")

    def _add_legend_row(self, parent, color, label):
        row = ttk.Frame(parent, style="Card.TFrame")
        row.pack(fill="x", padx=10, pady=2)
        swatch = tk.Canvas(
            row,
            width=18,
            height=12,
            bd=0,
            highlightthickness=1,
            highlightbackground="#2f3f52",
        )
        swatch.create_rectangle(0, 0, 18, 12, fill=color, outline="")
        swatch.pack(side="left")
        ttk.Label(row, text=label, font=(UI_FONT, 9), style="Card.TLabel").pack(side="left", padx=(8, 0))

    def _sync_rotation_ui_labels(self):
        self.rotation_x_value_var.set(f"{self.view_rotation_x_deg:.0f}°")
        self.rotation_y_value_var.set(f"{self.view_rotation_y_deg:.0f}°")
        self.rotation_z_value_var.set(f"{self.view_rotation_z_deg:.0f}°")
        self.status_vars["rotation"].set(
            f"X {self.view_rotation_x_deg:.0f}° | "
            f"Y {self.view_rotation_y_deg:.0f}° | "
            f"Z {self.view_rotation_z_deg:.0f}°"
        )
        self.status_vars["zoom"].set(f"{self.view_scale:.2f}x")
        self.zoom_value_var.set(f"{self.view_scale:.2f}x")

    def _bind_camera_controls(self):
        self.canvas.bind("<ButtonPress-1>", self._start_pan)
        self.canvas.bind("<B1-Motion>", self._pan_view)
        self.canvas.bind("<ButtonRelease-1>", self._end_pan)
        self.canvas.bind("<MouseWheel>", self._on_mouse_wheel)
        self.canvas.bind("<Button-4>", lambda e: self._zoom(True, e.x, e.y))
        self.canvas.bind("<Button-5>", lambda e: self._zoom(False, e.x, e.y))
        self.canvas.bind("<Enter>", lambda _e: self.canvas.focus_set())
        self.canvas.focus_set()

        self.bind("<Left>", lambda _e: self._pan_by(25, 0))
        self.bind("<Right>", lambda _e: self._pan_by(-25, 0))
        self.bind("<Up>", lambda _e: self._pan_by(0, 25))
        self.bind("<Down>", lambda _e: self._pan_by(0, -25))
        self.bind("<Key-a>", lambda _e: self._rotate_z_by(-10))
        self.bind("<Key-A>", lambda _e: self._rotate_z_by(-10))
        self.bind("<Key-d>", lambda _e: self._rotate_z_by(10))
        self.bind("<Key-D>", lambda _e: self._rotate_z_by(10))
        self.bind("<Key-w>", lambda _e: self._rotate_x_by(-8))
        self.bind("<Key-W>", lambda _e: self._rotate_x_by(-8))
        self.bind("<Key-s>", lambda _e: self._rotate_x_by(8))
        self.bind("<Key-S>", lambda _e: self._rotate_x_by(8))
        self.bind("<Key-q>", lambda _e: self._rotate_y_by(-8))
        self.bind("<Key-Q>", lambda _e: self._rotate_y_by(-8))
        self.bind("<Key-e>", lambda _e: self._rotate_y_by(8))
        self.bind("<Key-E>", lambda _e: self._rotate_y_by(8))
        self.bind("<Key-r>", lambda _e: self._reset_view())
        self.bind("<Key-R>", lambda _e: self._reset_view())

    def _start_pan(self, event):
        self._is_panning = True
        self._last_pan_x = event.x
        self._last_pan_y = event.y

    def _pan_view(self, event):
        if not self._is_panning:
            return
        dx = event.x - self._last_pan_x
        dy = event.y - self._last_pan_y
        self.origin_x += dx
        self.origin_y += dy
        self._last_pan_x = event.x
        self._last_pan_y = event.y
        self.draw_scene()

    def _end_pan(self, _event):
        self._is_panning = False

    def _pan_by(self, dx, dy):
        self.origin_x += dx
        self.origin_y += dy
        self.draw_scene()

    def _zoom(self, zoom_in, anchor_x=None, anchor_y=None):
        old_scale = self.view_scale
        new_scale = old_scale * ZOOM_STEP if zoom_in else old_scale / ZOOM_STEP
        new_scale = max(ZOOM_MIN, min(ZOOM_MAX, new_scale))

        if abs(new_scale - old_scale) < 1e-6:
            return

        if anchor_x is None:
            anchor_x = self.canvas.winfo_width() / 2.0
        if anchor_y is None:
            anchor_y = self.canvas.winfo_height() / 2.0

        ratio = new_scale / old_scale
        self.origin_x = anchor_x + (self.origin_x - anchor_x) * ratio
        self.origin_y = anchor_y + (self.origin_y - anchor_y) * ratio
        self.view_scale = new_scale
        self._sync_rotation_ui_labels()
        self.draw_scene()

    def _on_mouse_wheel(self, event):
        self._zoom(event.delta > 0, event.x, event.y)

    def _wrap_angle(self, angle_deg):
        return ((angle_deg + 180.0) % 360.0) - 180.0

    def _update_rotation_cache(self):
        theta_x = math.radians(self.view_rotation_x_deg)
        theta_y = math.radians(self.view_rotation_y_deg)
        theta_z = math.radians(self.view_rotation_z_deg)

        self._rot_x_cos = math.cos(theta_x)
        self._rot_x_sin = math.sin(theta_x)
        self._rot_y_cos = math.cos(theta_y)
        self._rot_y_sin = math.sin(theta_y)
        self._rot_z_cos = math.cos(theta_z)
        self._rot_z_sin = math.sin(theta_z)

    def _on_rotation_x_slider(self, value):
        self.view_rotation_x_deg = float(value)
        self._update_rotation_cache()
        self._sync_rotation_ui_labels()
        self.draw_scene()

    def _on_rotation_y_slider(self, value):
        self.view_rotation_y_deg = float(value)
        self._update_rotation_cache()
        self._sync_rotation_ui_labels()
        self.draw_scene()

    def _on_rotation_z_slider(self, value):
        self.view_rotation_z_deg = float(value)
        self._update_rotation_cache()
        self._sync_rotation_ui_labels()
        self.draw_scene()

    def _rotate_x_by(self, delta_deg):
        next_deg = self._wrap_angle(self.view_rotation_x_deg + delta_deg)
        self.rotation_x_scale.set(next_deg)

    def _rotate_y_by(self, delta_deg):
        next_deg = self._wrap_angle(self.view_rotation_y_deg + delta_deg)
        self.rotation_y_scale.set(next_deg)

    def _rotate_z_by(self, delta_deg):
        next_deg = self._wrap_angle(self.view_rotation_z_deg + delta_deg)
        self.rotation_z_scale.set(next_deg)

    def _reset_view(self):
        self.origin_x = self.default_origin_x
        self.origin_y = self.default_origin_y
        self.view_scale = 1.0
        self.view_rotation_x_deg = 0.0
        self.view_rotation_y_deg = 0.0
        self.view_rotation_z_deg = 0.0
        self.rotation_x_scale.set(0)
        self.rotation_y_scale.set(0)
        self.rotation_z_scale.set(0)
        self._update_rotation_cache()
        self._sync_rotation_ui_labels()
        self.draw_scene()

    def _rotate_point(self, x, y, z_m=0.0):
        center_x = GRID_WIDTH / 2.0
        center_y = GRID_HEIGHT / 2.0

        px = x - center_x
        py = y - center_y
        pz = z_m

        # X-axis rotation (pitch)
        py_x = (py * self._rot_x_cos) - (pz * self._rot_x_sin)
        pz_x = (py * self._rot_x_sin) + (pz * self._rot_x_cos)

        # Y-axis rotation (roll)
        px_y = (px * self._rot_y_cos) + (pz_x * self._rot_y_sin)
        pz_y = (-px * self._rot_y_sin) + (pz_x * self._rot_y_cos)

        # Z-axis rotation (yaw)
        px_z = (px_y * self._rot_z_cos) - (py_x * self._rot_z_sin)
        py_z = (px_y * self._rot_z_sin) + (py_x * self._rot_z_cos)

        return px_z, py_z, pz_y

    def _iso(self, x, y, z_m=0.0):
        tile_w = ISO_TILE_W * self.view_scale
        tile_h = ISO_TILE_H * self.view_scale
        h_scale = ISO_HEIGHT_SCALE * self.view_scale

        rx, ry, rz = self._rotate_point(x, y, z_m)

        px = (rx - ry) * (tile_w / 2.0) + self.origin_x
        py = (rx + ry) * (tile_h / 2.0) - (rz * h_scale) + self.origin_y
        return (px, py)

    def _tile_poly(self, x, y, z_m):
        a = self._iso(x, y, z_m)
        b = self._iso(x + 1, y, z_m)
        c = self._iso(x + 1, y + 1, z_m)
        d = self._iso(x, y + 1, z_m)
        return a, b, c, d

    def _shade_color(self, base, delta):
        base = base.lstrip("#")
        r = int(base[0:2], 16)
        g = int(base[2:4], 16)
        b = int(base[4:6], 16)
        r = max(0, min(255, r + delta))
        g = max(0, min(255, g + delta))
        b = max(0, min(255, b + delta))
        return f"#{r:02x}{g:02x}{b:02x}"

    def _poly_area(self, points):
        area = 0.0
        count = len(points)
        for idx in range(count):
            x1, y1 = points[idx]
            x2, y2 = points[(idx + 1) % count]
            area += (x1 * y2) - (x2 * y1)
        return abs(area) * 0.5

    def _draw_obstacle_block(self, x, y, h_m):
        base_a, base_b, base_c, base_d = self._tile_poly(x, y, 0.0)
        top_a, top_b, top_c, top_d = self._tile_poly(x, y, h_m)

        height_tint = min(96, int(max(0.0, h_m) * 1.4))
        top_color = self._shade_color("#7a8598", height_tint // 10)
        edge_color = "#2b3340"

        sides = []
        side_specs = [
            (base_a, base_b, top_b, top_a, -34),
            (base_b, base_c, top_c, top_b, -24),
            (base_c, base_d, top_d, top_c, -30),
            (base_d, base_a, top_a, top_d, -40),
        ]
        for p1, p2, p3, p4, shade_delta in side_specs:
            quad = [p1, p2, p3, p4]
            if self._poly_area(quad) < 2.0:
                continue
            avg_y = (p1[1] + p2[1] + p3[1] + p4[1]) / 4.0
            sides.append((avg_y, quad, self._shade_color(top_color, shade_delta)))

        sides.sort(key=lambda item: item[0])
        for _, quad, color in sides:
            p1, p2, p3, p4 = quad
            self.canvas.create_polygon(
                p1[0], p1[1], p2[0], p2[1], p3[0], p3[1], p4[0], p4[1],
                fill=color,
                outline=edge_color,
                width=1,
            )

            if h_m >= 12.0:
                for t in (0.34, 0.67):
                    sx1 = p1[0] + (p4[0] - p1[0]) * t
                    sy1 = p1[1] + (p4[1] - p1[1]) * t
                    sx2 = p2[0] + (p3[0] - p2[0]) * t
                    sy2 = p2[1] + (p3[1] - p2[1]) * t
                    self.canvas.create_line(
                        sx1,
                        sy1,
                        sx2,
                        sy2,
                        fill=self._shade_color(color, 14),
                        width=1,
                    )

        self.canvas.create_polygon(
            top_a[0], top_a[1], top_b[0], top_b[1], top_c[0], top_c[1], top_d[0], top_d[1],
            fill=top_color,
            outline=edge_color,
            width=1,
        )
        self.canvas.create_line(
            top_a[0],
            top_a[1],
            top_c[0],
            top_c[1],
            fill=self._shade_color(top_color, 18),
            width=1,
        )
        self.canvas.create_line(
            top_b[0],
            top_b[1],
            top_d[0],
            top_d[1],
            fill=self._shade_color(top_color, 8),
            width=1,
        )

    def _draw_legend(self, env_state, map_state, drones):
        """Draw explanatory legend and altitude key for the 3D scene."""
        panel_x = 20
        panel_y = 20
        panel_w = 360
        panel_h = 290

        self.canvas.create_rectangle(
            panel_x,
            panel_y,
            panel_x + panel_w,
            panel_y + panel_h,
            fill="#f8fbff",
            outline="#8ca3bd",
            width=2,
        )

        self.canvas.create_text(
            panel_x + 12,
            panel_y + 16,
            text="Legend: 3D Environment + Altitude",
            anchor="w",
            fill="#223145",
            font=("Arial", 11, "bold"),
        )

        entries = [
            ("#e5ecd6", "Unscanned ground tile"),
            ("#d8f0d0", "Scanned ground tile"),
            ("#f6c7c7", "Dynamic hazard zone"),
            ("#6f7685", "Obstacle block top"),
            ("#ff5959", "Found survivor marker"),
            ("#2f91ff", "Drone marker"),
        ]

        row_y = panel_y + 42
        for color, label in entries:
            self.canvas.create_rectangle(
                panel_x + 12,
                row_y,
                panel_x + 30,
                row_y + 14,
                fill=color,
                outline="#2f3f52",
                width=1,
            )
            self.canvas.create_text(
                panel_x + 38,
                row_y + 7,
                text=label,
                anchor="w",
                fill="#2d3f55",
                font=("Arial", 9),
            )
            row_y += 19

        # Altitude bands (obstacle colors in this frame)
        obstacle_heights = map_state.get("obstacle_heights")
        if obstacle_heights is not None:
            obs_min = float(obstacle_heights.min())
            obs_max = float(obstacle_heights.max())
        else:
            obs_min = 0.0
            obs_max = 0.0

        drone_altitudes = [float(d.get("z_altitude_m", 0.0)) for d in drones]
        if drone_altitudes:
            drone_min = min(drone_altitudes)
            drone_max = max(drone_altitudes)
        else:
            drone_min = 0.0
            drone_max = 0.0

        band_top = panel_y + 166
        self.canvas.create_text(
            panel_x + 12,
            band_top,
            text="Obstacle height bands (m):",
            anchor="w",
            fill="#223145",
            font=("Arial", 9, "bold"),
        )

        low_color = self._shade_color("#6f7685", 1)
        mid_color = self._shade_color("#6f7685", 5)
        high_color = self._shade_color("#6f7685", 10)
        band_x = panel_x + 12
        band_y = band_top + 10
        band_w = 28

        for idx, color in enumerate([low_color, mid_color, high_color]):
            x1 = band_x + (idx * (band_w + 6))
            self.canvas.create_rectangle(x1, band_y, x1 + band_w, band_y + 14, fill=color, outline="#2f3f52", width=1)

        self.canvas.create_text(
            panel_x + 112,
            band_y + 7,
            text=f"obs min/max: {obs_min:.1f}/{obs_max:.1f}",
            anchor="w",
            fill="#2d3f55",
            font=("Arial", 9),
        )
        self.canvas.create_text(
            panel_x + 12,
            band_y + 26,
            text=f"drone altitude min/max: {drone_min:.1f}/{drone_max:.1f}",
            anchor="w",
            fill="#2d3f55",
            font=("Arial", 9),
        )
        self.canvas.create_text(
            panel_x + 12,
            band_y + 43,
            text=(
                f"mode: {'dynamic' if env_state.get('dynamic', False) else 'static'}"
                f" | hazards: {env_state.get('active_hazard_cells', 0)}"
            ),
            anchor="w",
            fill="#2d3f55",
            font=("Arial", 9),
        )
        self.canvas.create_text(
            panel_x + 12,
            band_y + 60,
            text=f"view zoom: {self.view_scale:.2f}x",
            anchor="w",
            fill="#2d3f55",
            font=("Arial", 9),
        )
        self.canvas.create_text(
            panel_x + 12,
            band_y + 77,
            text=(
                f"rotation xyz: {self.view_rotation_x_deg:.0f}°, "
                f"{self.view_rotation_y_deg:.0f}°, {self.view_rotation_z_deg:.0f}°"
            ),
            anchor="w",
            fill="#2d3f55",
            font=("Arial", 9),
        )

    def draw_scene(self):
        self.canvas.delete("all")
        state = self.sim.get_full_state()
        map_state = state["map"]
        env_state = state.get("environment", {})

        scanned_cells = set(map_state["scanned_cells"])
        obstacle_cells = set(map_state["obstacles"])
        found_survivors = set(map_state["found_survivors"])
        hazard_cells = set(map_state.get("dynamic_hazard_cells", []))
        obstacle_heights = map_state.get("obstacle_heights")

        tile_order = []
        for x in range(GRID_WIDTH):
            for y in range(GRID_HEIGHT):
                sort_height = 0.0
                if obstacle_heights is not None and (x, y) in obstacle_cells:
                    sort_height = float(obstacle_heights[y][x]) * 0.32
                _, sort_y = self._iso(x + 0.5, y + 0.5, sort_height)
                tile_order.append((sort_y, x, y))

        tile_order.sort(key=lambda item: item[0])

        for _, x, y in tile_order:

                a, b, c, d = self._tile_poly(x, y, 0.0)
                if (x, y) in hazard_cells:
                    floor_color = "#f6c7c7"
                elif (x, y) in scanned_cells:
                    floor_color = "#d8f0d0"
                else:
                    floor_color = "#e5ecd6"

                self.canvas.create_polygon(
                    a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1],
                    fill=floor_color,
                    outline="#bcc8a7",
                    width=1,
                )

                if (x, y) in obstacle_cells:
                    h_m = float(obstacle_heights[y][x]) if obstacle_heights is not None else 12.0
                    self._draw_obstacle_block(x, y, h_m)

        for (sx, sy) in found_survivors:
            px, py = self._iso(sx + 0.5, sy + 0.5, 2.0)
            self.canvas.create_oval(px - 4, py - 4, px + 4, py + 4, fill="#ff5959", outline="#7a1414", width=2)

        drone_colors = ["#2f91ff", "#f59f28", "#8a53ff", "#2dbd58", "#e1469f"]
        for idx, drone in enumerate(state["drones"]):
            color = drone_colors[idx % len(drone_colors)]
            cx = drone["x"] + 0.5
            cy = drone["y"] + 0.5
            altitude = float(drone.get("z_altitude_m", 0.0))

            gx, gy = self._iso(cx, cy, 0.0)
            self.canvas.create_oval(gx - 3, gy - 2, gx + 3, gy + 2, fill="#6f6f6f", outline="")

            px, py = self._iso(cx, cy, altitude)
            self.canvas.create_oval(px - 6, py - 6, px + 6, py + 6, fill=color, outline="#1f1f1f", width=1)

            if drone.get("target"):
                tx, ty = drone["target"]
                tpx, tpy = self._iso(tx + 0.5, ty + 0.5, 0.0)
                self.canvas.create_line(px, py, tpx, tpy, fill=color, dash=(3, 2), width=1)

        total_batt = sum(d["battery"] for d in state["drones"])
        env_mode = "dynamic" if env_state.get("dynamic", False) else "static"
        survivor_found = len(map_state["found_survivors"])
        survivor_total = len(map_state["survivor_locations"])

        if obstacle_heights is not None:
            obs_min = float(obstacle_heights.min())
            obs_max = float(obstacle_heights.max())
        else:
            obs_min = 0.0
            obs_max = 0.0

        drone_altitudes = [float(d.get("z_altitude_m", 0.0)) for d in state["drones"]]
        if drone_altitudes:
            drone_min = min(drone_altitudes)
            drone_max = max(drone_altitudes)
        else:
            drone_min = 0.0
            drone_max = 0.0

        self.status_vars["profile"].set(env_state.get("environment_label", self.sim.environment_name))
        self.status_vars["mode"].set(env_mode)
        self.status_vars["step"].set(str(state["step"]))
        self.status_vars["coverage"].set(f"{state['coverage_percentage']:.1f}%")
        self.status_vars["survivors"].set(f"{survivor_found}/{survivor_total}")
        self.status_vars["wind"].set(f"{env_state.get('wind_factor', 0.0):.2f}")
        self.status_vars["visibility"].set(f"{env_state.get('visibility', 1.0):.2f}")
        self.status_vars["hazards"].set(str(env_state.get("active_hazard_cells", 0)))
        drone_count = max(1, len(state["drones"]))
        avg_batt = total_batt / drone_count
        self.status_vars["battery"].set(f"{avg_batt:.1f}% ({total_batt:.0f} total)")
        self.obs_height_range_var.set(f"Obstacle min/max: {obs_min:.1f} / {obs_max:.1f} m")
        self.drone_height_range_var.set(f"Drone altitude min/max: {drone_min:.1f} / {drone_max:.1f} m")
        self.coverage_progress_var.set(max(0.0, min(100.0, float(state["coverage_percentage"]))))
        self.battery_progress_var.set(max(0.0, min(100.0, float(avg_batt))))
        self._sync_rotation_ui_labels()

        self.info_label.config(
            text=(
                f"Env: {env_state.get('environment_label', self.sim.environment_name)} ({env_mode}) "
                f"| Step: {state['step']} | Coverage: {state['coverage_percentage']:.1f}% "
                f"| Survivors: {survivor_found}/{survivor_total} "
                f"| Wind: {env_state.get('wind_factor', 0.0):.2f} "
                f"| Visibility: {env_state.get('visibility', 1.0):.2f} "
                f"| Hazards: {env_state.get('active_hazard_cells', 0)} "
                f"| Zoom: {self.view_scale:.2f}x "
                f"| Rot XYZ: {self.view_rotation_x_deg:.0f}°, "
                f"{self.view_rotation_y_deg:.0f}°, {self.view_rotation_z_deg:.0f}° "
                f"| Swarm Battery: {total_batt:.0f}"
            )
        )

        new_detections = state.get("new_detections", [])
        if new_detections:
            latest = new_detections[-1]
            self.event_label.config(foreground="#8b2323")
            self.event_var.set(
                f"Latest detection: {latest['survivor_id']} at ({latest['x']}, {latest['y']}) "
                f"by {latest['detected_by']} (confidence {latest['confidence']:.1%})"
            )
        else:
            self.event_label.config(foreground="#35506b")
            self.event_var.set("No new detections this step")

    def _on_environment_change(self, _event):
        selected = self.environment_var.get()
        self.sim.set_environment(selected, seed=self.sim.seed)
        self.draw_scene()

    def update_sim(self):
        if self.sim.running:
            self.sim.step_simulation()
        self.draw_scene()
        self.after(FRAME_DELAY_MS, self.update_sim)


if __name__ == "__main__":
    simulation = DroneSwarmSimulation(seed=124, environment_name=DEFAULT_ENVIRONMENT)
    app = DroneVisualizer(simulation)
    app.mainloop()
