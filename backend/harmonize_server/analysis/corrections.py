from copy import deepcopy
import math
from typing import Any

import numpy as np

from .metrics import analyze_image, make_background_context_mask


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _tone_delta(source: list[float], target: list[float]) -> dict[str, float]:
    delta = np.asarray(target) - np.asarray(source)
    delta -= delta.mean() * 0.35  # keep color cast while suppressing pure exposure duplication
    return {channel: round(_clamp(float(value), -30, 30), 2) for channel, value in zip("rgb", delta)}


def _curve(source: dict[str, Any], target: dict[str, Any]) -> list[list[int]]:
    source_points = [source["black_level"], source["brightness"], source["white_level"]]
    target_points = [target["black_level"], target["brightness"], target["white_level"]]
    points = [[0, 0]]
    for x, y in zip(source_points, target_points):
        px = round(_clamp(x * 2.55, 1, 254))
        # Limit local curve movement; gross luminance is handled by Exposure.
        py = round(_clamp(px + (y - x) * 1.25, 0, 255))
        if px > points[-1][0]:
            points.append([px, max(points[-1][1], py)])
    points.append([255, 255])
    return points


def corrections_from_metrics(source: dict[str, Any], target: dict[str, Any]) -> dict[str, Any]:
    exposure = math.log2((target["brightness"] + 2.0) / (source["brightness"] + 2.0))
    contrast = (target["contrast"] - source["contrast"]) / max(source["contrast"], 10.0) * 50.0
    saturation = (target["saturation"] - source["saturation"]) / max(source["saturation"], 8.0) * 35.0
    gamma = _clamp(1.0 - exposure * 0.08, 0.75, 1.25)
    return {
        "exposure": round(_clamp(exposure, -2.0, 2.0), 3),
        "gamma": round(gamma, 3),
        "contrast": round(_clamp(contrast, -35.0, 35.0), 2),
        "saturation": round(_clamp(saturation, -35.0, 35.0), 2),
        "temperature": round(_clamp(target["temperature"] - source["temperature"], -30.0, 30.0), 2),
        "tint": round(_clamp(target["tint"] - source["tint"], -30.0, 30.0), 2),
        "shadows": _tone_delta(source["tones"]["shadows"], target["tones"]["shadows"]),
        "midtones": _tone_delta(source["tones"]["midtones"], target["tones"]["midtones"]),
        "highlights": _tone_delta(source["tones"]["highlights"], target["tones"]["highlights"]),
        "rgb_curve": _curve(source, target),
    }


def estimate_corrections(
    foreground: np.ndarray, background: np.ndarray, mask: np.ndarray
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    foreground_metrics = analyze_image(foreground, mask)
    background_mask = make_background_context_mask(mask)
    background_metrics = analyze_image(background, background_mask)
    return (
        corrections_from_metrics(foreground_metrics, background_metrics),
        foreground_metrics,
        background_metrics,
    )


def scale_corrections(corrections: dict[str, Any], strength: float) -> dict[str, Any]:
    factor = _clamp(strength, 0.0, 100.0) / 100.0
    result = deepcopy(corrections)
    for key in ("exposure", "contrast", "saturation", "temperature", "tint"):
        result[key] = round(result[key] * factor, 3)
    result["gamma"] = round(1.0 + (result["gamma"] - 1.0) * factor, 3)
    for tone in ("shadows", "midtones", "highlights"):
        result[tone] = {channel: round(value * factor, 2) for channel, value in result[tone].items()}
    result["rgb_curve"] = [[x, round(x + (y - x) * factor)] for x, y in result["rgb_curve"]]
    return result


def blend_corrections(classic: dict[str, Any], ai: dict[str, Any], ai_weight: float) -> dict[str, Any]:
    result = deepcopy(classic)
    for key in ("exposure", "gamma", "contrast", "saturation", "temperature", "tint"):
        result[key] = round(classic[key] * (1 - ai_weight) + ai[key] * ai_weight, 3)
    for tone in ("shadows", "midtones", "highlights"):
        for channel in "rgb":
            result[tone][channel] = round(
                classic[tone][channel] * (1 - ai_weight) + ai[tone][channel] * ai_weight, 2
            )
    # AI-derived curve is the most useful white-box approximation.
    result["rgb_curve"] = ai["rgb_curve"] if ai_weight >= 0.5 else classic["rgb_curve"]
    return result

