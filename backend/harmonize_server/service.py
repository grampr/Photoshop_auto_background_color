from typing import Any

import numpy as np

from harmonize_server.analysis.corrections import (
    blend_corrections,
    corrections_from_metrics,
    estimate_corrections,
    scale_corrections,
)
from harmonize_server.analysis.metrics import analyze_image
from harmonize_server.models.base import HarmonizationBackend


class HarmonizationService:
    def __init__(self, ai_backend: HarmonizationBackend):
        self.ai_backend = ai_backend

    def analyze(
        self,
        foreground: np.ndarray,
        background: np.ndarray,
        mask: np.ndarray,
        mode: str,
        strength: float,
    ) -> dict[str, Any]:
        classic, foreground_metrics, background_metrics = estimate_corrections(
            foreground, background, mask
        )
        corrections = classic
        engine = "opencv"
        warnings: list[str] = []

        if mode in ("balanced", "ai"):
            if self.ai_backend.available:
                output = self.ai_backend.harmonize(foreground, background, mask)
                ai_metrics = analyze_image(output, mask)
                ai_corrections = corrections_from_metrics(foreground_metrics, ai_metrics)
                weight = 0.55 if mode == "balanced" else 0.85
                corrections = blend_corrections(classic, ai_corrections, weight)
                engine = f"opencv+{self.ai_backend.name}" if mode == "balanced" else self.ai_backend.name
            elif mode == "ai":
                raise RuntimeError("AI mode requested but Harmonizer is not configured")
            else:
                warnings.append("Harmonizer unavailable; Balanced mode fell back to OpenCV")

        return {
            "mode": mode,
            "engine": engine,
            "device": getattr(self.ai_backend, "device", "cpu"),
            "strength": strength,
            "corrections": scale_corrections(corrections, strength),
            "foreground_metrics": foreground_metrics,
            "background_metrics": background_metrics,
            "warnings": warnings,
        }

    def harmonize(
        self, foreground: np.ndarray, background: np.ndarray, mask: np.ndarray
    ) -> np.ndarray:
        if not self.ai_backend.available:
            raise RuntimeError("Harmonizer is not configured")
        return self.ai_backend.harmonize(foreground, background, mask)

