from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable, Sequence


NF_DIR = Path(r"C:\Users\HP\Documents\NF")
LOG_DIR = NF_DIR / "session_logs"


def _fmt(value: float) -> str:
    return f"{value:.6f}"


def _split_con(text: str) -> tuple[list[str], list[list[str]]]:
    lines = text.splitlines()
    end_positions = [i for i, line in enumerate(lines) if line.strip() == "end object"]
    if not end_positions:
        raise ValueError("No object terminator found")
    header_end = end_positions[0]
    header = lines[: header_end + 1]
    blocks: list[list[str]] = []
    start = header_end + 1
    for end in end_positions[1:]:
        blocks.append(lines[start : end + 1])
        start = end + 1
    return header, blocks


def _join_con(header: list[str], blocks: Sequence[Sequence[str]]) -> str:
    out: list[str] = []
    out.extend(header)
    for block in blocks:
        out.extend(block)
    return "\n".join(out) + "\n"


def _replace_objects_count(header: list[str], count: int) -> list[str]:
    updated = list(header)
    for idx, line in enumerate(updated):
        if line.startswith("objects="):
            updated[idx] = f"objects={count}"
            return updated
    raise ValueError("Missing objects count")


def _value_from(block: Sequence[str], key: str) -> str:
    prefix = f"{key}="
    for line in block:
        if line.startswith(prefix):
            return line[len(prefix) :]
    return ""


def _tag(block: Sequence[str]) -> str:
    return _value_from(block, "tag")


def _caption(block: Sequence[str]) -> str:
    return _value_from(block, "wndcaption")


def _add_link(block: Sequence[str], out_port: int, target_index: int, target_port: int) -> list[str]:
    link = f"linkport {out_port}-{target_index},{target_port}"
    if link in block:
        return list(block)
    updated = list(block)
    insert_at = len(updated) - 1
    updated.insert(insert_at, link)
    return updated


def _find_block_index(
    blocks: Sequence[Sequence[str]],
    *,
    tag: str | None = None,
    caption: str | None = None,
    expression: str | None = None,
    occurrence: int = 1,
) -> int:
    matches = []
    for idx, block in enumerate(blocks):
        if tag is not None and _tag(block) != tag:
            continue
        if caption is not None and _caption(block) != caption:
            continue
        if expression is not None and _value_from(block, "expression") != expression:
            continue
        matches.append(idx)
    if len(matches) < occurrence:
        raise ValueError(f"Could not find block tag={tag!r} caption={caption!r} expression={expression!r}")
    return matches[occurrence - 1]


def _set_all_thresholds_manual(blocks: Sequence[Sequence[str]]) -> list[list[str]]:
    out: list[list[str]] = []
    for block in blocks:
        updated = []
        is_threshold = _tag(block) == "THRESHOLD"
        for line in block:
            if is_threshold and line in {"adapt_lower_mode=2", "adapt_lower_mode=1"}:
                updated.append("adapt_lower_mode=0")
            elif is_threshold and line in {"adapt_upper_mode=2", "adapt_upper_mode=1"}:
                updated.append("adapt_upper_mode=0")
            else:
                updated.append(line)
        out.append(updated)
    return out


def _filewrite_block(
    *,
    x: int,
    y: int,
    labels: Sequence[str],
    filename: str,
    averaging: int = 250,
) -> list[str]:
    lines = [
        "next object=37",
        f"xpos={x}",
        f"ypos={y}",
        f"inputports={len(labels)}",
        "outputports=0",
        "tag=FILEWRITE",
    ]
    for idx, label in enumerate(labels, start=1):
        dim = "none" if label.endswith("_pass") or label in {"feedback", "reward"} else "uV"
        lines.extend(
            [
                f"inport{idx}desc={label}",
                f"inport{idx}dim={dim}",
                f"inport{idx}min=0.000000",
                f"inport{idx}max=100.000000",
                f"inport{idx}range=1",
            ]
        )
    lines.extend(
        [
            f"filename={filename}",
            "format=0",
            f"inports={len(labels)}",
            "append=0",
            f"averaging={averaging}",
            "autocreate=1",
            "add_date=1",
            "semicolon=0",
            f"headerline={','.join(labels)}",
            "end object",
        ]
    )
    return lines


def _add_recording_to_existing(
    source: Path,
    destination: Path,
    *,
    manual_thresholds: bool,
    labels: Sequence[str],
    sources: Sequence[tuple[dict[str, str], int]],
) -> None:
    header, blocks = _split_con(source.read_text(encoding="utf-8"))
    if manual_thresholds:
        blocks = _set_all_thresholds_manual(blocks)

    filewrite_index = len(blocks)
    for input_index, (selector, out_port) in enumerate(sources):
        block_index = _find_block_index(blocks, **selector)
        blocks[block_index] = _add_link(blocks[block_index], out_port, filewrite_index, input_index)

    blocks.append(
        _filewrite_block(
            x=980,
            y=40,
            labels=labels,
            filename=str(LOG_DIR / f"{destination.stem}.csv"),
        )
    )
    header = _replace_objects_count(header, len(blocks))
    destination.write_text(_join_con(header, blocks), encoding="utf-8")


def _header(objects: int) -> list[str]:
    return [
        f"objects={objects}",
        "main-top=33",
        "main-left=31",
        "main-right=1583",
        "main-bottom=865",
        "anim-top=2",
        "anim-left=0",
        "anim-right=386",
        "anim-bottom=388",
        "design-top=120",
        "design-left=160",
        "design-right=1260",
        "design-bottom=820",
        "tool-top=91",
        "tool-left=63",
        "tool-right=674",
        "tool-bottom=544",
        "showdesign=1",
        "hidestatus=0",
        "showtoolbox=-1",
        "autorun=0",
        "minimized=0",
        "comport=5",
        "bidirect=0",
        "connected=1",
        "devicetype=11",
        "baudtype=115200",
        "flow_control=0",
        "captfilename=none",
        "captfiletype=1",
        "captfileoffset=0",
        "dialoginterval=50",
        "drawinterval=10",
        "samplingrate=250",
        "end object",
    ]


