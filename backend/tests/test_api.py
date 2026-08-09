import numpy as np
from fastapi.testclient import TestClient

from harmonize_server.main import create_app
from harmonize_server.models.base import HarmonizationBackend
from harmonize_server.service import HarmonizationService
from conftest import encode_png


class FakeHarmonizer(HarmonizationBackend):
    name = "fake-harmonizer"

    def __init__(self, available=True):
        self._available = available
        self.device = "cpu"
        self.calls = 0

    @property
    def available(self):
        return self._available

    def harmonize(self, foreground, background, mask):
        self.calls += 1
        alpha = mask[:, :, None].astype(np.float32) / 255.0
        teacher = np.clip(foreground.astype(np.float32) * [0.82, 0.94, 1.12] - 5, 0, 255)
        return np.rint(teacher * alpha + background * (1 - alpha)).astype(np.uint8)


def client_for(backend):
    return TestClient(create_app(HarmonizationService(backend)))


def image_files(sample_images):
    foreground, background, mask = sample_images
    return {
        "foreground": ("foreground.png", encode_png(foreground), "image/png"),
        "background": ("background.png", encode_png(background), "image/png"),
        "mask": ("mask.png", encode_png(mask), "image/png"),
    }


def test_health_and_fast_json_response(sample_images):
    backend = FakeHarmonizer(available=False)
    client = client_for(backend)
    assert client.get("/v1/health").json() == {
        "status": "ok", "harmonizer_available": False, "device": "cpu"
    }
    response = client.post(
        "/v1/analyze", files=image_files(sample_images), data={"mode": "fast", "strength": "65"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["engine"] == "opencv"
    assert body["strength"] == 65
    assert "rgb_curve" in body["corrections"]


def test_raw_uxp_upload_contract_reads_alpha_mask(sample_images):
    foreground, background, mask = sample_images
    rgba_fg = np.dstack([foreground, mask])
    rgba_bg = np.dstack([background, np.full_like(mask, 255)])
    files = {
        "foreground": ("foreground.rgba", rgba_fg.tobytes(), "application/octet-stream"),
        "background": ("background.rgba", rgba_bg.tobytes(), "application/octet-stream"),
        "mask": ("mask.gray", mask.tobytes(), "application/octet-stream"),
    }
    response = client_for(FakeHarmonizer(False)).post(
        "/v1/analyze",
        files=files,
        data={"width": "96", "height": "96", "mode": "fast"},
    )
    assert response.status_code == 200
    assert response.json()["foreground_metrics"]["rgb_mean"][0] > 150


def test_ai_teacher_image_is_converted_to_corrections(sample_images):
    backend = FakeHarmonizer()
    response = client_for(backend).post(
        "/v1/analyze", files=image_files(sample_images), data={"mode": "ai", "strength": "100"}
    )
    assert response.status_code == 200
    assert backend.calls == 1
    body = response.json()
    assert body["engine"] == "fake-harmonizer"
    assert body["corrections"]["temperature"] != 0


def test_harmonize_returns_png(sample_images):
    response = client_for(FakeHarmonizer()).post(
        "/v1/harmonize", files=image_files(sample_images)
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content.startswith(b"\x89PNG")


def test_ai_mode_reports_missing_model(sample_images):
    response = client_for(FakeHarmonizer(False)).post(
        "/v1/analyze", files=image_files(sample_images), data={"mode": "ai"}
    )
    assert response.status_code == 503
    assert "not configured" in response.json()["detail"]
