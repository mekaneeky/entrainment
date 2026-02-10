from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Callable, Dict, Iterable

import numpy as np

TickCallback = Callable[[int], None]


@dataclass(slots=True)
class BoardRuntimeConfig:
    sampling_rate: int = 250
    fast_mode: bool = False


class BoardBase:
    def __init__(self, runtime: BoardRuntimeConfig):
        self.runtime = runtime
        self.sampling_rate = runtime.sampling_rate
        self.eeg_channels: list[int] = []

    def start(self) -> None:
        raise NotImplementedError

    def stop(self) -> None:
        raise NotImplementedError

    def flush(self) -> None:
        return

    def read_chunk(self, n_samples: int, label: str) -> Dict[int, np.ndarray]:
        raise NotImplementedError

    def read_epoch(
        self,
        seconds: int,
        label: str,
        on_tick: TickCallback | None = None,
    ) -> Dict[int, np.ndarray]:
        raise NotImplementedError


class SimulatedBoard(BoardBase):
    def __init__(self, runtime: BoardRuntimeConfig, channels: Iterable[int], seed: int = 42):
        super().__init__(runtime)
        self._rng = np.random.default_rng(seed)
        self._sample_cursor = 0
        self.eeg_channels = sorted(set(int(ch) for ch in channels))

    def start(self) -> None:
        return

    def stop(self) -> None:
        return

    def _condition_gains(self, label: str) -> tuple[float, float, float, float, float]:
        ec_like = label in {"EC", "FRONTAL_EC"}
        alpha_gain = 8.0 if ec_like else 4.5
        theta_gain = 5.0
        beta_gain = 3.4
        hibeta_gain = 1.4
        delta_gain = 0.8

        if label in {"READ", "COUNT"}:
            theta_gain += 1.3
            beta_gain -= 0.7
        if label == "OMNI":
            theta_gain -= 0.8
        if label in {"TEST", "HARMONIC"}:
            alpha_gain += 0.6
            beta_gain += 0.3

        return theta_gain, alpha_gain, beta_gain, hibeta_gain, delta_gain

    def _generate_channel(self, channel: int, n_samples: int, label: str) -> np.ndarray:
        idx = np.arange(n_samples, dtype=float) + self._sample_cursor
        t = idx / float(self.sampling_rate)
        theta_g, alpha_g, beta_g, hibeta_g, delta_g = self._condition_gains(label)

        ch_factor = 1.0 + (channel % 5) * 0.04
        theta = theta_g * np.sin(2.0 * math.pi * 5.2 * t + channel * 0.31)
        alpha = alpha_g * np.sin(2.0 * math.pi * 10.1 * t + channel * 0.22)
        beta = beta_g * np.sin(2.0 * math.pi * 20.4 * t + channel * 0.47)
        hibeta = hibeta_g * np.sin(2.0 * math.pi * 33.0 * t + channel * 0.61)
        delta = delta_g * np.sin(2.0 * math.pi * 2.0 * t + channel * 0.09)
        noise = self._rng.normal(0.0, 0.9, size=n_samples)
        return ch_factor * (theta + alpha + beta + hibeta + delta + noise)

    def read_epoch(
        self,
        seconds: int,
        label: str,
        on_tick: TickCallback | None = None,
    ) -> Dict[int, np.ndarray]:
        if seconds <= 0:
            seconds = 1

        if not self.runtime.fast_mode:
            for sec in range(seconds):
                time.sleep(1.0)
                if on_tick:
                    on_tick(seconds - sec - 1)
        elif on_tick:
            on_tick(0)

        n_samples = int(seconds * self.sampling_rate)
        data: Dict[int, np.ndarray] = {}
        for ch in self.eeg_channels:
            data[ch] = self._generate_channel(ch, n_samples, label)

        self._sample_cursor += n_samples
        return data

    def read_chunk(self, n_samples: int, label: str) -> Dict[int, np.ndarray]:
        if n_samples <= 0:
            return {}

        data: Dict[int, np.ndarray] = {}
        for ch in self.eeg_channels:
            data[ch] = self._generate_channel(ch, int(n_samples), label)

        self._sample_cursor += int(n_samples)
        return data