def _eeg_block(links: Sequence[tuple[int, int, int]]) -> list[str]:
    lines = [
        "next object=0",
        "xpos=26",
        "ypos=51",
        "inputports=0",
        "outputports=11",
        "tag=EEG",
    ]
    for idx in range(1, 9):
        lines.extend(
            [
                f"outport{idx}desc=EEG Channel{idx}",
                f"outport{idx}dim=uV",
                f"outport{idx}min=-187500.000000",
                f"outport{idx}max=187500.000000",
                f"outport{idx}range=-1",
            ]
        )
    for idx, axis in enumerate(["X", "Y", "Z"], start=9):
        lines.extend(
            [
                f"outport{idx}desc=Acceleration {axis}",
                f"outport{idx}dim=g",
                f"outport{idx}min=-2.000000",
                f"outport{idx}max=2.000000",
                f"outport{idx}range=-1",
            ]
        )
    lines.append("resolution=16777216.000000")
    for out_port, target, in_port in links:
        lines.append(f"linkport {out_port}-{target},{in_port}")
    lines.append("end object")
    return lines


def _pre_filter_block(index_hint: int, *, x: int, y: int, tag: str, links: Sequence[tuple[int, int, int]]) -> list[str]:
    lines = [
        "next object=4",
        f"xpos={x}",
        f"ypos={y}",
        "inputports=1",
        "outputports=1",
        f"tag={tag}",
        "inport1desc=EEG Channel",
        "inport1dim=uV",
        "inport1min=-187500.000000",
        "inport1max=187500.000000",
        "inport1range=1",
        "outport1desc=EEG Channel",
        "outport1dim=uV",
        "outport1min=-187500.000000",
        "outport1max=187500.000000",
        "outport1range=0",
        "name=Bandpass",
        "type=7",
        "display-from=0",
        "display-to=50",
        "order=4",
        "par1=0.300000",
        "par2=45.000000",
    ]
    for out_port, target, in_port in links:
        lines.append(f"linkport {out_port}-{target},{in_port}")
    lines.append("end object")
    return lines


def _band_filter_block(
    *,
    x: int,
    y: int,
    tag: str,
    center: float,
    width: float,
    links: Sequence[tuple[int, int, int]],
) -> list[str]:
    lines = [
        "next object=9",
        f"xpos={x}",
        f"ypos={y}",
        "inputports=1",
        "outputports=1",
        f"tag={tag}",
        "inport1desc=EEG Channel",
        "inport1dim=uV",
        "inport1min=-187500.000000",
        "inport1max=187500.000000",
        "inport1range=1",
        "outport1desc=none",
        "outport1dim=uV",
        "outport1min=0.000000",
        "outport1max=100.000000",
        "outport1range=-1",
        "type=1",
        "order=4",
        f"center={_fmt(center)}",
        f"width={_fmt(width)}",
        "gain=100",
    ]
    for out_port, target, in_port in links:
        lines.append(f"linkport {out_port}-{target},{in_port}")
    lines.append("end object")
    return lines


def _threshold_block(
    *,
    x: int,
    y: int,
    caption: str,
    lower: float,
    upper: float,
    mode: str,
    links: Sequence[tuple[int, int, int]],
) -> list[str]:
    if mode == "manual":
        lower_mode = 0
        upper_mode = 0
    elif mode == "lower":
        lower_mode = 2
        upper_mode = 0
    elif mode == "upper":
        lower_mode = 0
        upper_mode = 2
    elif mode == "band":
        lower_mode = 2
        upper_mode = 2
    else:
        raise ValueError(f"Unknown threshold mode: {mode}")
    lines = [
        "next object=3",
        f"xpos={x}",
        f"ypos={y}",
        "inputports=1",
        "outputports=3",
        "tag=THRESHOLD",
        "inport1desc=none",
        "inport1dim=uV",
        "inport1min=0.000000",
        "inport1max=100.000000",
        "inport1range=1",
    ]
    for idx in range(1, 4):
        lines.extend(
            [
                f"outport{idx}desc=none",
                f"outport{idx}dim=uV",
                f"outport{idx}min=0.000000",
                f"outport{idx}max=100.000000",
                f"outport{idx}range=0",
            ]
        )
    lines.extend(
        [
            "play_interval=0",
            "interval_len=256",
            "gain=100",
            f"from-input={_fmt(lower)}",
            f"to-input={_fmt(upper)}",
            "and/or=1",
            "show-meter=1",
            "only-rising=0",
            "only-falling=0",
            "baseline=0",
            "color=6553600.000000",
            "bkcol=16777215.000000",
            "fontcol=0.000000",
            "fontbkcol=16777215.000000",
            f"top={max(0, y)}",
            f"left={x + 400}",
            f"right={x + 536}",
            f"bottom={max(0, y) + 380}",
            "adapt_lower_limit=25",
            "adapt_upper_limit=70",
            f"adapt_lower_mode={lower_mode}",
            f"adapt_upper_mode={upper_mode}",
            "adaptinterval=7680",
            "barsize=30",
            "fontsize=10",
            f"wndcaption={caption}",
            "truemode=1",
            "falsemode=1",
            "numerictruevalue=1",
            "numericfalsevalue=0",
        ]
    )
    for out_port, target, in_port in links:
        lines.append(f"linkport {out_port}-{target},{in_port}")
    lines.append("end object")
    return lines


