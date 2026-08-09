import numpy as np

from harmonize_server.analysis import analyze_image, estimate_corrections, scale_corrections
from harmonize_server.analysis.corrections import corrections_from_metrics


def test_opencv_analysis_reports_required_metrics(sample_images):
    foreground, _, mask = sample_images
    metrics = analyze_image(foreground, mask)
    assert {
        "rgb_mean", "lab_mean", "lab_median", "histogram", "brightness",
        "black_level", "white_level", "contrast", "saturation",
        "temperature", "tint", "tones"
    } <= metrics.keys()
    assert set(metrics["tones"]) == {"shadows", "midtones", "highlights"}
    assert all(len(metrics["histogram"][channel]) == 32 for channel in "rgb")


def test_corrections_are_tone_aware_and_bounded(sample_images):
    foreground, background, mask = sample_images
    corrections, foreground_metrics, background_metrics = estimate_corrections(
        foreground, background, mask
    )
    assert foreground_metrics["lab_mean"] != background_metrics["lab_mean"]
    assert -2 <= corrections["exposure"] <= 2
    assert -25 <= corrections["contrast"] <= 25
    assert corrections["shadows"] != corrections["highlights"]
    assert corrections["rgb_curve"][0] == [0, 0]
    assert corrections["rgb_curve"][-1] == [255, 255]


def test_strength_scales_corrections_without_mutating_source(sample_images):
    foreground, background, mask = sample_images
    corrections, _, _ = estimate_corrections(foreground, background, mask)
    half = scale_corrections(corrections, 50)
    zero = scale_corrections(corrections, 0)
    assert np.isclose(half["exposure"], corrections["exposure"] * 0.5, atol=0.002)
    assert zero["exposure"] == 0
    assert zero["gamma"] == 1
    assert all(x == y for x, y in zero["rgb_curve"])


def test_foreground_identity_protection_caps_aggressive_color_matching():
    source = {
        "brightness": 50.0, "black_level": 10.0, "white_level": 90.0,
        "contrast": 20.0, "saturation": 80.0, "temperature": 40.0, "tint": 30.0,
        "tones": {tone: [180.0, 120.0, 60.0] for tone in ("shadows", "midtones", "highlights")},
    }
    target = {
        "brightness": 70.0, "black_level": 20.0, "white_level": 100.0,
        "contrast": 80.0, "saturation": 5.0, "temperature": -50.0, "tint": -40.0,
        "tones": {tone: [30.0, 180.0, 240.0] for tone in ("shadows", "midtones", "highlights")},
    }

    corrections = corrections_from_metrics(source, target)

    assert abs(corrections["contrast"]) <= 25
    assert abs(corrections["saturation"]) <= 20
    assert abs(corrections["temperature"]) <= 18
    assert abs(corrections["tint"]) <= 12
    assert all(abs(value) <= 18 for tone in corrections.values() if isinstance(tone, dict) for value in tone.values())
