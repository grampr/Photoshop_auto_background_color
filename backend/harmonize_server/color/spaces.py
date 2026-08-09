import cv2
import numpy as np


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    normalized = rgb.astype(np.float32) / 255.0
    return cv2.cvtColor(normalized, cv2.COLOR_RGB2LAB)


def weighted_pixels(image: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    weights = mask.astype(np.float32).reshape(-1) / 255.0
    valid = weights > 0.03
    return image.reshape(-1, image.shape[-1])[valid], weights[valid]


def weighted_mean(values: np.ndarray, weights: np.ndarray) -> np.ndarray:
    return np.average(values, axis=0, weights=weights)


def weighted_percentile(values: np.ndarray, weights: np.ndarray, percentile: float) -> float:
    order = np.argsort(values)
    sorted_values = values[order]
    cumulative = np.cumsum(weights[order])
    target = percentile / 100.0 * cumulative[-1]
    return float(sorted_values[min(np.searchsorted(cumulative, target), len(sorted_values) - 1)])