def _constant_block(*, x: int, y: int, links: Sequence[tuple[int, int, int]], value: float = 1.0) -> list[str]:
    lines = [
        "next object=33",
        f"xpos={x}",
        f"ypos={y}",
        "inputports=0",
        "outputports=1",
        "tag=CONSTANT",
        "outport1desc=Constant",
        "outport1dim=none",
        "outport1min=-1000.000000",
        "outport1max=1000.000000",
        "outport1range=-1",
        f"value={_fmt(value)}",
    ]
    for out_port, target, in_port in links:
        lines.append(f"linkport {out_port}-{target},{in_port}")
    lines.append("end object")
    return lines


def _expression_block(
    *,
    x: int,
    y: int,
    tag: str,
    expression: str,
    inputports: int,
    links: Sequence[tuple[int, int, int]],
    in_min: float = 0.0,
    in_max: float = 100.0,
    out_min: float = 0.0,
    out_max: float = 100.0,
) -> list[str]:
    lines = [
        "next object=16",
        f"xpos={x}",
        f"ypos={y}",
        f"inputports={inputports}",
        "outputports=1",
        f"tag={tag}",
    ]
    for idx in range(1, inputports + 1):
        lines.extend(
            [
                f"inport{idx}desc=none",
                f"inport{idx}dim=uV",
                f"inport{idx}min={_fmt(in_min)}",
                f"inport{idx}max={_fmt(in_max)}",
                f"inport{idx}range=1",
            ]
        )
    lines.extend(
        [
            "outport1desc=none",
            "outport1dim=uV",
            f"outport1min={_fmt(out_min)}",
            f"outport1max={_fmt(out_max)}",
            "outport1range=0",
            f"expression={expression}",
        ]
    )
    for out_port, target, in_port in links:
        lines.append(f"linkport {out_port}-{target},{in_port}")
    lines.append("end object")
    return lines


def _sound_block(*, x: int, y: int, wav: str) -> list[str]:
    return [
        "next object=11",
        f"xpos={x}",
        f"ypos={y}",
        "inputports=3",
        "outputports=0",
        "tag=SOUND",
        "inport1desc=Constant",
        "inport1dim=none",
        "inport1min=-1000.000000",
        "inport1max=1000.000000",
        "inport1range=1",
        "inport2desc=none",
        "inport2dim=uV",
        "inport2min=0.000000",
        "inport2max=100.000000",
        "inport2range=1",
        "inport3desc=none",
        "inport3dim=none",
        "inport3min=-1.000000",
        "inport3max=1.000000",
        "inport3range=1",
        "bufsize=2048",
        f"filename={wav}",
        "repeatinterval=0",
        "onchangeonly=0",
        "mute=0",
        "volumeinputfrom=0.000000",
        "volumeinputto=100.000000",
        "volumefrom=0",
        "volumeto=128",
        "speedcenter=0.000000",
        "speedfactor=3.072000",
        "pitchrange=2",
        "reverse=0",
        "end object",
    ]


def _particles_block(*, x: int, y: int) -> list[str]:
    return [
        "next object=5",
        f"xpos={x}",
        f"ypos={y}",
        "inputports=2",
        "outputports=0",
        "tag=PARTICLES",
        "inport1desc=none",
        "inport1dim=uV",
        "inport1min=0.000000",
        "inport1max=100.000000",
        "inport1range=1",
        "inport2desc=none",
        "inport2dim=none",
        "inport2min=-1.000000",
        "inport2max=1.000000",
        "inport2range=1",
        "mute=0",
        "palette-file=none",
        "number of particles-min=1.000000",
        "number of particles-max=500.000000",
        "number of particles-value=0.000000",
        "number of particles-remote=1",
        "generation interval-min=0.000000",
        "generation interval-max=100.000000",
        "generation interval-value=30.000000",
        "generation interval-remote=0",
        "slowdown-min=10.000000",
        "slowdown-max=3000.000000",
        "slowdown-value=400.000000",
        "slowdown-remote=0",
        "color-min=0.000000",
        "color-max=127.000000",
        "color-value=512.000000",
        "color-remote=0",
        "x-position-min=-3.000000",
        "x-position-max=3.000000",
        "x-position-value=512.000000",
        "x-position-remote=0",
        "y-position-min=-3.000000",
        "y-position-max=3.000000",
        "y-position-value=512.000000",
        "y-position-remote=0",
        "z-position-min=-50.000000",
        "z-position-max=10.000000",
        "z-position-value=512.000000",
        "z-position-remote=0",
        "x-speed-min=-300.000000",
        "x-speed-max=300.000000",
        "x-speed-value=512.000000",
        "x-speed-remote=0",
        "y-speed-min=-300.000000",
        "y-speed-max=300.000000",
        "y-speed-value=512.000000",
        "y-speed-remote=0",
        "z-speed-min=-300.000000",
        "z-speed-max=300.000000",
        "z-speed-value=512.000000",
        "z-speed-remote=0",
        "x-gravity-min=-5.000000",
        "x-gravity-max=5.000000",
        "x-gravity-value=512.000000",
        "x-gravity-remote=0",
        "y-gravity-min=-5.000000",
        "y-gravity-max=5.000000",
        "y-gravity-value=512.000000",
        "y-gravity-remote=0",
        "z-gravity-min=-5.000000",
        "z-gravity-max=5.000000",
        "z-gravity-value=512.000000",
        "z-gravity-remote=0",
        "life-span-min=0.000000",
        "life-span-max=10.000000",
        "life-span-value=70.000000",
        "life-span-remote=0",
        "randomizer-min=0.000000",
        "randomizer-max=10.000000",
        "randomizer-value=0.000000",
        "randomizer-remote=1",
        "end object",
    ]


