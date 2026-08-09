import os
from pathlib import Path

import pytest

from harmonize_server.models.harmonizer import HarmonizerBackend


def test_adapter_is_unavailable_without_manually_licensed_assets(tmp_path):
    backend = HarmonizerBackend(tmp_path / "repo", tmp_path / "harmonizer.pth")
    assert not backend.available
    with pytest.raises((RuntimeError, ImportError)):
        backend.harmonize(None, None, None)


@pytest.mark.skipif(
    not (os.getenv("HARMONIZER_REPO") and os.getenv("HARMONIZER_WEIGHTS")),
    reason="Set licensed Harmonizer repo and weights paths for the real inference smoke test",
)
def test_real_harmonizer_inference(sample_images):
    foreground, background, mask = sample_images
    backend = HarmonizerBackend(
        Path(os.environ["HARMONIZER_REPO"]), Path(os.environ["HARMONIZER_WEIGHTS"])
    )
    output = backend.harmonize(foreground, background, mask)
    assert output.shape == foreground.shape
    assert output.dtype == foreground.dtype