class BrainFlowBoard(BoardBase):
    PARAM_FIELDS = [
        "serial_port",
        "ip_port",
        "ip_protocol",
        "ip_address",
        "serial_number",
        "mac_address",
        "other_info",
        "timeout",
        "file",
        "master_board",
    ]

    def __init__(self, runtime: BoardRuntimeConfig, board_config: dict):
        super().__init__(runtime)
        try:
            from brainflow.board_shim import BoardIds, BoardShim, BrainFlowInputParams
        except Exception as exc:  # pragma: no cover
            raise RuntimeError(
                "BrainFlow is not installed. Install with: pip install 'clinicalq-backend[openbci]'"
            ) from exc

        self._BoardIds = BoardIds
        self._BoardShim = BoardShim
        self._BrainFlowInputParams = BrainFlowInputParams

        self.board_id = self._resolve_board_id(board_config.get("board_id", "cyton"))
        self.params = self._build_params(board_config)
        self.board = self._BoardShim(self.board_id, self.params)

    def _resolve_board_id(self, value: int | str) -> int:
        if isinstance(value, int):
            return value

        normalized = str(value).strip().lower()
        if normalized in {"cyton", "cyton_board"}:
            return int(self._BoardIds.CYTON_BOARD.value)
        if normalized in {"cyton_daisy", "cyton_daisy_board"}:
            return int(self._BoardIds.CYTON_DAISY_BOARD.value)
        if normalized in {"synthetic", "synthetic_board"}:
            return int(self._BoardIds.SYNTHETIC_BOARD.value)

        try:
            return int(normalized)
        except ValueError as exc:
            raise RuntimeError(f"Unsupported board_id value: {value}") from exc

    def _build_params(self, board_config: dict):
        params = self._BrainFlowInputParams()
        for field in self.PARAM_FIELDS:
            if field in board_config and board_config[field] not in (None, ""):
                setattr(params, field, board_config[field])
        return params

    def start(self) -> None:
        self.board.prepare_session()
        self.board.start_stream()
        self.sampling_rate = int(self._BoardShim.get_sampling_rate(self.board_id))
        self.eeg_channels = [int(ch) for ch in self._BoardShim.get_eeg_channels(self.board_id)]
        time.sleep(1.0)
        self.board.get_board_data()

    def flush(self) -> None:
        self.board.get_board_data()

    def stop(self) -> None:
        try:
            self.board.stop_stream()
        except Exception:
            pass
        try:
            self.board.release_session()
        except Exception:
            pass

    def read_epoch(
        self,
        seconds: int,
        label: str,
        on_tick: TickCallback | None = None,
    ) -> Dict[int, np.ndarray]:
        if seconds <= 0:
            seconds = 1

        for sec in range(seconds):
            time.sleep(1.0)
            if on_tick:
                on_tick(seconds - sec - 1)

        n_samples = int(seconds * self.sampling_rate)
        data = self.board.get_board_data()
        if data.size == 0:
            data = self.board.get_current_board_data(n_samples)

        out: Dict[int, np.ndarray] = {}
        for ch in self.eeg_channels:
            sig = np.asarray(data[ch], dtype=float)
            if sig.size >= n_samples:
                out[ch] = sig[-n_samples:]
            elif sig.size > 0:
                out[ch] = np.pad(sig, (n_samples - sig.size, 0), mode="edge")
            else:
                out[ch] = np.zeros(n_samples, dtype=float)
        return out

    def read_chunk(self, n_samples: int, label: str) -> Dict[int, np.ndarray]:
        data = self.board.get_board_data()
        if data.size == 0:
            return {}

        out: Dict[int, np.ndarray] = {}
        for ch in self.eeg_channels:
            sig = np.asarray(data[ch], dtype=float)
            out[ch] = sig
        return out


def create_board(config: dict) -> BoardBase:
    board_cfg = dict(config.get("board", {}))
    runtime = BoardRuntimeConfig(
        sampling_rate=int(config.get("sampling_rate", 250)),
        fast_mode=bool(config.get("fast_mode", False)),
    )

    use_synthetic = bool(board_cfg.get("use_synthetic", False))
    board_id = str(board_cfg.get("board_id", "cyton")).lower()
    if use_synthetic or board_id in {"synthetic", "synthetic_board"}:
        channels = board_cfg.get("available_channels") or list(range(1, 9))
        return SimulatedBoard(runtime=runtime, channels=channels, seed=int(board_cfg.get("seed", 42)))

    return BrainFlowBoard(runtime=runtime, board_config=board_cfg)
