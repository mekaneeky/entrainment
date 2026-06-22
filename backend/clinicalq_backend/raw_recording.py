from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import numpy as np


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _enabled(config: Dict[str, Any]) -> bool:
    if config.get("record_raw_eeg") is False:
        return False
    return bool(config.get("record_raw_eeg") or config.get("raw_recording_path"))


class RawSessionRecorder:
    def __init__(self, path: Path, *, analysis: str, metadata: Dict[str, Any] | None = None):
        self.path = path
        self.analysis = analysis
        self.metadata = dict(metadata or {})
        self.started_at = _utc_now()
        self._arrays: Dict[str, np.ndarray] = {}
        self._epochs: list[Dict[str, Any]] = []

    @classmethod
    def from_config(cls, config: Dict[str, Any], *, analysis: str) -> "RawSessionRecorder | None":
        if not _enabled(config):
            return None
        raw_path = config.get("raw_recording_path")
        if not raw_path:
            return None
        return cls(
            Path(str(raw_path)),
            analysis=analysis,
            metadata={
                "profile": config.get("profile"),
                "tags": config.get("tags", []),
                "notes": config.get("notes"),
            },
        )

    def record_epoch(
        self,
        *,
        sequence: str,
        index: int,
        label: str,
        instruction: str,
        seconds: int | float,
        sampling_rate: int | float,
        signals: Dict[str, Any],
    ) -> None:
        signal_keys: Dict[str, str] = {}
        epoch_number = len(self._epochs) + 1
        for location, signal in sorted(signals.items()):
            key = f"epoch_{epoch_number:03d}_{_safe_key(location)}"
            self._arrays[key] = np.asarray(signal, dtype=float)
            signal_keys[location] = key

        self._epochs.append(
            {
                "sequence": sequence,
                "index": int(index),
                "label": label,
                "instruction": instruction,
                "seconds": float(seconds),
                "sampling_rate": float(sampling_rate),
                "signals": signal_keys,
            }
        )

    def close(self) -> Dict[str, Any] | None:
        if not self._epochs:
            return None
        self.path.parent.mkdir(parents=True, exist_ok=True)
        manifest = {
            "format": "clinicalq_raw_npz_v1",
            "analysis": self.analysis,
            "created_at": _utc_now(),
            "started_at": self.started_at,
            "metadata": self.metadata,
            "epochs": self._epochs,
        }
        np.savez_compressed(self.path, manifest=json.dumps(manifest), **self._arrays)
        return {
            "format": manifest["format"],
            "path": str(self.path.resolve()),
            "epoch_count": len(self._epochs),
            "signal_count": len(self._arrays),
        }


def _safe_key(value: str) -> str:
    return "".join(ch if ch.isalnum() else "_" for ch in str(value)).strip("_") or "signal"
