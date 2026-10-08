"""WebSocket — parse-progress y colaboracion (extraido de main.py, mejora #4 F1)."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["ws"])


# Global dict to store progress for WebSockets
_parse_progress = {}


@router.websocket("/ws/parse-progress/{session_id}")
async def parse_progress_ws(websocket: WebSocket, session_id: str):
    await websocket.accept()
    try:
        while True:
            progress = _parse_progress.get(session_id)
            if progress:
                await websocket.send_json(progress)
                if progress.get("status") == "complete":
                    break
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        pass


# Fase 8: Multi-player Collaboration Relay
class CollabManager:
    def __init__(self):
        # session_id -> list of connected websockets
        from typing import Dict, List
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = []
        self.active_connections[session_id].append(websocket)

    def disconnect(self, websocket: WebSocket, session_id: str):
        if session_id in self.active_connections:
            if websocket in self.active_connections[session_id]:
                self.active_connections[session_id].remove(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]

    async def broadcast_update(self, session_id: str, message: dict, sender: WebSocket = None):
        if session_id in self.active_connections:
            for connection in self.active_connections[session_id]:
                if connection != sender:
                    try:
                        await connection.send_json(message)
                    except Exception:
                        pass

collab_manager = CollabManager()

@router.websocket("/ws/collab/{session_id}")
async def collab_ws(websocket: WebSocket, session_id: str):
    await collab_manager.connect(websocket, session_id)
    try:
        while True:
            data = await websocket.receive_json()
            # The client sends an action (e.g. UPDATE_ELEMENT)
            # We broadcast it to other clients
            await collab_manager.broadcast_update(session_id, data, sender=websocket)
    except WebSocketDisconnect:
        collab_manager.disconnect(websocket, session_id)
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
