from pathlib import Path
import sys
from typing import Optional

import numpy as np

from harmonize_server.models.base import HarmonizationBackend
from harmonize_server.utils.device import select_device


class HarmonizerBackend(HarmonizationBackend):
    """Adapter for the official ZHKKKe/Harmonizer checkout (not redistributed)."""

    name = "harmonizer"

    def __init__(self, repository: Path, weights: Path):
        self.repository = repository.resolve()
        self.weights = weights.resolve()
        self.device = select_device()
        self._model: Optional[object] = None

    @property
    def available(self) -> bool:
        try:
            import torch  # noqa: F401
        except ImportError:
            return False
        return (self.repository / "src" / "model").is_dir() and self.weights.is_file()

    def _load(self):
        if self._model is not None:
            return self._model
        if not self.available:
            raise RuntimeError(
                "Harmonizer is unavailable. Set HARMONIZER_REPO and HARMONIZER_WEIGHTS; see README."
            )
        import torch

        repository = str(self.repository)
        if repository not in sys.path:
            sys.path.insert(0, repository)
        from src import model as official_model

        harmonizer = official_model.Harmonizer().to(self.device)
        state = torch.load(str(self.weights), map_location=self.device, weights_only=True)
        harmonizer.load_state_dict(state, strict=True)
        harmonizer.eval()
        self._model = harmonizer
        return harmonizer

    def harmonize(
        self, foreground: np.ndarray, background: np.ndarray, mask: np.ndarray
    ) -> np.ndarray:
        import torch

        model = self._load()
        alpha = mask.astype(np.float32)[:, :, None] / 255.0
        composite = foreground.astype(np.float32) * alpha + background.astype(np.float32) * (1.0 - alpha)
        comp_tensor = torch.from_numpy(composite.transpose(2, 0, 1) / 255.0)[None].float().to(self.device)
        mask_tensor = torch.from_numpy(alpha.transpose(2, 0, 1))[None].float().to(self.device)
        with torch.inference_mode():
            arguments = model.predict_arguments(comp_tensor, mask_tensor)
            output = model.restore_image(comp_tensor, mask_tensor, arguments)[-1]
        rgb = output[0].detach().clamp(0, 1).cpu().numpy().transpose(1, 2, 0)
        return np.rint(rgb * 255.0).astype(np.uint8)