def _counter_block(*, x: int, y: int, caption: str) -> list[str]:
    return [
        "next object=35",
        f"xpos={x}",
        f"ypos={y}",
        "inputports=2",
        "outputports=1",
        "tag=COUNTER",
        "inport1desc=none",
        "inport1dim=uV",
        "inport1min=0.000000",
        "inport1max=100.000000",
        "inport1range=1",
        "inport2desc=none",
        "inport2dim=none",
        "inport2min=-1.000000",
        "inport2max=1.000000",
        "inport2range=1",
        "outport1desc=none",
        "outport1dim=none",
        "outport1min=-1.000000",
        "outport1max=1.000000",
        "outport1range=0",
        "mode=2",
        "coutnervalue=0.000000",
        "resetvalue=0.000000",
        "showcounter=1",
        "fontsize=25",
        "fontcolor=255.000000",
        "bkcolor=0.000000",
        f"top={y + 120}",
        f"left={x + 450}",
        f"right={x + 650}",
        f"bottom={y + 370}",
        "integer=1955627752",
        f"wndcaption={caption}",
        "digits=2",
        "timeformat=0",
        "end object",
    ]


def _oscii_block(*, x: int, y: int, inputports: int = 2) -> list[str]:
    lines = [
        "next object=6",
        f"xpos={x}",
        f"ypos={y}",
        f"inputports={inputports}",
        "outputports=0",
        "tag=OSCI",
    ]
    for idx in range(1, inputports + 1):
        lines.extend(
            [
                f"inport{idx}desc=none",
                f"inport{idx}dim=uV",
                f"inport{idx}min=0.000000",
                f"inport{idx}max=100.000000",
                f"inport{idx}range=1",
            ]
        )
    lines.extend(
        [
            "grid=1",
            "line=1",
            "gain=100",
            "seconds=5",
            "top=303",
            "left=278",
            "right=1303",
            "bottom=543",
            "drawinterval=50",
            "within=1",
            "group=1",
            "gradual=0",
            "wndcaption=Oscilloscope",
            "showgroupsignal=-1",
            "savebitmap=0",
            "add_date=0",
            "saveatend=0",
            "oscifilename=oscigraph",
            "background=16777215.000000",
            "gridcol=6553600.000000",
            "captcol=9856100.000000",
        ]
    )
    for idx in range(1, inputports + 1):
        lines.extend([f"signal{idx}=150.000000", f"sigsize{idx}=1"])
    lines.append("end object")
    return lines


def _write_protocol(path: Path, blocks: Sequence[Sequence[str]]) -> None:
    path.write_text(_join_con(_header(len(blocks)), blocks), encoding="utf-8")


def _threshold_mode(auto: bool, kind: str) -> str:
    if not auto:
        return "manual"
    return kind


def _o1_theta_beta_protocol(path: Path, *, auto: bool) -> None:
    # Object indices are fixed by append order below.
    blocks: list[list[str]] = []
    blocks.append(_eeg_block([(0, 1, 0)]))
    blocks.append(_pre_filter_block(1, x=96, y=32, tag="O1 input bandpass", links=[(0, 2, 0), (0, 3, 0)]))
    blocks.append(_band_filter_block(x=185, y=22, tag="O1 theta 4-7", center=5.5, width=1.5, links=[(0, 4, 0), (0, 11, 0), (0, 12, 0)]))
    blocks.append(_band_filter_block(x=185, y=120, tag="O1 beta 13-30", center=21.5, width=8.5, links=[(0, 4, 1), (0, 11, 1), (0, 12, 1)]))
    blocks.append(_expression_block(x=330, y=60, tag="O1 theta/beta", expression="A/B", inputports=2, links=[(0, 5, 0), (0, 11, 2), (0, 12, 2)], out_max=10.0))
    blocks.append(_threshold_block(x=470, y=52, caption="O1 T/B below target", lower=0.0, upper=2.2, mode=_threshold_mode(auto, "upper"), links=[(0, 6, 0), (0, 8, 0), (0, 12, 3)]))
    blocks.append(_expression_block(x=640, y=64, tag="feedback", expression="A*100", inputports=1, links=[(0, 9, 1), (0, 10, 0), (0, 12, 4)]))
    blocks.append(_constant_block(x=650, y=10, links=[(0, 9, 0), (0, 8, 1), (0, 10, 1)]))
    blocks.append(_counter_block(x=710, y=85, caption="T/B pass"))
    blocks.append(_sound_block(x=810, y=42, wav=str(NF_DIR / "classical.wav")))
    blocks.append(_counter_block(x=710, y=190, caption="Feedback"))
    blocks.append(_oscii_block(x=372, y=190, inputports=3))
    blocks.append(_filewrite_block(x=1000, y=35, labels=["theta", "beta", "theta_beta", "ratio_pass", "feedback"], filename=str(LOG_DIR / f"{path.stem}.csv")))
    _write_protocol(path, blocks)


