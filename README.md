# QuantPulse

A minimalist quantitative research platform with a green-and-white interface.

The project aims to support stock analysis, factor research, machine learning-based stock ranking, and strategy backtesting.

## Current Progress

- React frontend with a custom logo and basic styling
- Python virtual environment configured
- Basic FastAPI endpoint created

Frontend-backend integration, market data, factor research, and machine learning features are planned.

## Tech Stack

- Frontend: React and Vite
- Backend: Python, FastAPI, and Uvicorn

## Project Structure

- `frontend/`: User interface and frontend code
- `backend/`: API and future quantitative research code

## Local Development

The commands below are for Windows Git Bash.

Open the project root directory in VS Code, then open two terminals.

### Start the Frontend

```bash
npm --prefix frontend run dev
```

Open the URL shown in the terminal, usually:
http://localhost:5173/

### Start the Backend

```bash
./backend/.venv/Scripts/python.exe -m uvicorn main:app --app-dir backend --reload
```

This command uses the virtual environment's Python directly, so manual activation is not required.

Backend endpoint:
http://127.0.0.1:8000/

### Stop the Services

Press `Ctrl + C` in each terminal.

## Environment Notes

These startup commands assume dependencies are already installed and the backend virtual environment exists.

You do not need to reinstall dependencies or recreate the virtual environment each day.

When setting up the project on another computer, install dependencies and create a new local virtual environment.

Do not commit `.venv`, `node_modules`, or files containing secrets.