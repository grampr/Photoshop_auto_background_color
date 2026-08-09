from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from harmonize_server.api.routes import create_router
from harmonize_server.config import settings
from harmonize_server.models.harmonizer import HarmonizerBackend
from harmonize_server.service import HarmonizationService


def create_app(service: Optional[HarmonizationService] = None) -> FastAPI:
    if service is None:
        backend = HarmonizerBackend(settings.harmonizer_repo, settings.harmonizer_weights)
        service = HarmonizationService(backend)
    app = FastAPI(title="Local Auto Harmonize", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    app.include_router(create_router(service), prefix="/v1")
    return app


app = create_app()
