"""
vlm_service.py — CLIP + FAISS microservice for DroneShield VLM Person-Search.

Endpoints (Phase 1):
  POST /embed/image        — encode a JPEG file (multipart) → 512-float vector
  POST /embed/text         — encode a text string → 512-float vector
  POST /index              — add embedding + metadata to FAISS index
  GET  /search?q=&k=       — cosine similarity search, returns top-K detections
  GET  /detections         — list all indexed detections
  DELETE /index            — clear the FAISS index (demo reset)
  GET  /health             — liveness check

Endpoints (Phase 2 — continuous video stream):
  POST /stream/start       — start background VideoStreamReader
  POST /stream/stop        — stop the reader
  GET  /stream/status      — running state + stats
  GET  /stream/events      — Server-Sent Events for live frame notifications

Index persists to:
  data/vlm_index.faiss
  data/vlm_metadata.json
"""

import os
import sys
import json
import uuid
import base64
import io
import time
import logging
from pathlib import Path

import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image

# ─── Paths ───────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

DATA_DIR = BASE_DIR / "data"
DETECTIONS_DIR = DATA_DIR / "detections"
INDEX_FILE = DATA_DIR / "vlm_index.faiss"
META_FILE = DATA_DIR / "vlm_metadata.json"

DATA_DIR.mkdir(exist_ok=True)
DETECTIONS_DIR.mkdir(exist_ok=True)

# ─── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="[VLM] %(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("vlm_service")

# ─── CLIP + FAISS lazy-load ───────────────────────────────────────────────────
_model = None
_preprocess = None
_device = None
_index = None
_metadata: list[dict] = []
DIM = 512  # CLIP ViT-B/32 embedding dimension


def _load_clip():
    global _model, _preprocess, _device
    if _model is not None:
        return
    log.info("Loading CLIP ViT-B/32 (first call — may take ~10s) ...")
    import torch
    import clip as openai_clip

    _device = "cuda" if torch.cuda.is_available() else "cpu"
    log.info(f"Using device: {_device}")
    _model, _preprocess = openai_clip.load("ViT-B/32", device=_device)
    _model.eval()
    log.info("CLIP loaded ✓")


def _load_index():
    global _index, _metadata
    import faiss

    if INDEX_FILE.exists() and META_FILE.exists():
        try:
            log.info(f"Loading persisted FAISS index from {INDEX_FILE} ...")
            _index = faiss.read_index(str(INDEX_FILE))
            with open(META_FILE, "r") as f:
                _metadata = json.load(f)
            log.info(f"Loaded {_index.ntotal} vectors from disk ✓")
            return
        except Exception as e:
            log.warning(f"Corrupted or invalid FAISS index ({e}). Creating fresh index...")

    log.info("Creating fresh FAISS IndexFlatIP (cosine via normalize) ...")
    _index = faiss.IndexFlatIP(DIM)  # inner product on L2-normalised = cosine
    _metadata = []


def _persist_index():
    import faiss
    tmp_index = str(INDEX_FILE) + ".tmp"
    faiss.write_index(_index, tmp_index)
    os.replace(tmp_index, str(INDEX_FILE))
    tmp_meta = str(META_FILE) + ".tmp"
    with open(tmp_meta, "w") as f:
        json.dump(_metadata, f, indent=2)
    os.replace(tmp_meta, str(META_FILE))


def _encode_image(pil_img: Image.Image) -> np.ndarray:
    """Returns L2-normalised 512-d float32 numpy vector."""
    import torch
    import clip as openai_clip

    _load_clip()
    tensor = _preprocess(pil_img).unsqueeze(0).to(_device)
    with torch.no_grad():
        feat = _model.encode_image(tensor).cpu().float().numpy()
    feat /= np.linalg.norm(feat, axis=1, keepdims=True) + 1e-8
    return feat.astype(np.float32)


def _encode_text(text: str) -> np.ndarray:
    """Returns L2-normalised 512-d float32 numpy vector."""
    import torch
    import clip as openai_clip

    _load_clip()
    tokens = openai_clip.tokenize([text]).to(_device)
    with torch.no_grad():
        feat = _model.encode_text(tokens).cpu().float().numpy()
    feat /= np.linalg.norm(feat, axis=1, keepdims=True) + 1e-8
    return feat.astype(np.float32)


# ─── Flask App ────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)


