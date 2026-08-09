def select_device() -> str:
    """Choose CUDA, then Apple MPS, then CPU without requiring torch for Fast mode."""
    try:
        import torch
    except ImportError:
        return "cpu"

    if torch.cuda.is_available():
        return "cuda"
    mps = getattr(torch.backends, "mps", None)
    if mps is not None and mps.is_available():
        return "mps"
    return "cpu"

