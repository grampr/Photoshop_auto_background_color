"""Create a local Fast-vs-Harmonizer comparison from two user supplied photos.

The AI output is used only as a teacher. The exported demo renders the JSON
correction parameters that Photoshop turns into editable adjustment layers.
"""

from __future__ import annotations

import argparse
import io
import json
from pathlib import Path
import sys
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from harmonize_server.models.harmonizer import HarmonizerBackend  # noqa: E402
from harmonize_server.service import HarmonizationService  # noqa: E402


def _cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    scale = max(size[0] / image.width, size[1] / image.height)
    resized = image.resize(
        (round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS
    )
    left = (resized.width - size[0]) // 2
    top = (resized.height - size[1]) // 2
    return resized.crop((left, top, left + size[0], top + size[1]))


def _remove_background(image: Image.Image, model: str) -> Image.Image:
    from rembg import new_session, remove

    source = io.BytesIO()
    image.save(source, "PNG")
    result = remove(source.getvalue(), session=new_session(model), alpha_matting=True)
    return Image.open(io.BytesIO(result)).convert("RGBA")


def _place_foreground(
    cutout: Image.Image, size: tuple[int, int], height_fraction: float = 0.86
) -> tuple[np.ndarray, np.ndarray]:
    alpha = np.asarray(cutout.getchannel("A"))
    ys, xs = np.where(alpha > 8)
    if not len(xs):
        raise RuntimeError("Foreground removal produced an empty mask")
    cutout = cutout.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    target_h = round(size[1] * height_fraction)
    scale = target_h / cutout.height
    target_w = round(cutout.width * scale)
    if target_w > round(size[0] * 0.9):
        target_w = round(size[0] * 0.9)
        target_h = round(cutout.height * target_w / cutout.width)
    cutout = cutout.resize((target_w, target_h), Image.Resampling.LANCZOS)

    rgba = np.zeros((size[1], size[0], 4), dtype=np.uint8)
    x = (size[0] - target_w) // 2
    y = size[1] - target_h
    rgba[y : y + target_h, x : x + target_w] = np.asarray(cutout)
    return rgba[:, :, :3], rgba[:, :, 3]


def _analysis_size(
    foreground: np.ndarray, background: np.ndarray, mask: np.ndarray, maximum: int = 768
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    height, width = mask.shape
    scale = min(1.0, maximum / max(width, height))
    size = (round(width * scale), round(height * scale))
    return (
        cv2.resize(foreground, size, interpolation=cv2.INTER_AREA),
        cv2.resize(background, size, interpolation=cv2.INTER_AREA),
        cv2.resize(mask, size, interpolation=cv2.INTER_AREA),
    )


def _tone_weights(luminance: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    shadows = np.clip((0.55 - luminance) / 0.55, 0.0, 1.0) ** 1.5
    highlights = np.clip((luminance - 0.45) / 0.55, 0.0, 1.0) ** 1.5
    midtones = np.clip(1.0 - np.abs(luminance - 0.5) / 0.5, 0.0, 1.0)
    total = np.maximum(shadows + midtones + highlights, 1e-6)
    return shadows / total, midtones / total, highlights / total


def render_adjustments(image: np.ndarray, corrections: dict[str, Any]) -> np.ndarray:
    """Approximate the Photoshop adjustment-layer stack for README previews."""
    value = image.astype(np.float32) / 255.0
    value *= 2.0 ** float(corrections["exposure"])
    value = np.clip(value, 0.0, 1.0) ** (1.0 / max(float(corrections["gamma"]), 0.01))

    curve = np.asarray(corrections["rgb_curve"], dtype=np.float32) / 255.0
    value = np.interp(value, curve[:, 0], curve[:, 1]).astype(np.float32)
    contrast = 1.0 + float(corrections["contrast"]) / 100.0
    value = (value - 0.5) * contrast + 0.5

    hsv = cv2.cvtColor(np.clip(value, 0.0, 1.0), cv2.COLOR_RGB2HSV)
    hsv[:, :, 1] *= 1.0 + float(corrections["saturation"]) / 100.0
    value = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)

    temperature = float(corrections["temperature"])
    tint = float(corrections["tint"])
    value += np.asarray(
        [0.55 * temperature + 0.35 * tint, -0.45 * tint, -0.55 * temperature + 0.35 * tint],
        dtype=np.float32,
    ) / 255.0

    luminance = np.clip(value @ np.asarray([0.2126, 0.7152, 0.0722]), 0.0, 1.0)
    tone_weights = _tone_weights(luminance)
    for name, weight in zip(("shadows", "midtones", "highlights"), tone_weights):
        delta = np.asarray([corrections[name][channel] for channel in "rgb"], dtype=np.float32)
        value += weight[:, :, None] * delta[None, None, :] / 255.0
    return np.rint(np.clip(value, 0.0, 1.0) * 255.0).astype(np.uint8)


def _composite(foreground: np.ndarray, background: np.ndarray, mask: np.ndarray) -> np.ndarray:
    alpha = mask.astype(np.float32)[:, :, None] / 255.0
    return np.rint(foreground * alpha + background * (1.0 - alpha)).astype(np.uint8)


def _comparison(panels: list[tuple[str, np.ndarray]]) -> Image.Image:
    panel_size = (480, 320)
    label_height = 48
    result = Image.new("RGB", (panel_size[0] * len(panels), panel_size[1] + label_height), "#17191d")
    draw = ImageDraw.Draw(result)
    try:
        font = ImageFont.truetype("arial.ttf", 24)
    except OSError:
        font = ImageFont.load_default()
    for index, (label, panel) in enumerate(panels):
        preview = Image.fromarray(panel).resize(panel_size, Image.Resampling.LANCZOS)
        x = index * panel_size[0]
        result.paste(preview, (x, label_height))
        draw.text((x + 16, 11), label, fill="white", font=font)
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("foreground", type=Path)
    parser.add_argument("background", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "docs" / "images")
    parser.add_argument("--strength", type=float, default=70.0)
    parser.add_argument("--rembg-model", default="u2net")
    args = parser.parse_args()

    size = (1200, 800)
    background = np.asarray(_cover(Image.open(args.background).convert("RGB"), size))
    cutout = _remove_background(Image.open(args.foreground).convert("RGB"), args.rembg_model)
    foreground, mask = _place_foreground(cutout, size)
    analysis_fg, analysis_bg, analysis_mask = _analysis_size(foreground, background, mask)

    backend = HarmonizerBackend(ROOT / "vendor" / "Harmonizer", ROOT / "models" / "harmonizer.pth")
    service = HarmonizationService(backend)
    fast = service.analyze(analysis_fg, analysis_bg, analysis_mask, "fast", args.strength)
    ai = service.analyze(analysis_fg, analysis_bg, analysis_mask, "ai", args.strength)

    original = _composite(foreground, background, mask)
    fast_result = _composite(render_adjustments(foreground, fast["corrections"]), background, mask)
    ai_result = _composite(render_adjustments(foreground, ai["corrections"]), background, mask)

    args.output.mkdir(parents=True, exist_ok=True)
    Image.fromarray(original).save(args.output / "cat-sky-original.jpg", quality=92)
    Image.fromarray(fast_result).save(args.output / "cat-sky-fast.jpg", quality=92)
    Image.fromarray(ai_result).save(args.output / "cat-sky-ai.jpg", quality=92)
    Image.fromarray(mask).save(args.output / "cat-sky-mask.png")
    _comparison(
        [("Original composite", original), ("Fast / OpenCV", fast_result), ("AI / Harmonizer", ai_result)]
    ).save(args.output / "cat-sky-comparison.jpg", quality=92)
    (args.output / "cat-sky-corrections.json").write_text(
        json.dumps({"fast": fast, "ai": ai}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"device": ai["device"], "fast": fast["corrections"], "ai": ai["corrections"]}, indent=2))


if __name__ == "__main__":
    main()
