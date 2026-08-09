from typing import Literal, Optional

import cv2
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from harmonize_server.config import settings
from harmonize_server.schemas import AnalyzeResponse, HealthResponse
from harmonize_server.service import HarmonizationService
from harmonize_server.utils.images import decode_upload, normalize_inputs


def create_router(service: HarmonizationService) -> APIRouter:
    router = APIRouter()

    @router.get("/health", response_model=HealthResponse)
    async def health() -> dict:
        return {
            "status": "ok",
            "harmonizer_available": service.ai_backend.available,
            "device": getattr(service.ai_backend, "device", "cpu"),
        }

    async def read_inputs(
        foreground: UploadFile,
        background: UploadFile,
        mask: Optional[UploadFile],
        width: Optional[int],
        height: Optional[int],
        max_size: int,
    ):
        fg = await decode_upload(foreground, width=width, height=height, channels=4)
        bg = await decode_upload(background, width=width, height=height, channels=4)
        alpha = (
            await decode_upload(mask, width=width, height=height, channels=1)
            if mask is not None
            else None
        )
        return normalize_inputs(fg, bg, alpha, max_size)

    @router.post("/analyze", response_model=AnalyzeResponse)
    async def analyze(
        foreground: UploadFile = File(...),
        background: UploadFile = File(...),
        mask: Optional[UploadFile] = File(None),
        mode: Literal["fast", "balanced", "ai"] = Form("balanced"),
        strength: float = Form(70.0),
        max_size: int = Form(settings.analysis_max_size),
        width: Optional[int] = Form(None),
        height: Optional[int] = Form(None),
    ) -> dict:
        if not 0 <= strength <= 100:
            raise HTTPException(422, "Strength must be between 0 and 100")
        max_size = max(256, min(1024, max_size))
        fg, bg, alpha = await read_inputs(foreground, background, mask, width, height, max_size)
        try:
            return service.analyze(fg, bg, alpha, mode, strength)
        except RuntimeError as error:
            raise HTTPException(503, str(error)) from error

    @router.post("/harmonize")
    async def harmonize(
        foreground: UploadFile = File(...),
        background: UploadFile = File(...),
        mask: Optional[UploadFile] = File(None),
        max_size: int = Form(settings.analysis_max_size),
        width: Optional[int] = Form(None),
        height: Optional[int] = Form(None),
    ) -> Response:
        fg, bg, alpha = await read_inputs(
            foreground, background, mask, width, height, max(256, min(1024, max_size))
        )
        try:
            output = service.harmonize(fg, bg, alpha)
        except RuntimeError as error:
            raise HTTPException(503, str(error)) from error
        success, encoded = cv2.imencode(".png", cv2.cvtColor(output, cv2.COLOR_RGB2BGR))
        if not success:
            raise HTTPException(500, "Could not encode model output")
        return Response(encoded.tobytes(), media_type="image/png")

    return router

