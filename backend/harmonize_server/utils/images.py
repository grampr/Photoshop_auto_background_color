from typing import Optional

import cv2
import numpy as np
from fastapi import HTTPException, UploadFile


def resize_to_limit(image: np.ndarray, max_size: int, interpolation: int) -> np.ndarray:
    height, width = image.shape[:2]
    scale = min(1.0, max_size / max(height, width))
    if scale == 1.0:
        return image
    size = (max(1, round(width * scale)), max(1, round(height * scale)))
    return cv2.resize(image, size, interpolation=interpolation)


async def decode_upload(
    upload: UploadFile,
    *,
    width: Optional[int] = None,
    height: Optional[int] = None,
    channels: Optional[int] = None,
) -> np.ndarray:
    payload = await upload.read()
    content_type = (upload.content_type or "").lower()
    if content_type == "application/octet-stream":
        if not width or not height or not channels:
            raise HTTPException(422, "Raw uploads require width, height and channels")
        expected = width * height * channels
        if len(payload) != expected:
            raise HTTPException(422, f"Raw upload has {len(payload)} bytes; expected {expected}")
        return np.frombuffer(payload, np.uint8).reshape(height, width, channels).copy()

    image = cv2.imdecode(np.frombuffer(payload, np.uint8), cv2.IMREAD_UNCHANGED)
    if image is None:
        raise HTTPException(422, f"Cannot decode image: {upload.filename}")
    if image.ndim == 2:
        return image
    if image.shape[2] == 4:
        return cv2.cvtColor(image, cv2.COLOR_BGRA2RGBA)
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


def normalize_inputs(
    foreground: np.ndarray,
    background: np.ndarray,
    mask: Optional[np.ndarray],
    max_size: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if foreground.ndim != 3 or foreground.shape[2] not in (3, 4):
        raise HTTPException(422, "Foreground must be RGB or RGBA")
    if background.ndim != 3 or background.shape[2] not in (3, 4):
        raise HTTPException(422, "Background must be RGB or RGBA")

    if mask is None:
        mask = foreground[:, :, 3] if foreground.shape[2] == 4 else np.full(foreground.shape[:2], 255, np.uint8)
    elif mask.ndim == 3:
        if mask.shape[2] == 1:
            mask = mask[:, :, 0]
        elif mask.shape[2] == 4:
            mask = mask[:, :, 3]
        else:
            mask = cv2.cvtColor(mask[:, :, :3], cv2.COLOR_RGB2GRAY)

    foreground = foreground[:, :, :3]
    background = background[:, :, :3]
    if background.shape[:2] != foreground.shape[:2]:
        background = cv2.resize(background, (foreground.shape[1], foreground.shape[0]), interpolation=cv2.INTER_AREA)
    if mask.shape[:2] != foreground.shape[:2]:
        mask = cv2.resize(mask, (foreground.shape[1], foreground.shape[0]), interpolation=cv2.INTER_NEAREST)

    foreground = resize_to_limit(foreground, max_size, cv2.INTER_AREA)
    size = (foreground.shape[1], foreground.shape[0])
    background = cv2.resize(background, size, interpolation=cv2.INTER_AREA)
    mask = cv2.resize(mask, size, interpolation=cv2.INTER_NEAREST)
    mask = np.where(mask >= 8, mask, 0).astype(np.uint8)
    if not np.any(mask):
        raise HTTPException(422, "Foreground mask is empty")
    return foreground, background, mask