@app.before_request
def ensure_loaded():
    """Ensure CLIP + FAISS are loaded before any request."""
    _load_clip()
    if _index is None:
        _load_index()


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return jsonify(
        {
            "ok": True,
            "indexed": len(_metadata),
            "device": _device or "not_loaded",
            "model": "ViT-B/32",
        }
    )


# ── Embed image ───────────────────────────────────────────────────────────────
@app.post("/embed/image")
def embed_image():
    """
    Accepts:
      - multipart file upload (field: 'file')
      - OR JSON body: { "base64": "<base64-encoded-jpeg>" }
    Returns: { "embedding": [...512 floats...] }
    """
    try:
        if request.files.get("file"):
            img_bytes = request.files["file"].read()
        elif request.is_json and request.json.get("base64"):
            img_bytes = base64.b64decode(request.json["base64"])
        else:
            return jsonify({"error": "No image provided"}), 400

        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        vec = _encode_image(img)
        return jsonify({"embedding": vec.flatten().tolist()})
    except Exception as e:
        log.exception("embed_image error")
        return jsonify({"error": str(e)}), 500


# ── Embed text ────────────────────────────────────────────────────────────────
@app.post("/embed/text")
def embed_text():
    """
    Body: { "text": "man in white t-shirt" }
    Returns: { "embedding": [...512 floats...] }
    """
    data = request.get_json(force=True)
    if not data or not data.get("text"):
        return jsonify({"error": "text field required"}), 400
    try:
        vec = _encode_text(data["text"])
        return jsonify({"embedding": vec.flatten().tolist()})
    except Exception as e:
        log.exception("embed_text error")
        return jsonify({"error": str(e)}), 500


# ── Add to index ──────────────────────────────────────────────────────────────
@app.post("/index")
def add_to_index():
    """
    Body:
    {
      "embedding": [...512 floats...],
      "metadata": {
        "id": "uuid",
        "drone_id": "drone-1",
        "timestamp": "ISO8601",
        "image_path": "data/detections/xxx.jpg",
        "lat": 12.97,
        "lon": 77.59,
        "altitude_m": 45,
        "heading_deg": 180,
        "confidence": 0.83
      }
    }
    """
    data = request.get_json(force=True)
    if not data or "embedding" not in data or "metadata" not in data:
        return jsonify({"error": "embedding and metadata required"}), 400
    try:
        vec = np.array(data["embedding"], dtype=np.float32).reshape(1, DIM)
        # Ensure L2-normalised
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        _index.add(vec)
        meta = data["metadata"]
        meta.setdefault("id", str(uuid.uuid4()))
        _metadata.append(meta)
        _persist_index()
        log.info(f"Indexed detection {meta['id']} (total: {_index.ntotal})")
        return jsonify({"ok": True, "id": meta["id"], "total": _index.ntotal})
    except Exception as e:
        log.exception("add_to_index error")
        return jsonify({"error": str(e)}), 500


# ── Similarity search ─────────────────────────────────────────────────────────
@app.get("/search")
def search():
    """
    Query params:
      q — natural-language description (required)
      k — number of results (default 5)
      threshold — minimum similarity 0-1 (default 0.0)
    Returns top-K detections with similarity score.
    """
    q = request.args.get("q", "").strip()
    k = min(int(request.args.get("k", 5)), 20)
    threshold = float(request.args.get("threshold", 0.0))
    start_time = request.args.get("start_time", "").strip()  # ISO8601
    end_time = request.args.get("end_time", "").strip()      # ISO8601

    if not q:
        return jsonify({"error": "q parameter required"}), 400
    if _index.ntotal == 0:
        return jsonify({"query": q, "results": [], "total_indexed": 0})

    try:
        vec = _encode_text(q)
        k_actual = min(k, _index.ntotal)
        scores, indices = _index.search(vec, k_actual)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(_metadata):
                continue
            sim = float(score)  # cosine similarity
            if sim < threshold:
                continue
            entry = dict(_metadata[idx])
            # Time-range filter (Phase 2)
            if start_time or end_time:
                ts = entry.get("timestamp", "")
                if start_time and ts < start_time:
                    continue
                if end_time and ts > end_time:
                    continue
            entry["similarity"] = round(sim, 4)
            results.append(entry)

        results.sort(key=lambda x: x["similarity"], reverse=True)
        log.info(f"Search '{q}' → {len(results)} results")
        return jsonify(
            {
                "query": q,
                "results": results,
                "total_indexed": _index.ntotal,
                "searched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
        )
    except Exception as e:
        log.exception("search error")
        return jsonify({"error": str(e)}), 500


# ── List all detections ───────────────────────────────────────────────────────
@app.get("/detections")
def list_detections():
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 50))
    start = (page - 1) * per_page
    end = start + per_page
    return jsonify(
        {
            "detections": _metadata[start:end],
            "total": len(_metadata),
            "page": page,
            "per_page": per_page,
        }
    )


