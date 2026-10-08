import os

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class APIKeyAuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, api_key: str = None):
        super().__init__(app)
        self.api_key = api_key or os.getenv("WORDAPA7_API_KEY")
        # Rutas exentas de autenticación
        self.exempt_paths = [
            "/api/health",
            "/api/version",
            "/api/provider-status",
            "/api/ai/health",
        ]

    async def dispatch(self, request: Request, call_next):
        if not self.api_key:
            # Si no hay API key configurada, permitir todo (modo desarrollo)
            return await call_next(request)

        # Solo proteger endpoints /api/
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        if any(request.url.path.startswith(p) for p in self.exempt_paths):
            return await call_next(request)

        # Validar header
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            # Fallback a X-API-Key si no viene en Authorization
            x_api_key = request.headers.get("X-API-Key")
            if x_api_key != self.api_key:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Unauthorized. Missing or invalid API Key."}
                )
        else:
            token = auth_header.split(" ")[1]
            if token != self.api_key:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Unauthorized. Invalid Bearer Token."}
                )

        return await call_next(request)
