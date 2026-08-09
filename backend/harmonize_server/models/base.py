from abc import ABC, abstractmethod
from typing import Any

import numpy as np


class HarmonizationBackend(ABC):
    name: str

    @property
    @abstractmethod
    def available(self) -> bool:
        """Whether dependencies and model files are ready."""

    def analyze(self, foreground: np.ndarray, background: np.ndarray, mask: np.ndarray) -> dict[str, Any]:
        output = self.harmonize(foreground, background, mask)
        return {"output": output}

    @abstractmethod
    def harmonize(
        self, foreground: np.ndarray, background: np.ndarray, mask: np.ndarray
    ) -> np.ndarray:
        """Return the harmonized composite as RGB uint8."""

