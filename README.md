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

If PowerShell blocks activation (`Activate.ps1 cannot be loaded`), you do not need to activate the venv. Just run the venv's Python directly:

```powershell
..\\eeg\\Scripts\\python -m clinicalq_backend.cli --help
```

Optional (enables `.\\eeg\\Scripts\\Activate.ps1`): run PowerShell as your user and set:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
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

To ensure Electron uses the venv Python backend, set:

```powershell
$env:CLINICALQ_PYTHON = "C:\\entrainment\\eeg\\Scripts\\python.exe"
```