def _f3f4_theta_alpha_protocol(path: Path, *, auto: bool) -> None:
    blocks: list[list[str]] = []
    blocks.append(_eeg_block([(0, 1, 0), (1, 2, 0)]))
    blocks.append(_pre_filter_block(1, x=96, y=25, tag="F3 input bandpass", links=[(0, 3, 0), (0, 4, 0)]))
    blocks.append(_pre_filter_block(2, x=96, y=245, tag="F4 input bandpass", links=[(0, 5, 0), (0, 6, 0)]))
    blocks.append(_band_filter_block(x=210, y=10, tag="F3 theta 4-7", center=5.5, width=1.5, links=[(0, 7, 0), (0, 9, 0), (0, 18, 0)]))
    blocks.append(_band_filter_block(x=210, y=110, tag="F3 alpha 8-12", center=10.0, width=2.0, links=[(0, 7, 1), (0, 9, 1), (0, 18, 1)]))
    blocks.append(_band_filter_block(x=210, y=230, tag="F4 theta 4-7", center=5.5, width=1.5, links=[(0, 8, 0), (0, 9, 2), (0, 18, 2)]))
    blocks.append(_band_filter_block(x=210, y=330, tag="F4 alpha 8-12", center=10.0, width=2.0, links=[(0, 8, 1), (0, 9, 3), (0, 18, 3)]))
    blocks.append(_expression_block(x=360, y=58, tag="F3 theta/alpha", expression="A/B", inputports=2, links=[(0, 10, 0), (0, 18, 4)], out_max=10.0))
    blocks.append(_expression_block(x=360, y=278, tag="F4 theta/alpha", expression="A/B", inputports=2, links=[(0, 11, 0), (0, 18, 5)], out_max=10.0))
    blocks.append(_expression_block(x=360, y=175, tag="F3/F4 total asym %", expression="100*abs((A+B)-(C+D))/(((A+B)+(C+D))/2)", inputports=4, links=[(0, 12, 0), (0, 18, 6)], out_max=100.0))
    blocks.append(_threshold_block(x=520, y=45, caption="F3 T/A 1.2-1.6", lower=1.2, upper=1.6, mode=_threshold_mode(auto, "band"), links=[(0, 13, 0), (0, 18, 7)]))
    blocks.append(_threshold_block(x=520, y=265, caption="F4 T/A 1.2-1.6", lower=1.2, upper=1.6, mode=_threshold_mode(auto, "band"), links=[(0, 13, 1), (0, 18, 8)]))
    blocks.append(_threshold_block(x=520, y=160, caption="F3/F4 close <=15%", lower=0.0, upper=15.0, mode=_threshold_mode(auto, "upper"), links=[(0, 13, 2), (0, 18, 9)]))
    blocks.append(_expression_block(x=700, y=158, tag="feedback", expression="A*100*B*C", inputports=3, links=[(0, 15, 0), (0, 16, 1), (0, 17, 0), (0, 18, 10)]))
    blocks.append(_constant_block(x=700, y=92, links=[(0, 15, 1), (0, 16, 0), (0, 17, 1)]))
    blocks.append(_counter_block(x=760, y=175, caption="Reward gated"))
    blocks.append(_sound_block(x=850, y=120, wav=str(NF_DIR / "classical.wav")))
    blocks.append(_counter_block(x=760, y=290, caption="Feedback"))
    blocks.append(_filewrite_block(x=1010, y=40, labels=["f3_theta", "f3_alpha", "f4_theta", "f4_alpha", "f3_theta_alpha", "f4_theta_alpha", "total_asym_pct", "f3_ratio_pass", "f4_ratio_pass", "closeness_pass", "feedback"], filename=str(LOG_DIR / f"{path.stem}.csv")))
    _write_protocol(path, blocks)


def _f3f4_asymmetry_protocol(path: Path, *, auto: bool) -> None:
    blocks: list[list[str]] = []
    blocks.append(_eeg_block([(0, 1, 0), (1, 2, 0)]))
    blocks.append(_pre_filter_block(1, x=96, y=25, tag="F3 input bandpass", links=[(0, 3, 0), (0, 5, 0), (0, 7, 0)]))
    blocks.append(_pre_filter_block(2, x=96, y=265, tag="F4 input bandpass", links=[(0, 4, 0), (0, 6, 0), (0, 8, 0)]))
    blocks.append(_band_filter_block(x=225, y=10, tag="F3 theta 4-7", center=5.5, width=1.5, links=[(0, 9, 0), (0, 16, 0)]))
    blocks.append(_band_filter_block(x=225, y=250, tag="F4 theta 4-7", center=5.5, width=1.5, links=[(0, 9, 1), (0, 16, 1)]))
    blocks.append(_band_filter_block(x=225, y=85, tag="F3 alpha 8-12", center=10.0, width=2.0, links=[(0, 10, 0), (0, 16, 2)]))
    blocks.append(_band_filter_block(x=225, y=325, tag="F4 alpha 8-12", center=10.0, width=2.0, links=[(0, 10, 1), (0, 16, 3)]))
    blocks.append(_band_filter_block(x=225, y=160, tag="F3 beta 13-30", center=21.5, width=8.5, links=[(0, 11, 0), (0, 16, 4)]))
    blocks.append(_band_filter_block(x=225, y=400, tag="F4 beta 13-30", center=21.5, width=8.5, links=[(0, 11, 1), (0, 16, 5)]))
    blocks.append(_expression_block(x=400, y=45, tag="theta asym %", expression="100*abs(A-B)/((A+B)/2)", inputports=2, links=[(0, 12, 0), (0, 16, 6)], out_max=100.0))
    blocks.append(_expression_block(x=400, y=150, tag="alpha asym %", expression="100*abs(A-B)/((A+B)/2)", inputports=2, links=[(0, 13, 0), (0, 16, 7)], out_max=100.0))
    blocks.append(_expression_block(x=400, y=255, tag="beta asym %", expression="100*abs(A-B)/((A+B)/2)", inputports=2, links=[(0, 14, 0), (0, 16, 8)], out_max=100.0))
    blocks.append(_threshold_block(x=560, y=35, caption="Theta asym <=15%", lower=0.0, upper=15.0, mode=_threshold_mode(auto, "upper"), links=[(0, 15, 0), (0, 16, 9)]))
    blocks.append(_threshold_block(x=560, y=140, caption="Alpha asym <=15%", lower=0.0, upper=15.0, mode=_threshold_mode(auto, "upper"), links=[(0, 15, 1), (0, 16, 10)]))
    blocks.append(_threshold_block(x=560, y=245, caption="Beta asym <=15%", lower=0.0, upper=15.0, mode=_threshold_mode(auto, "upper"), links=[(0, 15, 2), (0, 16, 11)]))
    blocks.append(_expression_block(x=745, y=150, tag="feedback", expression="A*100*B*C", inputports=3, links=[(0, 18, 0), (0, 19, 1), (0, 16, 12)]))
    blocks.append(_filewrite_block(x=1010, y=40, labels=["f3_theta", "f4_theta", "f3_alpha", "f4_alpha", "f3_beta", "f4_beta", "theta_asym_pct", "alpha_asym_pct", "beta_asym_pct", "theta_pass", "alpha_pass", "beta_pass", "feedback"], filename=str(LOG_DIR / f"{path.stem}.csv")))
    blocks.append(_constant_block(x=745, y=84, links=[(0, 18, 1), (0, 19, 0)]))
    blocks.append(_counter_block(x=805, y=170, caption="Symmetry reward"))
    blocks.append(_sound_block(x=900, y=120, wav=str(NF_DIR / "classical.wav")))
    _write_protocol(path, blocks)


