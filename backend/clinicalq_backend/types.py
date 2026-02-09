from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List

BandDict = Dict[str, float]
EventCallback = Callable[[Dict[str, Any]], None]


@dataclass(slots=True)
class EpochSpec:
    index: int
    label: str
    instruction: str
    seconds: int


@dataclass(slots=True)
class EpochCapture:
    sequence: str
    index: int
    label: str
    instruction: str
    seconds: int
    features: Dict[str, BandDict]


@dataclass(slots=True)
class MetricResult:
    location: str
    metric: str
    value: float
    normal_range: str
    status: str
    probe: str
    formula: str


@dataclass(slots=True)
class SessionResult:
    metadata: Dict[str, Any]
    metrics: List[MetricResult]
    summary: Dict[str, Any]
    derived: Dict[str, Any] = field(default_factory=dict)

