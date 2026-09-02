# archive/

These files were part of an earlier standalone Python simulation prototype that pre-dates the current Node.js architecture.

They are **NOT connected to server.js** and are preserved only for reference (particularly `visualizer.py` which has useful matplotlib/Pygame plotting logic that may be repurposed).

| File | What it is |
|---|---|
| `main.py` | Standalone Python physics simulation — runs drones + survivors independently of Node |
| `visualizer.py` | Standalone Pygame/matplotlib visualizer for the Python sim |

**Do not import from these files.** They use different coordinate systems and different data models.
They will be deleted at Phase 4 if no parts have been extracted.
