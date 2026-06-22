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
OMNI_INSTRUCTION = "SUB/ALPHA / OMNI 10 Hz masked harmonic. Stay still and let the sound play."
TEST_INSTRUCTION = "TEST immediate UCS effect. Stay still. Next epoch begins automatically."
HARMONIC_INSTRUCTION = "Harmonic/UCS therapeutic test. Stay still. Next epoch begins automatically."
SUB_BETA_INSTRUCTION = "SUB/BETA 25 Hz masked harmonic. Stay still and let the sound play."
SLEEP_SUPPORT_INSTRUCTION = "Sleep-support sinusoidal sweep. Stay still and let the sound play."
SWEEP_INSTRUCTION = "SWEEP bilateral masked harmonic. Stay still and let the sound play."
SWEEP_POST_INSTRUCTION = "Post-SWEEP eyes CLOSED comparison. Stay still."

CZ_SEQUENCE = [
    EpochSpec(1, "EO", EO_INSTRUCTION, 15),
    EpochSpec(2, "EO", EO_INSTRUCTION, 15),
    EpochSpec(3, "EC", EC_INSTRUCTION, 15),
    EpochSpec(4, "EO", EO_INSTRUCTION, 15),
    EpochSpec(5, "READ", READ_INSTRUCTION, 15),
    EpochSpec(6, "COUNT", COUNT_INSTRUCTION, 15),
    EpochSpec(7, "EO", EO_INSTRUCTION, 15),
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

SOUND_PROBE_LABELS = {
    "sub_alpha": "OMNI",
    "sub_beta": "SUB_BETA",
    "sleep_support": "SLEEP_SUPPORT",
    "sweep": "SWEEP",
    "sweep_post": "SWEEP_POST",
}

SOUND_PROBE_SEQUENCE_RULES = {
    "Cz": [
        ("sub_alpha", OMNI_INSTRUCTION),
    ],
    "O1": [
        ("sub_beta", SUB_BETA_INSTRUCTION),
        ("sleep_support", SLEEP_SUPPORT_INSTRUCTION),
    ],
    "F3": [
        ("sweep", SWEEP_INSTRUCTION),
        ("sweep_post", SWEEP_POST_INSTRUCTION),
    ],
    "F4": [
        ("sweep", SWEEP_INSTRUCTION),
        ("sweep_post", SWEEP_POST_INSTRUCTION),
    ],
}
