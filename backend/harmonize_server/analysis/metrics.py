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
    return [round×^9îÚ$z{-®éÜj×ÒÒÒÒ“°¦Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚$DôÔ6öçFVçDÆöFVB"Â‚’Óâ°¢v—&TWfVçG2‚“°¢&Vg&W6„Æ–W'2‚“°¢†VÇF‚‚’çF†Vâ‚†–æfò’Óâ6WE7FGW2†&6¶VæB&VG’(	BG¶–æfòæFWf–6WÖ’’æ6F6‚‚‚’Óâ6WE7FGW2‚%7F'BF†RÆö6Â—F†öâ&6¶VæB"ÂG'VR’“°§Ò“° 