def _f3f4_alpha_downtrain_ch3_ch4_protocol(path: Path, *, auto: bool = False) -> None:
    if auto:
        raise ValueError("F3/F4 alpha downtrain ch3/ch4 protocol is manual-threshold only")

    blocks: list[list[str]] = []
    blocks.append(_eeg_block([(2, 1, 0), (3, 2, 0)]))
    blocks.append(_pre_filter_block(1, x=96, y=55, tag="F3 ch3 input bandpass", links=[(0, 3, 0)]))
    blocks.append(_pre_filter_block(2, x=96, y=245, tag="F4 ch4 input bandpass", links=[(0, 4, 0)]))
    blocks.append(_band_filter_block(x=225, y=55, tag="F3 ch3 alpha 8-12", center=10.0, width=2.0, links=[(0, 5, 0), (0, 6, 0), (0, 16, 0)]))
    blocks.append(_band_filter_block(x=225, y=245, tag="F4 ch4 alpha 8-12", center=10.0, width=2.0, links=[(0, 5, 1), (0, 7, 0), (0, 16, 1)]))
    blocks.append(_expression_block(x=400, y=150, tag="F4/F3 alpha diff %", expression="100*abs(A-B)/(((A+B)/2)+0.000001)", inputports=2, links=[(0, 8, 0), (0, 16, 2)], out_max=100.0))
    blocks.append(_threshold_block(x=565, y=35, caption="F3 alpha <= manual", lower=0.0, upper=10.0, mode="manual", links=[(0, 9, 0), (0, 10, 0), (0, 15, 3)]))
    blocks.append(_threshold_block(x=565, y=230, caption="F4 alpha <= manual", lower=0.0, upper=10.0, mode="manual", links=[(0, 9, 1), (0, 10, 1), (0, 15, 4)]))
    blocks.append(_threshold_block(x=565, y=130, caption="F4/F3 alpha diff <=15%", lower=0.0, upper=15.0, mode="manual", links=[(0, 9, 2), (0, 15, 5)]))
    blocks.append(_expression_block(x=745, y=145, tag="feedback", expression="A*100*B*C", inputports=3, links=[(0, 11, 0), (0, 12, 0), (0, 15, 6)]))
    blocks.append(_expression_block(x=745, y=270, tag="alpha high tone", expression="100*(1-(A*B))", inputports=2, links=[(0, 13, 0), (0, 14, 1), (0, 15, 7)]))
    blocks.append(_particles_block(x=920, y=205))
    blocks.append(_counter_block(x=795, y=45, caption="Reward gated"))
    blocks.append(_counter_block(x=795, y=315, caption="Alpha high cue"))
    blocks.append(_sound_block(x=930, y=315, wav=str(NF_DIR / "alpha_21hz_isochronic.wav")))
    blocks.append(
        _filewrite_block(
            x=1080,
            y=40,
            labels=[
                "f3_alpha",
                "f4_alpha",
                "alpha_diff_pct",
                "f3_alpha_below",
                "f4_alpha_below",
                "alpha_diff_pass",
                "feedback",
                "alpha_high_tone",
            ],
            filename=str(LOG_DIR / f"{path.stem}.csv"),
        )
    )
    blocks.append(_constant_block(x=745, y=78, links=[(0, 12, 1), (0, 13, 1), (0, 14, 0), (0, 14, 2)]))
    _write_protocol(path, blocks)


def _fz_hibeta_beta_protocol(path: Path, *, auto: bool) -> None:
    blocks: list[list[str]] = []
    blocks.append(_eeg_block([(0, 1, 0)]))
    blocks.append(_pre_filter_block(1, x=96, y=32, tag="Fz input bandpass", links=[(0, 2, 0), (0, 3, 0)]))
    blocks.append(_band_filter_block(x=185, y=22, tag="Fz beta 13-30", center=21.5, width=8.5, links=[(0, 4, 1), (0, 9, 0)]))
    blocks.append(_band_filter_block(x=185, y=125, tag="Fz hibeta 28-40", center=34.0, width=6.0, links=[(0, 4, 0), (0, 9, 1)]))
    blocks.append(_expression_block(x=340, y=72, tag="Fz hibeta/beta", expression="A/B", inputports=2, links=[(0, 5, 0), (0, 9, 2)], out_max=5.0))
    blocks.append(_threshold_block(x=500, y=62, caption="Fz HiBeta/Beta 0.45-0.55", lower=0.45, upper=0.55, mode=_threshold_mode(auto, "band"), links=[(0, 6, 0), (0, 9, 3)]))
    blocks.append(_expression_block(x=680, y=74, tag="feedback", expression="A*100", inputports=1, links=[(0, 8, 1), (0, 10, 0), (0, 9, 4)]))
    blocks.append(_constant_block(x=680, y=15, links=[(0, 8, 0), (0, 10, 1)]))
    blocks.append(_sound_block(x=800, y=45, wav=str(NF_DIR / "classical.wav")))
    blocks.append(_filewrite_block(x=1000, y=35, labels=["beta", "hibeta", "hibeta_beta", "ratio_pass", "feedback"], filename=str(LOG_DIR / f"{path.stem}.csv")))
    blocks.append(_counter_block(x=740, y=125, caption="Ratio pass"))
    _write_protocol(path, blocks)


