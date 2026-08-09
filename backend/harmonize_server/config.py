from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True)
class Settings:
    analysis_max_size: int = 512
    harmonizer_repo: Path = Path(os.getenv("HARMONIZER_REPO", "vendor/Harmonizer"))
    harmonizer_weights: Path = Path(
        os.getenv("HARMONIZER_WEIGHTS", "models/harmonizer.pth")
    )


settings = Settings()

