"""
WebSocket endpoints for real-time features.

/ws/logic-engine  — ping/pong to indicate backend is alive (drives the
                    "Logic Engine: Online/Offline" indicator in the UI)
"""
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.websocket("/ws/logic-engine")
async def logic_engine_ws(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Send a heartbeat every 10 seconds so the frontend knows we're alive
            await websocket.send_json({"status": "online"})
            await asyncio.sleep(10)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