def _fehmi_alpha_synchrony_protocol(path: Path, *, auto: bool) -> None:
    if auto:
        raise ValueError("Fehmi alpha synchrony protocol is manual-threshold only")

    blocks: list[list[str]] = []
    blocks.append(_eeg_block([(0, 1, 0), (1, 2, 0), (2, 3, 0), (3, 4, 0), (4, 5, 0)]))
    blocks.append(_pre_filter_block(1, x=95, y=20, tag="Ch1 Oz input bandpass", links=[(0, 6, 0)]))
    blocks.append(_pre_filter_block(2, x=95, y=115, tag="Ch2 Cz input bandpass", links=[(0, 6, 1)]))
    blocks.append(_pre_filter_block(3, x=95, y=210, tag="Ch3 T3 input bandpass", links=[(0, 6, 2)]))
    blocks.append(_pre_filter_block(4, x=95, y=305, tag="Ch4 T4 input bandpass", links=[(0, 6, 3)]))
    blocks.append(_pre_filter_block(5, x=95, y=400, tag="Ch5 FPz input bandpass", links=[(0, 6, 4)]))
    blocks.append(
        _expression_block(
            x=275,
            y=210,
            tag="Oz+Cz+T3+T4+FPz sum",
            expression="A+B+C+D+E",
            inputports=5,
            in_min=-187500.0,
            in_max=187500.0,
            out_min=-937500.0,
            out_max=937500.0,
            links=[(0, 7, 0), (0, 16, 0)],
        )
    )
    blocks.append(
        _band_filter_block(
            x=455,
            y=210,
            tag="Summed alpha 9.75-10.25",
            center=10.0,
            width=0.25,
            links=[(0, 8, 0), (0, 12, 0), (0, 15, 0), (0, 16, 1)],
        )
    )
    blocks.append(
        _threshold_block(
            x=630,
            y=210,
            caption="Summed alpha manual",
            lower=10.0,
            upper=100.0,
            mode="manual",
            links=[(0, 9, 0), (0, 13, 0), (0, 16, 2)],
        )
    )
    blocks.append(_expression_block(x=805, y=220, tag="feedback", expression="A*100", inputports=1, links=[(0, 11, 1), (0, 14, 0), (0, 15, 1), (0, 16, 3)]))
    blocks.append(_constant_block(x=805, y=155, links=[(0, 11, 0)]))
    blocks.append(_sound_block(x=960, y=170, wav=str(NF_DIR / "classical.wav")))
    blocks.append(_counter_block(x=790, y=305, caption="Summed alpha"))
    blocks.append(_counter_block(x=790, y=420, caption="Alpha pass"))
    blocks.append(_particles_block(x=965, y=305))
    blocks.append(_oscii_block(x=455, y=345, inputports=2))
    blocks.append(
        _filewrite_block(
            x=1120,
            y=35,
            labels=["summed_raw", "summed_alpha", "alpha_pass", "feedback"],
            filename=str(LOG_DIR / f"{path.stem}.csv"),
        )
    )
    _write_protocol(path, blocks)


def _validate_con(path: Path) -> None:
    header, blocks = _split_con(path.read_text(encoding="utf-8"))
    declared = None
    for line in header:
        if line.startswith("objects="):
            declared = int(line.split("=", 1)[1])
            break
    if declared != len(blocks):
        raise AssertionError(f"{path.name}: declared {declared}, found {len(blocks)}")
    bad_links: list[str] = []
    for idx, block in enumerate(blocks):
        for line in block:
            match = re.match(r"linkport\s+\d+-(\d+),(\d+)", line)
            if match and int(match.group(1)) >= len(blocks):
                bad_links.append(f"object {idx}: {line}")
    if bad_links:
        raise AssertionError(f"{path.name}: bad links: {'; '.join(bad_links)}")


