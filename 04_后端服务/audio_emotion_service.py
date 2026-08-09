import base64
import io
import os
import wave

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

MODEL_IMPORT_ERROR = ""
TRANSFORMERS_READY = False

try:
    import torch
    from transformers import AutoFeatureExtractor, AutoModelForAudioClassification
    TRANSFORMERS_READY = True
except Exception as exc:  # pragma: no cover - startup fallback for broken local env
    torch = None
    AutoFeatureExtractor = None
    AutoModelForAudioClassification = None
    MODEL_IMPORT_ERROR = str(exc)


MODEL_ID = os.getenv("AUDIO_EMOTION_MODEL_ID", "superb/wav2vec2-base-superb-er")
PORT = int(os.getenv("AUDIO_EMOTION_PORT", "3011"))
DEVICE = "cuda" if TRANSFORMERS_READY and torch and torch.cuda.is_available() else "cpu"


class PredictRequest(BaseModel):
    audioBase64: str


feature_extractor = None
model = None

if TRANSFORMERS_READY:
    feature_extractor = AutoFeatureExtractor.from_pretrained(MODEL_ID)
    model = AutoModelForAudioClassification.from_pretrained(MODEL_ID, use_safetensors=True).to(DEVICE)
    model.eval()

app = FastAPI()


def decode_wav_bytes(audio_base64: str):
    try:
        wav_bytes = base64.b64decode(audio_base64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64 audio: {exc}") from exc

    try:
        with wave.open(io.BytesIO(wav_bytes), "rb") as wav_file:
            channels = wav_file.getnchannels()
            sample_width = wav_file.getsampwidth()
            sample_rate = wav_file.getframerate()
            frame_count = wav_file.getnframes()
            frames = wav_file.readframes(frame_count)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid wav audio: {exc}") from exc

    if sample_width == 1:
        samples = np.frombuffer(frames, dtype=np.uint8).astype(np.float32)
        samples = (samples - 128.0) / 128.0
    elif sample_width == 2:
        samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    elif sample_width == 4:
        samples = np.frombuffer(frames, dtype=np.int32).astype(np.float32) / 2147483648.0
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported sample width: {sample_width}")

    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)

    return samples, sample_rate


def resample_audio(samples: np.ndarray, source_rate: int, target_rate: int):
    if source_rate == target_rate:
        return samples

    duration = len(samples) / float(source_rate)
    target_length = max(int(duration * target_rate), 1)
    source_positions = np.linspace(0, len(samples) - 1, num=len(samples), dtype=np.float32)
    target_positions = np.linspace(0, len(samples) - 1, num=target_length, dtype=np.float32)
    return np.interp(target_positions, source_positions, samples).astype(np.float32)


def map_label(label: str):
    normalized = str(label or "").strip().lower()

    if normalized in {"hap", "happy", "joy", "surprise", "exc", "excited"}:
        return "happy"
    if normalized in {"ang", "anger", "angry", "frustrated", "fru"}:
        return "frustrated"
    if normalized in {"fear", "fearful", "anxious", "anxiety", "nervous"}:
        return "anxious"
    if normalized in {"sad", "sadness", "confused", "frustration"}:
        return "confused"
    if normalized in {"neu", "neutral", "calm"}:
        return "neutral"

    return "neutral"


def fallback_predict(samples: np.ndarray, sample_rate: int):
    if samples.size == 0:
        return {
            "label": "neutral",
            "confidence": 0.2,
            "rawLabel": "empty",
            "source": "voice",
            "model": f"{MODEL_ID}:fallback"
        }

    rms = float(np.sqrt(np.mean(np.square(samples)))) if samples.size else 0.0
    zcr = float(np.mean(np.abs(np.diff(np.signbit(samples))))) if samples.size > 1 else 0.0
    duration = len(samples) / float(sample_rate or 16000)

    scores = {
        "happy": max(0.0, rms * 1.25 + (0.22 - abs(zcr - 0.11))),
        "confused": max(0.0, (0.14 - min(rms, 0.14)) * 1.4 + (0.12 - min(zcr, 0.12))),
        "anxious": max(0.0, rms * 1.2 + zcr * 1.5),
        "frustrated": max(0.0, rms * 2.2 + zcr * 0.9),
        "neutral": 0.24,
    }
    label = max(scores, key=scores.get)
    total = sum(max(v, 0.0) for v in scores.values()) or 1.0
    confidence = max(scores[label], 0.0) / total

    return {
        "label": label,
        "confidence": float(max(0.28, min(0.82, 0.38 + confidence * 0.42))),
        "rawLabel": f"fallback:rms={rms:.4f},zcr={zcr:.4f},dur={duration:.2f}",
        "source": "voice",
        "model": f"{MODEL_ID}:fallback"
    }


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": MODEL_ID,
        "device": DEVICE,
        "mode": "pretrained" if TRANSFORMERS_READY else "fallback",
        "importError": MODEL_IMPORT_ERROR if not TRANSFORMERS_READY else ""
    }


@app.post("/predict")
def predict(payload: PredictRequest):
    samples, source_rate = decode_wav_bytes(payload.audioBase64)
    if not TRANSFORMERS_READY:
        return fallback_predict(samples, source_rate)

    target_rate = int(getattr(feature_extractor, "sampling_rate", 16000) or 16000)
    waveform = resample_audio(samples, source_rate, target_rate)

    if waveform.size < target_rate // 4:
        return {
            "label": "neutral",
            "confidence": 0.25,
            "rawLabel": "too_short",
            "source": "voice",
            "model": MODEL_ID
        }

    inputs = feature_extractor(
        waveform,
        sampling_rate=target_rate,
        return_tensors="pt",
        padding=True
    )
    inputs = {key: value.to(DEVICE) for key, value in inputs.items()}

    with torch.no_grad():
        logits = model(**inputs).logits
        probs = torch.softmax(logits, dim=-1)[0].detach().cpu().numpy()

    winner_index = int(np.argmax(probs))
    raw_label = model.config.id2label[winner_index]
    label = map_label(raw_label)

    return {
        "label": label,
        "confidence": float(probs[winner_index]),
        "rawLabel": raw_label,
        "source": "voice",
        "model": MODEL_ID
    }


if __name__ == "__main__":
    import uvicorn

    print(f"ready model={MODEL_ID} device={DEVICE} port={PORT}")
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
