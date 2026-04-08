import tkinter as tk
from main import DroneSwarmSimulation
from config import GRID_WIDTH, GRID_HEIGHT

CELL_SIZE = 12

class DroneVisualizer(tk.Tk):
    def __init__(self, sim):
        super().__init__()
        self.title("Drone Swarm Visualization - Team A")
        self.sim = sim
        
        self.canvas = tk.Canvas(self, width=GRID_WIDTH * CELL_SIZE, height=GRID_HEIGHT * CELL_SIZE, bg="white")
        self.canvas.pack(padx=20, pady=20)
        
        # Info label
        self.info_label = tk.Label(self, text="Step: 0", font=("Arial", 14))
        self.info_label.pack(pady=(0, 10))
        
        # Draw initial state
        self.draw_grid()
        self.after(50, self.update_sim)
        
    def draw_grid(self):
        self.canvas.delete("all")
        state = self.sim.get_full_state()
        map_state = state["map"]
        
        # Draw scanned cells
        for (x, y) in map_state["scanned_cells"]:
            x1, y1 = x * CELL_SIZE, y * CELL_SIZE
            x2, y2 = x1 + CELL_SIZE, y1 + CELL_SIZE
            self.canvas.create_rectangle(x1, y1, x2, y2, fill="#e6ffe6", outline="#d9d9d9")
            
        # Draw obstacles
        for (x, y) in map_state["obstacles"]:
            x1, y1 = x * CELL_SIZE, y * CELL_SIZE
            x2, y2 = x1 + CELL_SIZE, y1 + CELL_SIZE
            self.canvas.create_rectangle(x1, y1, x2, y2, fill="#404040", outline="#262626")
            
        # Draw grid lines for unscanned/empty background
        for x in range(GRID_WIDTH):
            for y in range(GRID_HEIGHT):
                if (x, y) not in map_state["obstacles"] and (x, y) not in map_state["scanned_cells"]:
                    x1, y1 = x * CELL_SIZE, y * CELL_SIZE
                    x2, y2 = x1 + CELL_SIZE, y1 + CELL_SIZE
                    self.canvas.create_rectangle(x1, y1, x2, y2, outline="#f0f0f0")
                    
        # Draw found survivors
        for (x, y) in map_state["found_survivors"]:
            x1, y1 = x * CELL_SIZE, y * CELL_SIZE
            x2, y2 = x1 + CELL_SIZE, y1 + CELL_SIZE
            self.canvas.create_oval(x1 + 2, y1 + 2, x2 - 2, y2 - 2, fill="#ff4d4d", outline="darkred")

        # Draw drones
        colors = ["#3399ff", "#ff9933", "#9933ff", "#33cc33", "#ff33cc"]
        for idx, drone in enumerate(state["drones"]):
            x, y = drone["x"], drone["y"]
            x1, y1 = x * CELL_SIZE, y * CELL_SIZE
            x2, y2 = x1 + CELL_SIZE, y1 + CELL_SIZE
            color = colors[idx % len(colors)]
            self.canvas.create_oval(x1, y1, x2, y2, fill=color, outline="black", width=2)
            
            # Optional: draw target lines
            if drone["target"]:
                tx, ty = drone["target"]
                self.canvas.create_line(x1 + CELL_SIZE/2, y1 + CELL_SIZE/2, 
                                      tx * CELL_SIZE + CELL_SIZE/2, ty * CELL_SIZE + CELL_SIZE/2, 
                                      fill=color, dash=(2, 2))
                                      
        total_batt = sum([d['battery'] for d in state['drones']])
        self.info_label.config(text=f"Step: {state['step']} | Coverage: {state['coverage_percentage']:.1f}% | Survivors Found: {len(map_state['found_survivors'])}/{len(map_state['survivor_locations'])} | Avg Alt: {state['drones'][0]['z_altitude_m']}m | Swarm Battery: {total_batt}")

    def update_sim(self):
        if self.sim.running:
            self.sim.step_simulation()
            self.draw_grid()
            self.after(50, self.update_sim)  # Schedule next frame in 50ms
        else:
            self.info_label.config(text=self.info_label.cget("text") + " - DEMO COMPLETE")

if __name__ == "__main__":
    simulation = DroneSwarmSimulation(seed=124) # Random seed
    app = DroneVisualizer(simulation)
    app.mainloop()
