from typing import Any

import cv2
import numpy as np

from harmonize_server.color.spaces import (
    rgb_to_lab,
    weighted_mean,
    weighted_percentile,
    weighted_pixels,
)


TONE_RANGES = {
    "shadows": (0.0, 35.0),
    "midtones": (35.0, 70.0),
    "highlights": (70.0, 101.0),
}


def _rounded(values: np.ndarray, digits: int = 3) -> list[float]:
    return [round(float(value), digits) for value in values]


def _histograms(rgb: np.ndarray, mask: np.ndarray) -> dict[str, list[float]]:
    result = {}
    for index, channel in enumerate("rgb"):
        hist = cv2.calcHist([rgb], [index], mask, [32], [0, 256]).reshape(-1)
        total = float(hist.sum()) or 1.0
        result[channel] = _rounded(hist / total, 6)
    return result


def _tone_means(rgb: np.ndarray, lab: np.ndarray, mask: np.ndarray) -> dict[str, list[float]]:
    result = {}
    all_pixels, all_weights = weighted_pixels(rgb, mask)
    fallback = weighted_mean(all_pixels, all_weights)
    for name, (low, high) in TONE_RANGES.items():
        tone_mask = np.where((lab[:, :, 0] >= low) & (lab[:, :, 0] < high), mask, 0).astype(np.uint8)
        pixels, weights = weighted_pixels(rgb, tone_mask)
        result[name] = _rounded(weighted_mean(pixels, weights) if len(pixels) else fallback)
    return result


def analyze_image(rgb: np.ndarray, mask: np.ndarray) -> dict[str, Any]:
    lab = rgb_to_lab(rgb)
    rgb_pixels, weights = weighted_pixels(rgb, mask)
    lab_pixels, _ = weighted_pixels(lab, mask)
    if not len(rgb_pixels):
        raise ValueError("Mask contains no usable pixels")

    luminance = lab_pixels[:, 0]
    hsv = cv2.cvtColor(rgb.astype(np.float32) / 255.0, cv2.COLOR_RGB2HSV)
    hsv_pixels, _ = weighted_pixels(hsv, mask)
    black = weighted_percentile(luminance, weights, 5)
    white = weighted_percentile(luminance, weights, 95)
    lab_mean = weighted_mean(lab_pixels, weights)

    return {
        "rgb_mean": _rounded(weighted_mean(rgb_pixels, weights)),
        "lab_mean": _rounded(lab_mean),
        "lab_median": _rounded(np.median(lab_pixels, axis=0)),
        "histogram": _histograms(rgb, mask),
        "brightness": round(float(weighted_mean(luminance[:, None], weights)[0]), 3),
        "black_level": round(black, 3),
        "white_level": round(white, 3),
        "contrast": round(white - black, 3),
        "saturation": round(float(weighted_mean(hsv_pixels[:, 1:2], weights)[0] * 100.0), 3),
        # Lab b* is a stable warm/cool proxy; the value is intentionally relative, not Kelvin.
        "temperature": round(float(lab_mean[2] * 2.0), 3),
        "tint": round(float(lab_mean[1] * 2.0), 3),
        "tones": _tone_means(rgb, lab, mask),
    }


def make_background_context_mask(foreground_mask: np.ndarray) -> np.ndarray:
    binary = np.where(foreground_mask > 16, 255, 0).astype(np.uint8)
    radius = max(3, round(min(binary.shape) * 0.08))
    size = radius * 2 + 1
    dilated = cv2.dilate(binary, np.ones((size, size), np.uint8))
    context = cv2.subtract(dilated, binary)
    if np.count_nonzero(context) < 64:
        context = cv2.bitwise_not(binary)
    if np.count_nonzero(context) < 64:
        context = np.full_like(binary, 255)
    return context
