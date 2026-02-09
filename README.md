# ClinicalQ Local App (OpenBCI Cyton)

Local-first ClinicalQ workflow:
- Python backend for OpenBCI Cyton acquisition and ClinicalQ analytics
- Electron desktop GUI that calls the Python backend and guides epoch-by-epoch recording
- No internet required at runtime

## Folder layout

- `backend/`: Python acquisition and analysis engine
- `desktop/`: Electron native desktop shell

## Backend setup

```powershell
cd backend
python -m venv ..\\eeg
..\\eeg\\Scripts\\python -m pip install --upgrade pip
..\\eeg\\Scripts\\python -m pip install -e .[openbci,dev]
```

Run a simulated session:

```powershell
..\\eeg\\Scripts\\python -m clinicalq_backend.cli run --config examples/session_config_simulated.json --output ..\\output\\session_result.json
```

## Desktop setup

PowerShell execution policy on this machine blocks `npm.ps1`, so use `cmd`:

```powershell
cd desktop
cmd /c npm install
cmd /c npm start
```

