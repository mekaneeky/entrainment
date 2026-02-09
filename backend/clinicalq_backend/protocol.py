from __future__ import annotations

from clinicalq_backend.types import EpochSpec

CZ_SEQUENCE = [
    EpochSpec(1, "EO", "Eyes open, relaxed gaze.", 15),
    EpochSpec(2, "EO", "Eyes open, relaxed gaze.", 15),
    EpochSpec(3, "EC", "Eyes closed, still and relaxed.", 15),
    EpochSpec(4, "EO", "Eyes open, relaxed gaze.", 15),
    EpochSpec(5, "READ", "Cognitive challenge: read silently.", 15),
    EpochSpec(6, "OMNI", "Apply OR/Omni/UCS sound as configured.", 15),
    EpochSpec(7, "COUNT", "Cognitive challenge: serial counting.", 15),
    EpochSpec(8, "EO", "Eyes open, relaxed gaze.", 15),
    EpochSpec(9, "TEST", "Test immediate UCS effect.", 15),
    EpochSpec(10, "HARMONIC", "Harmonic/UCS therapeutic test.", 15),
]

O1_SEQUENCE = [
    EpochSpec(1, "EO", "Eyes open, relaxed gaze.", 15),
    EpochSpec(2, "EO", "Eyes open, relaxed gaze.", 15),
    EpochSpec(3, "EC", "Eyes closed, still and relaxed.", 15),
    EpochSpec(4, "EO", "Eyes open, relaxed gaze.", 15),
]

EC_SINGLE_SEQUENCE = [EpochSpec(1, "EC", "Eyes closed, still and relaxed.", 15)]

SIMULTANEOUS_EXTRA = [EpochSpec(11, "FRONTAL_EC", "Eyes closed baseline for frontal channels.", 15)]

SEQUENTIAL_ORDER = ["O1", "Cz", "Fz", "F3", "F4"]