# ── Reset / clear index ───────────────────────────────────────────────────────
@app.delete("/index")
def reset_index():
    global _index, _metadata
    import faiss
    _index = faiss.IndexFlatIP(DIM)
    _metadata = []
    _persist_index()
    # Remove detection images
    for f in DETECTIONS_DIR.glob("*.jpg"):
        f.unlink(missing_ok=True)
    log.info("Index cleared ✓")
    return jsonify({"ok": True, "message": "Index cleared"})


# ─── Phase 2: Video Stream Control + SSE ─────────────────────────────────────

@app.post("/stream/start")
def stream_start():
    """
    Start the background video stream reader.
    Body: { "source": "synthetic"|"path/to/file.mp4"|"rtsp://...",
            "sample_interval": 3.0,
            "drone_id": "drone-1" }
    """
    from drone_swarm.video_stream import start_stream

    data = request.get_json(force=True) or {}
    source = data.get("source", "synthetic")
    interval = float(data.get("sample_interval", 3.0))
    drone_id = data.get("drone_id", "drone-1")

    stream = start_stream(source=source, sample_interval=interval, drone_id=drone_id)
    log.info(f"Stream started via API: source={source}")
    return jsonify({"ok": True, "status": stream.status()})


@app.post("/stream/stop")
def stream_stop():
    from drone_swarm.video_stream import stop_stream
    stop_stream()
    return jsonify({"ok": True, "message": "Stream stopped"})


@app.get("/stream/status")
def stream_status():
    from drone_swarm.video_stream import get_active_stream
    stream = get_active_stream()
    if not stream:
        return jsonify({"running": False, "frames_processed": 0, "source": "",
                        "fps_estimate": 0, "current_lat": 0, "current_lon": 0,
                        "sample_interval_sec": 3, "drone_id": "", "error": None})
    return jsonify(stream.status())


@app.get("/stream/events")
def stream_events():
    """
    Server-Sent Events endpoint. Streams real-time frame-indexed events.
    The client tracks its own cursor index via the `?since=` query param.
    """
    import json as _json
    from flask import Response, stream_with_context
    from drone_swarm.video_stream import drain_sse_events

    since = int(request.args.get("since", 0))

    def generate():
        cursor = since
        # Send any already-queued events immediately
        events, cursor = drain_sse_events(cursor)
        for ev in events:
            yield f"data: {_json.dumps(ev)}\n\n"
        # Then poll for new ones every 1s for up to 30s (client should reconnect)
        for _ in range(30):
            time.sleep(1)
            events, cursor = drain_sse_events(cursor)
            for ev in events:
                yield f"data: {_json.dumps(ev)}\n\n"
            yield ": keep-alive\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/stream/yolo_feed")
def stream_yolo_feed():
    """
    Real-time MJPEG stream with YOLOv8 person detection bounding boxes and tactical HUD.
    Accepts ?source=path/to/video.mp4&conf=0.35
    """
    from flask import Response
    from drone_swarm.yolo_stream import generate_yolo_mjpeg, list_available_videos

    source = request.args.get("source")
    if not source or source == "synthetic":
        from drone_swarm.video_stream import get_active_stream
        active = get_active_stream()
        if active and active.source and active.source != "synthetic":
            source = active.source
        else:
            vids = list_available_videos()
            source = vids[0]["path"] if vids else "data/videos/test_video.mp4"

    conf = float(request.args.get("conf", 0.35))
    fps = int(request.args.get("fps", 24))

    return Response(
        generate_yolo_mjpeg(source=source, conf=conf, target_fps=fps),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )


@app.get("/stream/videos")
def stream_available_videos():
    """Returns list of video files available in data/ and data/videos/."""
    from drone_swarm.yolo_stream import list_available_videos
    return jsonify({"ok": True, "videos": list_available_videos()})


# ─── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("VLM_PORT", 5001))
    log.info(f"Starting VLM service on port {port} ...")
    # Pre-load on startup so first request is fast
    _load_clip()
    _load_index()
    app.run(host="0.0.0.0", port=port, debug=False)
