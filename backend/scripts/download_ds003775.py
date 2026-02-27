from __future__ import annotations

import argparse
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

S3_BASE = "https://s3.amazonaws.com/openneuro.org"
PREFIX = "ds003775/"
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


def select_keys(keys: list[str]) -> list[str]:
    wanted: list[str] = []
    for key in keys:
        if key in {
            "ds003775/README",
            "ds003775/dataset_description.json",
            "ds003775/participants.tsv",
            "ds003775/participants.json",
        }:
            wanted.append(key)
            continue
        if "/eeg/" in key and (key.endswith("_eeg.edf") or key.endswith("_channels.tsv") or key.endswith("_eeg.json")):
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
    parser = argparse.ArgumentParser(description="Download ds003775 EEG + metadata from OpenNeuro public S3.")
    parser.add_argument("--output", type=Path, default=Path("data/ds003775"), help="Output dataset directory")
    parser.add_argument("--workers", type=int, default=12, help="Parallel download workers")
    args = parser.parse_args()

    keys = list_keys()
    wanted = select_keys(keys)
    print(f"Found {len(keys)} total keys. Downloading {len(wanted)} EEG/metadata keys.", flush=True)
    download_keys(wanted, args.output, workers=args.workers)
    print(f"Done: {args.output.resolve()}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
