from __future__ import annotations

import argparse
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

S3_BASE = "https://s3.amazonaws.com/openneuro.org"
PREFIX = "ds005385/"
XML_NS = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}


def list_keys(prefix: str = PREFIX) -> list[str]:
    keys: list[str] = []
    params = {"list-type": "2", "prefix": prefix}

    while True:
        response = requests.get(S3_BASE, params=params, timeout=90)
        response.raise_for_status()
        root = ET.fromstring(response.text)
        keys.extend([node.text or "" for node in root.findall("s3:Contents/s3:Key", XML_NS)])
        is_truncated = (root.findtext("s3:IsTruncated", default="false", namespaces=XML_NS) or "false").lower()
        if is_truncated != "true":
            break
        token = root.findtext("s3:NextContinuationToken", default="", namespaces=XML_NS)
        params = {"list-type": "2", "prefix": prefix, "continuation-token": token}

    return keys


def select_keys(keys: list[str], *, task: str, acquisition: str, session: str) -> list[str]:
    wanted: list[str] = []
    root_files = {
        "ds005385/CHANGES",
        "ds005385/README.md",
        "ds005385/dataset_description.json",
        "ds005385/participants.tsv",
        "ds005385/participants.json",
    }

    task_token = f"_task-{task}_"
    acq_token = f"_acq-{acquisition}_"
    session_token = f"/{session}/"

    for key in keys:
        if key in root_files:
            wanted.append(key)
            continue
        if "/eeg/" not in key:
            continue
        if not (key.endswith("_eeg.edf") or key.endswith("_channels.tsv") or key.endswith("_eeg.json")):
            continue
        if task != "all" and task_token not in key:
            continue
        if acquisition != "all" and acq_token not in key:
            continue
        if session != "all" and session_token not in key:
            continue
        wanted.append(key)
    return wanted


def download_keys(keys: list[str], output_dir: Path, workers: int = 12) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    session = requests.Session()

    def _download(key: str) -> str:
        rel_path = key[len(PREFIX) :]
        target = output_dir / rel_path
        target.parent.mkdir(parents=True, exist_ok=True)
        url = f"{S3_BASE}/{key}"

        last_error: Exception | None = None
        for attempt in range(1, 6):
            try:
                head = session.head(url, timeout=60)
                head.raise_for_status()
                size = int(head.headers.get("Content-Length", "0"))
                if target.exists() and target.stat().st_size == size:
                    return f"skip {key}"

                with session.get(url, stream=True, timeout=180) as response:
                    response.raise_for_status()
                    with target.open("wb") as f:
                        for chunk in response.iter_content(chunk_size=1024 * 1024):
                            if chunk:
                                f.write(chunk)
                return f"down {key}"
            except Exception as exc:  # transient S3/network issues are expected at scale
                last_error = exc
                if attempt >= 5:
                    break
                time.sleep(1.5 * attempt)
        raise RuntimeError(f"Failed to download {key}: {last_error}")

    completed = 0
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = [pool.submit(_download, key) for key in keys]
        total = len(futures)
        for future in as_completed(futures):
            completed += 1
            msg = future.result()
            if completed % 25 == 0 or msg.startswith("down"):
                print(f"[{completed}/{total}] {msg}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Download DVS (ds005385) resting EEG files from OpenNeuro public S3.")
    parser.add_argument("--output", type=Path, default=Path("data/ds005385"), help="Output dataset directory")
    parser.add_argument("--workers", type=int, default=12, help="Parallel download workers")
    parser.add_argument("--task", type=str, default="EyesClosed", help="Task filter (EyesClosed, EyesOpen, all)")
    parser.add_argument("--acquisition", type=str, default="pre", help="Acquisition filter (pre, post, all)")
    parser.add_argument("--session", type=str, default="ses-1", help="Session filter (ses-1, ses-2, all)")
    args = parser.parse_args()

    task = str(args.task).strip()
    acquisition = str(args.acquisition).strip()
    session = str(args.session).strip()

    keys = list_keys()
    wanted = select_keys(keys, task=task, acquisition=acquisition, session=session)
    print(
        f"Found {len(keys)} total keys. Downloading {len(wanted)} keys "
        f"(task={task}, acquisition={acquisition}, session={session}).",
        flush=True,
    )
    download_keys(wanted, args.output, workers=args.workers)
    print(f"Done: {args.output.resolve()}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
