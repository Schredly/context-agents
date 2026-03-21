"""Agent 3: Audio/Speech — extract audio and transcribe with timestamps."""

import asyncio
import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class TranscriptSegment:
    start: float
    end: float
    text: str


@dataclass
class TranscriptResult:
    segments: list[TranscriptSegment] = field(default_factory=list)
    full_text: str = ""
    has_audio: bool = False
    duration_sec: float = 0.0
    language: str = ""


async def _has_audio_track(video_path: str) -> bool:
    """Check if the video file contains an audio stream."""
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "a",
        "-show_entries", "stream=codec_type",
        "-of", "csv=p=0",
        video_path,
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        stdout, _ = await proc.communicate()
        return b"audio" in stdout
    except FileNotFoundError:
        return False


async def _extract_audio_file(video_path: str, output_path: str) -> bool:
    """Extract audio track to a WAV file."""
    cmd = [
        "ffmpeg", "-i", video_path,
        "-vn", "-acodec", "pcm_s16le",
        "-ar", "16000", "-ac", "1",
        "-y", output_path,
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        _, stderr = await proc.communicate()
        return proc.returncode == 0
    except FileNotFoundError:
        logger.error("ffmpeg not found for audio extraction")
        return False


async def extract_and_transcribe(
    video_path: str,
    *,
    openai_api_key: str = "",
) -> TranscriptResult:
    """Extract audio from video and transcribe using OpenAI Whisper API.

    Falls back gracefully if no audio track or no API key.
    """
    result = TranscriptResult()

    if not await _has_audio_track(video_path):
        logger.info("[audio_speech] No audio track found in video")
        return result

    result.has_audio = True

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = tmp.name

    try:
        if not await _extract_audio_file(video_path, wav_path):
            logger.warning("[audio_speech] Failed to extract audio track")
            return result

        file_size = os.path.getsize(wav_path)
        if file_size < 1000:
            logger.info("[audio_speech] Audio track too short/empty")
            return result

        api_key = openai_api_key or os.environ.get("OPENAI_API_KEY", "")
        if not api_key:
            logger.info("[audio_speech] No OpenAI API key — skipping transcription")
            return result

        try:
            import httpx

            async with httpx.AsyncClient(timeout=120) as client:
                with open(wav_path, "rb") as audio_file:
                    resp = await client.post(
                        "https://api.openai.com/v1/audio/transcriptions",
                        headers={"Authorization": f"Bearer {api_key}"},
                        data={
                            "model": "whisper-1",
                            "response_format": "verbose_json",
                            "timestamp_granularities[]": "segment",
                        },
                        files={"file": ("audio.wav", audio_file, "audio/wav")},
                    )

                if resp.status_code != 200:
                    logger.warning("[audio_speech] Whisper API error: %s", resp.text[:200])
                    return result

                data = resp.json()
                result.full_text = data.get("text", "")
                result.language = data.get("language", "")
                result.duration_sec = data.get("duration", 0.0)

                for seg in data.get("segments", []):
                    result.segments.append(TranscriptSegment(
                        start=seg.get("start", 0.0),
                        end=seg.get("end", 0.0),
                        text=seg.get("text", "").strip(),
                    ))

                logger.info(
                    "[audio_speech] Transcribed %.1fs of audio, %d segments, language=%s",
                    result.duration_sec, len(result.segments), result.language,
                )

        except ImportError:
            logger.warning("[audio_speech] httpx not available for Whisper API call")
        except Exception as exc:
            logger.warning("[audio_speech] Whisper transcription failed: %s", exc)

    finally:
        if os.path.exists(wav_path):
            os.unlink(wav_path)

    return result


def correlate_transcript_to_frames(
    transcript: TranscriptResult,
    frame_timestamps: list[float],
) -> dict[int, list[str]]:
    """Map transcript segments to the nearest frame index by timestamp."""
    if not transcript.segments or not frame_timestamps:
        return {}

    correlation: dict[int, list[str]] = {}
    for seg in transcript.segments:
        mid = (seg.start + seg.end) / 2
        best_idx = 0
        best_dist = abs(mid - frame_timestamps[0])
        for i, ts in enumerate(frame_timestamps):
            dist = abs(mid - ts)
            if dist < best_dist:
                best_dist = dist
                best_idx = i
        correlation.setdefault(best_idx, []).append(seg.text)

    return correlation
