from __future__ import annotations

from clinicalq_backend.types import EpochSpec

EO_INSTRUCTION = (
    "Eyes OPEN. Fixate on a point. Stay still, jaw relaxed, minimize blinking. Next epoch begins automatically."
)
EC_INSTRUCTION = (
    "Eyes CLOSED. Stay still, jaw relaxed, minimize swallowing/blinking. Next epoch begins automatically."
)
READ_INSTRUCTION = "READ silently (no lip movement). Stay still. Next epoch begins automatically."
COUNT_INSTRUCTION = "COUNT silently (serial counting). Stay still. Next epoch begins automatically."
OMNI_INSTRUCTION = "Apply OR/Omni/UCS sound as configured. Stay still. Next epoch begins automatically."
TEST_INSTRUCTION = "TEST immediate UCS effect. Stay still. Next epoch begins automatically."
HARMONIC_INSTRUCTION = "Harmonic/UCS therapeutic test. Stay still. Next epoch begins automatically."

CZ_SEQUENCE = [
    EpochSpec(1, "EO", EO_INSTRUCTION, 15),
    EpochSpec(2, "EO", EO_INSTRUCTION, 15),
    EpochSpec(3, "EC", EC_INSTRUCTION, 15),
    EpochSpec(4, "EO", EO_INSTRUCTION, 15),
    EpochSpec(5, "READ", READ_INSTRUCTION, 15),
    EpochSpec(6, "OMNI", OMNI_INSTRUCTION, 15),
    EpochSpec(7, "COUNT", COUNT_INSTRUCTION, 15),
    EpochSpec(8, "EO", EO_INSTRUCTION, 15),
    EpochSpec(9, "TEST", TEST_INSTRUCTION, 15),
    EpochSpec(10, "HARMONIC", HARMONIC_INSTRUCTION, 15),
]

O1_SEQUENCE = [
    EpochSpec(1, "EO", EO_INSTRUCTION, 15),
    EpochSpec(2, "EO", EO_INSTRUCTION, 15),
    EpochSpec(3, "EC", EC_INSTRUCTION, 15),
    EpochSpec(4, "EO", EO_INSTRUCTION, 15),
]

EC_SINGLE_SEQUENCE = [EpochSpec(1, "EC", EC_INSTRUCTION, 15)]

SIMULTANEOUS_EXTRA = [
    EpochSpec(11, "FRONTAL_EC", "Eyes CLOSED baseline for frontal channels. Stay still. Next epoch begins automatically.", 15)
]

SEQUENTIAL_ORDER = ["O1", "Cz", "Fz", "F3", "F4"]
