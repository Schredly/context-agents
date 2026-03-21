"""Agent 1: Frame Intelligence — adaptive frame extraction with scene-change detection."""

import asyncio
import hashlib
import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class FrameInfo:
    index: int
    timestamp_sec: float
    image_bytes: bytes
    scene_id: int = 0
    is_unique: bool = True
    fingerprint: str = ""


def _frame_fingerprint(data: bytes, block_size: int = 8) -> str:
    """Cheap perceptual hash — average-hash over an 8x8 downscale."""
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(data)).convert("L").resize((block_size, block_size))
        pixels = list(img.getdata())
        avg = sum(pixels) / len(pixels)
        bits = "".join("1" if p > avg else "0" for p in pixels)
        return hex(int(bits, 2))
    except Exception:
        return hashlib.md5(data).hexdigest()[:16]


def _hamming(a: str, b: str) -> int:
    """Hamming distance between two hex-encoded hashes."""
    try:
        ai, bi = int(a, 16), int(b, 16)
        xor = ai ^ bi
        return bin(xor).count("1")
    except (ValueError, TypeError):
        return 64


async def extract_frames_adaptive(
    video_path: str,
    *,
    initial_interval: int = 2,
    max_frames: int = 40,
    similarity_threshold: int = 6,
) -> list[FrameInfo]:
    """Extract frames from video, then deduplicate by perceptual similarity.

    1. Extract dense frames (every `initial_interval` seconds, up to `max_frames`)
    2. Compute perceptual hash for each frame
    3. Deduplicate: skip frames whose hash is within `similarity_threshold` of the previous unique frame
    4. Assign scene IDs
    """
    with tempfile.TemporaryDirectory() as tmp:
        pattern = os.path.join(tmp, "frame_%04d.jpg")
        cmd = [
            "ffmpeg", "-i", video_path,
            "-vf", f"fps=1/{initial_interval}",
            "-frames:v", str(max_frames),
            "-q:v", "2",
            pattern,
        ]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            await proc.communicate()
        except FileNotFoundError:
            logger.error("ffmpeg not found")
            return []

        raw_frames: list[FrameInfo] = []
        idx = 0
        for fname in sorted(os.listdir(tmp)):
            if not fname.endswith(".jpg"):
                continue
            fpath = os.path.join(tmp, fname)
            with open(fpath, "rb") as f:
                data = f.read()
            fp = _frame_fingerprint(data)
            raw_frames.append(FrameInfo(
                index=idx,
                timestamp_sec=idx * initial_interval,
                image_bytes=data,
                fingerprint=fp,
            ))
            idx += 1

    if not raw_frames:
        return []

    # Deduplicate by perceptual hash similarity
    unique: list[FrameInfo] = [raw_frames[0]]
    unique[0].is_unique = True
    unique[0].scene_id = 0
    scene_counter = 0

    for frame in raw_frames[1:]:
        dist = _hamming(frame.fingerprint, unique[-1].fingerprint)
        if dist > similarity_threshold:
            scene_counter += 1
            frame.is_unique = True
            frame.scene_id = scene_counter
            unique.append(frame)
        else:
            frame.is_unique = False
            frame.scene_id = scene_counter

    logger.info(
        "[frame_intelligence] %d raw frames -> %d unique screens (%d scenes)",
        len(raw_frames), len(unique), scene_counter + 1,
    )
    return unique