def main() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    general_labels = ["reward_amp", "slow_amp", "fast_amp", "reward_pass", "slow_pass", "fast_pass", "feedback"]
    general_sources = [
        ({"tag": "Reward filter"}, 0),
        ({"tag": "Inhibit 1-6"}, 0),
        ({"tag": "Inhibit 22-36"}, 0),
        ({"caption": "Reward Frequency"}, 0),
        ({"caption": "Slow inhibit"}, 0),
        ({"caption": "Fast inhibit"}, 0),
        ({"expression": "A*100*B*C"}, 0),
    ]
    for source_name in ["reward_2inhibit_1channel_auto.con", "fpo2_reward_2inhibit_1channel_auto.con"]:
        source = NF_DIR / source_name
        stem = source.stem.removesuffix("_auto")
        _add_recording_to_existing(
            source,
            NF_DIR / f"{stem}_auto_recording.con",
            manual_thresholds=False,
            labels=general_labels,
            sources=general_sources,
        )
        _add_recording_to_existing(
            source,
            NF_DIR / f"{stem}_manual.con",
            manual_thresholds=True,
            labels=general_labels,
            sources=general_sources,
        )

    _add_recording_to_existing(
        NF_DIR / "reward_smr_inhibit_theta.con",
        NF_DIR / "reward_smr_inhibit_theta_auto_recording.con",
        manual_thresholds=False,
        labels=["smr_amp", "theta_amp", "smr_pass", "theta_pass", "feedback"],
        sources=[
            ({"tag": "Reward filter"}, 0),
            ({"tag": "Inhibit 3-7"}, 0),
            ({"caption": "SMR"}, 0),
            ({"caption": "Slow inhibit"}, 0),
            ({"expression": "A*100*B"}, 0),
        ],
    )
    _add_recording_to_existing(
        NF_DIR / "reward_smr_inhibit_theta.con",
        NF_DIR / "reward_smr_inhibit_theta_manual.con",
        manual_thresholds=True,
        labels=["smr_amp", "theta_amp", "smr_pass", "theta_pass", "feedback"],
        sources=[
            ({"tag": "Reward filter"}, 0),
            ({"tag": "Inhibit 3-7"}, 0),
            ({"caption": "SMR"}, 0),
            ({"caption": "Slow inhibit"}, 0),
            ({"expression": "A*100*B"}, 0),
        ],
    )

    alpha_theta_sources = [
        ({"tag": "Reward 8-12"}, 0),
        ({"tag": "Reward 5-8"}, 0),
        ({"tag": "Inhibit 2-5"}, 0),
        ({"tag": "Inhibit 15-30"}, 0),
        ({"caption": "Reward Alpha"}, 0),
        ({"caption": "Reward Theta"}, 0),
        ({"caption": "Slow inhibit"}, 0),
        ({"caption": "Fast inhibit"}, 0),
        ({"expression": "A*100*B*C*D"}, 0),
    ]
    _add_recording_to_existing(
        NF_DIR / "alpha_theta_inhibit_delta_hibeta.con",
        NF_DIR / "alpha_theta_inhibit_delta_hibeta_auto_recording.con",
        manual_thresholds=False,
        labels=["alpha_amp", "theta_amp", "delta_amp", "hibeta_amp", "alpha_pass", "theta_pass", "delta_pass", "hibeta_pass", "feedback"],
        sources=alpha_theta_sources,
    )
    _add_recording_to_existing(
        NF_DIR / "alpha_theta_inhibit_delta_hibeta.con",
        NF_DIR / "alpha_theta_inhibit_delta_hibeta_manual.con",
        manual_thresholds=True,
        labels=["alpha_amp", "theta_amp", "delta_amp", "hibeta_amp", "alpha_pass", "theta_pass", "delta_pass", "hibeta_pass", "feedback"],
        sources=alpha_theta_sources,
    )

    generated_protocols = [
        ("o1_theta_beta_ratio_downtrain_auto.con", _o1_theta_beta_protocol, True),
        ("o1_theta_beta_ratio_downtrain_manual.con", _o1_theta_beta_protocol, False),
        ("f3f4_theta_alpha_balanced_auto.con", _f3f4_theta_alpha_protocol, True),
        ("f3f4_theta_alpha_balanced_manual.con", _f3f4_theta_alpha_protocol, False),
        ("f3f4_band_asymmetry_reduce_auto.con", _f3f4_asymmetry_protocol, True),
        ("f3f4_band_asymmetry_reduce_manual.con", _f3f4_asymmetry_protocol, False),
        ("f3f4_alpha_downtrain_ch3_ch4_manual.con", _f3f4_alpha_downtrain_ch3_ch4_protocol, False),
        ("fz_hibeta_beta_ratio_auto.con", _fz_hibeta_beta_protocol, True),
        ("fz_hibeta_beta_ratio_manual.con", _fz_hibeta_beta_protocol, False),
        ("fehmi_5site_summed_alpha_synchrony_manual.con", _fehmi_alpha_synchrony_protocol, False),
    ]
    for filename, writer, auto in generated_protocols:
        writer(NF_DIR / filename, auto=auto)

    readme = NF_DIR / "BRAINBAY_PROTOCOLS_README.md"
    readme.write_text(
        "\n".join(
            [
                "# BrainBay NF Protocols",
                "",
                "Generated protocols write dated CSV session summaries to `session_logs` with one averaged row per second.",
                "Manual variants disable BrainBay threshold adaptation (`adapt_lower_mode=0`, `adapt_upper_mode=0`) so you can set thresholds directly in the threshold meters.",
                "Auto variants keep or use BrainBay adaptive threshold modes.",
                "",
                "Targeted protocols:",
                "- `o1_theta_beta_ratio_downtrain_*`: O1 theta/beta ratio, rewarding ratio below 2.2.",
                "- `f3f4_theta_alpha_balanced_*`: F3/F4 theta/alpha target range 1.2-1.6, gated by F3/F4 total amplitude asymmetry <= 15%.",
                "- `f3f4_band_asymmetry_reduce_*`: rewards theta, alpha, and beta F3/F4 asymmetry <= 15%.",
                "- `f3f4_alpha_downtrain_ch3_ch4_manual`: F3 on Channel 3 and F4 on Channel 4 alpha downtrain; visual reward requires both alpha amplitudes below manual thresholds and F4/F3 alpha difference <= 15%, while high alpha gates a 21 Hz isochronic tone.",
                "- `fz_hibeta_beta_ratio_*`: Fz HiBeta/Beta target range 0.45-0.55.",
                "- `fehmi_5site_summed_alpha_synchrony_manual`: FPz, Cz, Oz, T3, and T4 are summed before a narrow 10 Hz alpha reward threshold.",
                "",
                "Channel assumptions:",
                "- One-channel protocols use BrainBay EEG Channel 1. Place that channel at the named site.",
                "- F3/F4 protocols use Channel 1 = F3 and Channel 2 = F4.",
                "- `f3f4_alpha_downtrain_ch3_ch4_manual` uses Channel 3 = F3 and Channel 4 = F4.",
                "- Fehmi 5-site synchrony uses Channel 1 = Oz, Channel 2 = Cz, Channel 3 = T3, Channel 4 = T4, Channel 5 = FPz.",
                "",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    for path in sorted(NF_DIR.glob("*_recording.con")) + sorted(NF_DIR.glob("*_manual.con")) + [
        NF_DIR / name for name, _, _ in generated_protocols
    ]:
        if path.exists():
            _validate_con(path)

    print("Generated BrainBay protocols:")
    for path in sorted(NF_DIR.glob("*_recording.con")) + sorted(NF_DIR.glob("*_manual.con")) + [
        NF_DIR / name for name, _, _ in generated_protocols
    ]:
        if path.exists():
            print(f"- {path}")
    print(f"Session log directory: {LOG_DIR}")


if __name__ == "__main__":
    main()
