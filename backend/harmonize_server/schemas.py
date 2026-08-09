from typing import Any, Literal

from pydantic import BaseModel, Field


class AnalyzeResponse(BaseModel):
    mode: Literal["fast", "balanced", "ai"]
    engine: str
    device: str
    strength: float = Field(ge=0, le=100)
    corrections: dict[str, Any]
    foreground_metrics: dict[str, Any]
    background_metrics: dict[str, Any]
    warnings: list[str] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str
    harmonizer_available: bool
    device: str
