import cv2
import numpy as np
import pytest


@pytest.fixture
def sample_images():
    height = width = 96
    y, x = np.mgrid[:height, :width]
    background = np.stack(
        [70 + x * 0.5, 95 + y * 0.45, 145 + x * 0.25], axis=2
    ).clip(0, 255).astype(np.uint8)
    foreground = np.empty((height, width, 3), np.uint8)
    foreground[y < 32] = [70, 48, 38]
    foreground[(y >= 32) & (y < 64)] = [190, 125, 90]
    foreground[y >= 64] = [242, 205, 168]
    mask = np.zeros((height, width), np.uint8)
    cv2.ellipse(mask, (48, 50), (24, 38), 0, 0, 360, 255, -1)
    return foreground, background, mask


def encode_png(image: np.ndarray) -> bytes:
    if image.ndim == 3:
        image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    success, encoded = cv2.imencode(".png", image)
    assert success
    return encoded.tobytes()
