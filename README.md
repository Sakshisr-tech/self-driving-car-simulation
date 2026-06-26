# Self Driving Car Simulation

An interactive self-driving car simulation built with Vite, React, TypeScript, and Canvas 2D. The project trains neural-network controlled cars with a genetic algorithm and compares AI driving against manual control.

## Features

- AI training with genetic algorithm, elitism, crossover, mutation, and persisted training state
- Manual driving mode with keyboard controls
- Manual vs AI comparison dashboard
- Training progress goals, analytics graphs, and autopilot confidence indicators
- Scenario modes, curved roads, obstacle types, and debug toggles
- Export/import trained models
- Replay best run and project report page
- Performance optimizations for high-speed training

## Getting Started

```bash
npm install
npm run dev
```

Open the local Vite URL in your browser.

## Build

```bash
npm run build
```

## Controls

- `W` / `ArrowUp`: accelerate
- `S` / `ArrowDown`: brake or reverse
- `A` / `ArrowLeft`: turn left
- `D` / `ArrowRight`: turn right

## Tech Stack

- React
- TypeScript
- Vite
- Canvas 2D
- LocalStorage persistence
