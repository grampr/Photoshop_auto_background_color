import numpy as np

from harmonize_server.analysis import analyze_image, estimate_corrections, scale_corrections


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
    assert -35 <= corrections["contrast"] <= 35
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

