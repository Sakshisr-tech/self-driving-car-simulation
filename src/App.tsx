import { BookOpen, BrainCircuit, CarFront, Download, FileUp, Film, Pause, Play, RotateCcw, Route, Save, Trash2, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrainShape, clamp, loadSavedBrain, scenarioLabels, Settings, Simulation, Telemetry, TrainingSample } from "./simulation";

type TrainingPreset = {
  label: string;
  values: Pick<Settings, "population" | "mutation" | "eliteRate" | "crossoverRate" | "trainingSpeed" | "traffic" | "obstacleDensity" | "sensorRays">;
};

const trainingPresets: TrainingPreset[] = [
  {
    label: "Fast Learning",
    values: { population: 240, mutation: 24, eliteRate: 10, crossoverRate: 84, trainingSpeed: 16, traffic: 8, obstacleDensity: 1, sensorRays: 11 },
  },
  {
    label: "Stable",
    values: { population: 240, mutation: 10, eliteRate: 14, crossoverRate: 88, trainingSpeed: 8, traffic: 14, obstacleDensity: 3, sensorRays: 11 },
  },
  {
    label: "High Accuracy",
    values: { population: 360, mutation: 6, eliteRate: 20, crossoverRate: 94, trainingSpeed: 7, traffic: 16, obstacleDensity: 5, sensorRays: 11 },
  },
  {
    label: "Exploration",
    values: { population: 220, mutation: 30, eliteRate: 6, crossoverRate: 72, trainingSpeed: 12, traffic: 12, obstacleDensity: 6, sensorRays: 11 },
  },
];

const defaultSettings: Settings = {
  population: 260,
  traffic: 10,
  obstacleDensity: 2,
  mutation: 10,
  sensorRays: 11,
  lanes: 3,
  driveMode: "ai",
  scenario: "balanced",
  obstacleMode: "mixed",
  roadShape: "curved",
  eliteRate: 10,
  crossoverRate: 88,
  trainingSpeed: 8,
  debug: {
    sensors: true,
    replayPath: true,
    traffic: true,
    collisions: false,
    network: true,
  },
};

const defaultTelemetry: Telemetry = {
  generation: 1,
  alive: 0,
  distance: 0,
  speed: 0,
  currentCrashed: false,
  autopilot: {
    throttle: 0,
    left: 0,
    right: 0,
    brake: 0,
    hazard: 0,
    leftClearance: 100,
    rightClearance: 100,
  },
  storageState: "Unsaved",
  mode: "ai",
  bestEverDistance: 0,
  averageDistance: 0,
  crashRate: 0,
  eliteCount: 0,
  accuracyScore: 0,
  effectiveMutation: 14,
  stagnantGenerations: 0,
  trainingSteps: 0,
  curriculumLevel: 1,
  hasReplay: false,
  replaying: false,
  history: [],
};

type AppView = "simulation" | "report";

type ComparisonLeader = "ai" | "manual" | "tie";

type ComparisonSnapshot = {
  aiDistance: number;
  aiSpeed: number;
  aiCrashRate: number;
  aiAccuracy: number;
  manualDistance: number;
  manualSpeed: number;
  manualCrashed: boolean;
  leader: ComparisonLeader;
};

const defaultComparison: ComparisonSnapshot = {
  aiDistance: 0,
  aiSpeed: 0,
  aiCrashRate: 0,
  aiAccuracy: 0,
  manualDistance: 0,
  manualSpeed: 0,
  manualCrashed: false,
  leader: "tie",
};

function comparisonLeader(aiDistance: number, manualDistance: number): ComparisonLeader {
  if (Math.abs(aiDistance - manualDistance) <= 5) return "tie";
  return aiDistance > manualDistance ? "ai" : "manual";
}

function mergeComparison(previous: ComparisonSnapshot, telemetry: Telemetry): ComparisonSnapshot {
  const next = { ...previous };

  if (telemetry.mode === "ai") {
    next.aiDistance = Math.max(previous.aiDistance, telemetry.bestEverDistance, telemetry.distance);
    next.aiSpeed = Math.max(previous.aiSpeed, telemetry.speed);
    next.aiCrashRate = telemetry.crashRate;
    next.aiAccuracy = telemetry.accuracyScore;
  } else {
    next.manualDistance = Math.max(previous.manualDistance, telemetry.distance);
    next.manualSpeed = Math.max(previous.manualSpeed, telemetry.speed);
    next.manualCrashed = previous.manualCrashed || telemetry.currentCrashed;
  }

  next.leader = comparisonLeader(next.aiDistance, next.manualDistance);
  return next;
}

export function App() {
  const carCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const networkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const simulationRef = useRef<Simulation | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const frameRef = useRef<number>(0);
  const frameTickRef = useRef(0);
  const runningRef = useRef(true);
  const lastTelemetryRef = useRef(0);

  const [settings, setSettings] = useState(defaultSettings);
  const [telemetry, setTelemetry] = useState(defaultTelemetry);
  const [comparison, setComparison] = useState(defaultComparison);
  const [running, setRunning] = useState(true);
  const [view, setView] = useState<AppView>("simulation");

  const hasSavedBrain = useMemo(() => loadSavedBrain() !== null, [telemetry.storageState]);

  const recordTelemetry = useCallback((nextTelemetry: Telemetry) => {
    setTelemetry(nextTelemetry);
    setComparison((current) => mergeComparison(current, nextTelemetry));
  }, []);

  const resizeCanvas = useCallback((canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(240, Math.floor(rect.width));
    const height = Math.max(220, Math.floor(rect.height));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    const scaledWidth = Math.floor(width * pixelRatio);
    const scaledHeight = Math.floor(height * pixelRatio);
    if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
    }
    const ctx = canvas.getContext("2d");
    ctx?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    return { ctx, width, height };
  }, []);

  const rebuildSimulation = useCallback((nextSettings: Settings) => {
    const carCanvas = carCanvasRef.current;
    if (!carCanvas) return;
    const width = Math.max(320, Math.floor(carCanvas.getBoundingClientRect().width));
    simulationRef.current = new Simulation(nextSettings, width);
    recordTelemetry(simulationRef.current.telemetry());
  }, [recordTelemetry]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    const pressed = new Set<string>();
    const syncControls = () => {
      simulationRef.current?.setManualControls({
        forward: pressed.has("arrowup") || pressed.has("w"),
        left: pressed.has("arrowleft") || pressed.has("a"),
        right: pressed.has("arrowright") || pressed.has("d"),
        reverse: pressed.has("arrowdown") || pressed.has("s"),
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowleft", "arrowright", "arrowdown", "w", "a", "s", "d"].includes(key)) {
        event.preventDefault();
        pressed.add(key);
        syncControls();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (pressed.delete(key)) {
        event.preventDefault();
        syncControls();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    rebuildSimulation(settings);
  }, [
    rebuildSimulation,
    settings.driveMode,
    settings.lanes,
    settings.obstacleDensity,
    settings.obstacleMode,
    settings.population,
    settings.roadShape,
    settings.scenario,
    settings.sensorRays,
    settings.traffic,
  ]);

  useEffect(() => {
    if (simulationRef.current) {
      simulationRef.current.settings = settings;
    }
  }, [settings]);

  useEffect(() => {
    const saveBeforeUnload = () => {
      simulationRef.current?.saveTrainingState();
    };

    window.addEventListener("beforeunload", saveBeforeUnload);
    return () => window.removeEventListener("beforeunload", saveBeforeUnload);
  }, []);

  useEffect(() => {
    const loop = (time: number) => {
      const carCanvas = carCanvasRef.current;
      const networkCanvas = networkCanvasRef.current;
      const simulation = simulationRef.current;

      if (carCanvas && networkCanvas && simulation) {
        frameTickRef.current += 1;
        const fastTraining = settings.driveMode === "ai" && settings.trainingSpeed > 4;
        const visualInterval = settings.trainingSpeed >= 15 ? 3 : settings.trainingSpeed >= 10 ? 2 : 1;
        const renderVisuals = !runningRef.current || frameTickRef.current % visualInterval === 0;

        if (runningRef.current) {
          const steps = settings.driveMode === "ai" ? settings.trainingSpeed : 1;
          for (let i = 0; i < steps; i += 1) {
            simulation.step();
          }
        }

        if (renderVisuals) {
          const carFrame = resizeCanvas(carCanvas);
          const networkFrame = resizeCanvas(networkCanvas);
          const renderNetwork = !fastTraining || frameTickRef.current % 6 === 0;

          if (carFrame.ctx && networkFrame.ctx) {
            simulation.render(carFrame.ctx, networkFrame.ctx, carFrame.width, carFrame.height, networkFrame.width, networkFrame.height, {
              fastVisuals: fastTraining,
              renderNetwork,
            });
          }
        }

        if (time - lastTelemetryRef.current > 120) {
          lastTelemetryRef.current = time;
          recordTelemetry(simulation.telemetry());
        }
      }

      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);

    const onResize = () => rebuildSimulation(settings);
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [rebuildSimulation, recordTelemetry, resizeCanvas, settings]);

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const updateDebug = <K extends keyof Settings["debug"]>(key: K, value: Settings["debug"][K]) => {
    setSettings((current) => ({ ...current, debug: { ...current.debug, [key]: value } }));
  };

  const applyPreset = (preset: TrainingPreset) => {
    setSettings((current) => ({ ...current, ...preset.values, driveMode: "ai" }));
  };

  const reset = () => {
    rebuildSimulation(settings);
  };

  const resetComparison = () => {
    setComparison(defaultComparison);
  };

  const save = () => {
    simulationRef.current?.saveBestBrain();
    if (simulationRef.current) recordTelemetry(simulationRef.current.telemetry());
  };

  const load = () => {
    rebuildSimulation(settings);
  };

  const clear = () => {
    simulationRef.current?.clearBestBrain();
    if (simulationRef.current) recordTelemetry(simulationRef.current.telemetry());
  };

  const toggleReplay = () => {
    simulationRef.current?.toggleReplay();
    if (simulationRef.current) recordTelemetry(simulationRef.current.telemetry());
  };

  const exportModel = () => {
    const brain = simulationRef.current?.exportBestBrain() ?? loadSavedBrain();
    if (!brain) return;

    const payload = {
      schema: "self-driving-car-brain",
      version: 1,
      exportedAt: new Date().toISOString(),
      scenario: settings.scenario,
      sensorRays: settings.sensorRays,
      brain,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `self-driving-brain-${settings.scenario}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importModel = async (file: File | undefined) => {
    if (!file) return;

    try {
      const data = JSON.parse(await file.text()) as unknown;
      const brain = isImportPayload(data) ? data.brain : data;
      if (!isBrainShape(brain)) return;

      simulationRef.current?.importBrain(brain);
      if (simulationRef.current) recordTelemetry(simulationRef.current.telemetry());
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Autonomous vehicle lab</p>
          <h1>Self Driving Car Simulation</h1>
        </div>
        <div className="actions" aria-label="Simulation controls">
          <button className="primary icon-button" type="button" onClick={() => setRunning((value) => !value)}>
            {running ? <Pause size={18} /> : <Play size={18} />}
            <span>{running ? "Pause" : "Run"}</span>
          </button>
          <button className="icon-button" type="button" onClick={reset}>
            <RotateCcw size={18} />
            <span>Reset</span>
          </button>
          <button className="icon-button" type="button" onClick={save}>
            <Save size={18} />
            <span>Save Best</span>
          </button>
          <button className="icon-button" type="button" onClick={load} disabled={!hasSavedBrain}>
            <Upload size={18} />
            <span>Load Best</span>
          </button>
          <button className="icon-button" type="button" onClick={clear} disabled={!hasSavedBrain}>
            <Trash2 size={18} />
            <span>Clear</span>
          </button>
          <button className="icon-button" type="button" onClick={toggleReplay} disabled={!telemetry.hasReplay}>
            <Film size={18} />
            <span>{telemetry.replaying ? "Stop Replay" : "Replay"}</span>
          </button>
          <button className="icon-button" type="button" onClick={exportModel} disabled={!hasSavedBrain && !simulationRef.current?.bestCar.brain}>
            <Download size={18} />
            <span>Export</span>
          </button>
          <button className="icon-button" type="button" onClick={() => importInputRef.current?.click()}>
            <FileUp size={18} />
            <span>Import</span>
          </button>
          <input
            ref={importInputRef}
            className="file-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void importModel(event.target.files?.[0])}
          />
          <button className="icon-button" type="button" onClick={() => setView((current) => (current === "simulation" ? "report" : "simulation"))}>
            <BookOpen size={18} />
            <span>{view === "simulation" ? "Report" : "Simulator"}</span>
          </button>
        </div>
      </header>

      {view === "report" ? (
        <ProjectReport telemetry={telemetry} settings={settings} comparison={comparison} />
      ) : (
      <section className="workspace">
        <aside className="control-panel" aria-label="Configuration">
          <div className="mode-switch" aria-label="Drive mode">
            <button className={settings.driveMode === "ai" ? "selected" : ""} type="button" onClick={() => updateSetting("driveMode", "ai")}>
              <BrainCircuit size={17} />
              <span>AI Train</span>
            </button>
            <button className={settings.driveMode === "manual" ? "selected" : ""} type="button" onClick={() => updateSetting("driveMode", "manual")}>
              <CarFront size={17} />
              <span>Manual</span>
            </button>
          </div>

          <div className="control-row">
            <label htmlFor="scenario">Scenario</label>
            <select
              id="scenario"
              className="wide-select"
              value={settings.scenario}
              onChange={(event) => updateSetting("scenario", event.target.value as Settings["scenario"])}
            >
              {Object.entries(scenarioLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="control-row">
            <label htmlFor="roadShape">Road</label>
            <select
              id="roadShape"
              className="wide-select"
              value={settings.roadShape}
              onChange={(event) => updateSetting("roadShape", event.target.value as Settings["roadShape"])}
            >
              <option value="straight">Straight road</option>
              <option value="curved">Curved road</option>
            </select>
          </div>

          <section className="preset-panel" aria-label="Training presets">
            <h2>Training Presets</h2>
            <div className="preset-grid">
              {trainingPresets.map((preset) => (
                <button key={preset.label} type="button" onClick={() => applyPreset(preset)}>
                  {preset.label}
                </button>
              ))}
            </div>
          </section>

          <div className="control-row">
            <label htmlFor="population">Population</label>
            <input
              id="population"
              type="number"
              min="1"
              max="500"
              step="1"
              value={settings.population}
              disabled={settings.driveMode === "manual"}
              onChange={(event) => updateSetting("population", clamp(Number(event.target.value), 1, 500))}
            />
          </div>

          <SliderControl
            id="traffic"
            label="Traffic"
            min={0}
            max={24}
            value={settings.traffic}
            suffix=""
            onChange={(value) => updateSetting("traffic", value)}
          />
          <div className="control-row">
            <label htmlFor="obstacleMode">Obstacles</label>
            <select
              id="obstacleMode"
              className="wide-select"
              value={settings.obstacleMode}
              onChange={(event) => updateSetting("obstacleMode", event.target.value as Settings["obstacleMode"])}
            >
              <option value="none">None</option>
              <option value="cones">Cones</option>
              <option value="stopped">Stopped cars</option>
              <option value="mixed">Mixed hazards</option>
            </select>
          </div>
          <SliderControl
            id="obstacleDensity"
            label="Obstacle density"
            min={0}
            max={8}
            value={settings.obstacleDensity}
            suffix=""
            onChange={(value) => updateSetting("obstacleDensity", value)}
          />
          <SliderControl
            id="mutation"
            label="Mutation"
            min={0}
            max={100}
            value={settings.mutation}
            suffix="%"
            disabled={settings.driveMode === "manual"}
            onChange={(value) => updateSetting("mutation", value)}
          />
          <SliderControl
            id="trainingSpeed"
            label="Training speed"
            min={1}
            max={18}
            value={settings.trainingSpeed}
            suffix="x"
            disabled={settings.driveMode === "manual"}
            onChange={(value) => updateSetting("trainingSpeed", value)}
          />
          <SliderControl
            id="eliteRate"
            label="Elite kept"
            min={2}
            max={30}
            value={settings.eliteRate}
            suffix="%"
            disabled={settings.driveMode === "manual"}
            onChange={(value) => updateSetting("eliteRate", value)}
          />
          <SliderControl
            id="crossoverRate"
            label="Crossover"
            min={0}
            max={100}
            value={settings.crossoverRate}
            suffix="%"
            disabled={settings.driveMode === "manual"}
            onChange={(value) => updateSetting("crossoverRate", value)}
          />
          <SliderControl
            id="sensorRays"
            label="Sensor rays"
            min={3}
            max={11}
            value={settings.sensorRays}
            suffix=""
            onChange={(value) => updateSetting("sensorRays", value)}
          />

          <div className="control-row">
            <label htmlFor="lanes">Lanes</label>
            <select id="lanes" value={settings.lanes} onChange={(event) => updateSetting("lanes", Number(event.target.value))}>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </div>

          <div className="stats-grid" aria-label="Telemetry">
            <Stat label="Generation" value={telemetry.generation} />
            <Stat label="Alive" value={telemetry.alive} />
            <Stat label="Best distance" value={`${telemetry.distance} m`} />
            <Stat label="Speed" value={`${telemetry.speed} km/h`} />
          </div>

          <div className="manual-hint" hidden={settings.driveMode !== "manual"}>
            <strong>Manual controls</strong>
            <span>Use W A S D or arrow keys.</span>
          </div>

          <section className="debug-panel" aria-label="Debug toggles">
            <h2>Debug View</h2>
            <ToggleControl label="Sensors" checked={settings.debug.sensors} onChange={(checked) => updateDebug("sensors", checked)} />
            <ToggleControl label="Replay path" checked={settings.debug.replayPath} onChange={(checked) => updateDebug("replayPath", checked)} />
            <ToggleControl label="Traffic" checked={settings.debug.traffic} onChange={(checked) => updateDebug("traffic", checked)} />
            <ToggleControl label="Collision boxes" checked={settings.debug.collisions} onChange={(checked) => updateDebug("collisions", checked)} />
            <ToggleControl label="Network" checked={settings.debug.network} onChange={(checked) => updateDebug("network", checked)} />
          </section>
        </aside>

        <section className="simulation-panel" aria-label="Road simulation">
          <canvas ref={carCanvasRef}></canvas>
        </section>

        <aside className="brain-panel" aria-label="Neural network">
          <div className="brain-header">
            <h2>Neural Network</h2>
            <span>{telemetry.storageState}</span>
          </div>
          <canvas ref={networkCanvasRef}></canvas>
          <div className="legend" aria-label="Network legend">
            <span>
              <i className="positive"></i>
              throttle
            </span>
            <span>
              <i className="negative"></i>
              brake / turn
            </span>
          </div>
          <TrainingDashboard telemetry={telemetry} />
          <TrainingGoals telemetry={telemetry} />
          <AutopilotConfidencePanel telemetry={telemetry} />
          <TrainingAnalytics telemetry={telemetry} />
          <ComparisonPanel comparison={comparison} onReset={resetComparison} />
          <AlgorithmExplanation scenario={settings.scenario} />
        </aside>
      </section>
      )}
    </main>
  );
}

type SliderControlProps = {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
  suffix: string;
  disabled?: boolean;
  onChange: (value: number) => void;
};

function SliderControl({ id, label, min, max, value, suffix, disabled = false, onChange }: SliderControlProps) {
  return (
    <div className="control-row">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{`${value}${suffix}`}</output>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step="1"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function ToggleControl({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TrainingDashboard({ telemetry }: { telemetry: Telemetry }) {
  const history = telemetry.history;
  const maxDistance = Math.max(1, ...history.map((sample) => sample.bestDistance));

  return (
    <section className="training-dashboard" aria-label="Training dashboard">
      <div className="dashboard-header">
        <h2>Training Dashboard</h2>
        <span>{telemetry.mode === "ai" ? "Genetic AI" : "Human drive"}</span>
      </div>
      <div className="metric-strip">
        <MiniMetric label="Best ever" value={`${telemetry.bestEverDistance} m`} />
        <MiniMetric label="Accuracy" value={`${telemetry.accuracyScore}%`} />
        <MiniMetric label="Average" value={`${telemetry.averageDistance} m`} />
        <MiniMetric label="Crash rate" value={`${telemetry.crashRate}%`} />
        <MiniMetric label="Mutation" value={`${telemetry.effectiveMutation}%`} />
        <MiniMetric label="Curriculum" value={`${telemetry.curriculumLevel}/5`} />
        <MiniMetric label="Elites" value={telemetry.eliteCount} />
        <MiniMetric label="Train ticks" value={compactNumber(telemetry.trainingSteps)} />
      </div>
      <div className="history-chart" aria-label="Generation best distance chart">
        {history.length === 0 ? (
          <div className="empty-chart">Waiting for generation data</div>
        ) : (
          history.map((sample) => <HistoryBar key={sample.generation} sample={sample} maxDistance={maxDistance} />)
        )}
      </div>
    </section>
  );
}

function TrainingGoals({ telemetry }: { telemetry: Telemetry }) {
  const latest = telemetry.history.at(-1);
  const safety = latest ? 100 - telemetry.crashRate : telemetry.alive > 0 ? 25 : 0;
  const goals = [
    { label: "Reach 1000m", value: telemetry.bestEverDistance, target: 1000, suffix: "m" },
    { label: "Accuracy 85%", value: telemetry.accuracyScore, target: 85, suffix: "%" },
    { label: "Safety 80%", value: safety, target: 80, suffix: "%" },
    { label: "Train 10k ticks", value: telemetry.trainingSteps, target: 10000, suffix: "" },
  ];

  return (
    <section className="goal-panel" aria-label="Training progress goals">
      <div className="dashboard-header">
        <h2>Training Goals</h2>
        <span>{goals.filter((goal) => goal.value >= goal.target).length}/{goals.length} done</span>
      </div>
      <div className="goal-list">
        {goals.map((goal) => (
          <GoalItem key={goal.label} goal={goal} />
        ))}
      </div>
    </section>
  );
}

function GoalItem({ goal }: { goal: { label: string; value: number; target: number; suffix: string } }) {
  const progress = clamp((goal.value / goal.target) * 100, 0, 100);
  const complete = progress >= 100;

  return (
    <div className={complete ? "goal-item complete" : "goal-item"}>
      <div>
        <span>{goal.label}</span>
        <strong>{complete ? "Complete" : `${Math.round(goal.value)}${goal.suffix} / ${goal.target}${goal.suffix}`}</strong>
      </div>
      <span className="goal-track">
        <i style={{ width: `${progress}%` }}></i>
      </span>
    </div>
  );
}

function AutopilotConfidencePanel({ telemetry }: { telemetry: Telemetry }) {
  const confidence = telemetry.autopilot;
  const activeCommand = [
    ["Throttle", confidence.throttle],
    ["Left", confidence.left],
    ["Right", confidence.right],
    ["Brake", confidence.brake],
  ].sort((a, b) => Number(b[1]) - Number(a[1]))[0];

  return (
    <section className="confidence-panel" aria-label="Autopilot confidence indicator">
      <div className="dashboard-header">
        <h2>Autopilot Confidence</h2>
        <span>{telemetry.mode === "ai" ? `${activeCommand[0]} ${activeCommand[1]}%` : "Manual"}</span>
      </div>
      <div className="confidence-list">
        <ConfidenceBar label="Throttle" value={confidence.throttle} tone="go" />
        <ConfidenceBar label="Left" value={confidence.left} tone="turn" />
        <ConfidenceBar label="Right" value={confidence.right} tone="turn" />
        <ConfidenceBar label="Brake" value={confidence.brake} tone="stop" />
        <ConfidenceBar label="Hazard" value={confidence.hazard} tone="warn" />
        <ConfidenceBar label="Left clear" value={confidence.leftClearance} tone="clear" />
        <ConfidenceBar label="Right clear" value={confidence.rightClearance} tone="clear" />
      </div>
    </section>
  );
}

function ConfidenceBar({ label, value, tone }: { label: string; value: number; tone: "go" | "turn" | "stop" | "warn" | "clear" }) {
  return (
    <div className="confidence-row">
      <div>
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <span className={`confidence-track ${tone}`}>
        <i style={{ width: `${clamp(value, 0, 100)}%` }}></i>
      </span>
    </div>
  );
}

function TrainingAnalytics({ telemetry }: { telemetry: Telemetry }) {
  const history = telemetry.history.slice(-24);

  return (
    <section className="analytics-panel" aria-label="Training analytics graphs">
      <div className="dashboard-header">
        <h2>Analytics</h2>
        <span>{history.length} gens</span>
      </div>
      <div className="analytics-grid">
        <AnalyticsChart title="Best distance" samples={history} value={(sample) => sample.bestDistance} suffix="m" tone="distance" />
        <AnalyticsChart title="Average" samples={history} value={(sample) => sample.averageDistance} suffix="m" tone="average" />
        <AnalyticsChart title="Safety" samples={history} value={(sample) => 100 - sample.crashRate} suffix="%" tone="safety" max={100} />
        <AnalyticsChart title="Accuracy" samples={history} value={(sample) => sample.accuracyScore} suffix="%" tone="accuracy" max={100} />
      </div>
    </section>
  );
}

function AnalyticsChart({
  title,
  samples,
  value,
  suffix,
  tone,
  max,
}: {
  title: string;
  samples: TrainingSample[];
  value: (sample: TrainingSample) => number;
  suffix: string;
  tone: "distance" | "average" | "safety" | "accuracy";
  max?: number;
}) {
  const values = samples.map(value);
  const graphMax = Math.max(1, max ?? Math.max(...values));
  const latest = values.at(-1) ?? 0;

  return (
    <article className="analytics-card">
      <div>
        <span>{title}</span>
        <strong>{Math.round(latest)}{suffix}</strong>
      </div>
      <div className="spark-chart">
        {samples.length === 0 ? (
          <small>Waiting</small>
        ) : (
          values.map((sampleValue, index) => <i className={tone} key={`${title}-${index}`} style={{ height: `${Math.max(8, (sampleValue / graphMax) * 100)}%` }}></i>)
        )}
      </div>
    </article>
  );
}

function ComparisonPanel({ comparison, onReset }: { comparison: ComparisonSnapshot; onReset: () => void }) {
  const leaderText = comparison.leader === "tie" ? "Tie" : comparison.leader === "ai" ? "AI leads" : "Manual leads";
  const manualSafety = comparison.manualCrashed ? "Crashed" : comparison.manualDistance > 0 ? "Clean run" : "Not tested";

  return (
    <section className="comparison-panel" aria-label="Manual and AI comparison">
      <div className="dashboard-header">
        <h2>Manual vs AI</h2>
        <button className="text-button" type="button" onClick={onReset}>
          Reset
        </button>
      </div>
      <div className="winner-row">
        <span>Current leader</span>
        <strong>{leaderText}</strong>
      </div>
      <div className="comparison-grid">
        <ComparisonCard title="AI trained" distance={comparison.aiDistance} speed={comparison.aiSpeed} safety={`${comparison.aiCrashRate}% crash`} detail={`${comparison.aiAccuracy}% accuracy`} active={comparison.leader === "ai"} />
        <ComparisonCard
          title="Manual drive"
          distance={comparison.manualDistance}
          speed={comparison.manualSpeed}
          safety={manualSafety}
          detail={comparison.manualDistance > 0 ? "Human baseline" : "Drive to compare"}
          active={comparison.leader === "manual"}
        />
      </div>
    </section>
  );
}

function ComparisonCard({ title, distance, speed, safety, detail, active }: { title: string; distance: number; speed: number; safety: string; detail: string; active: boolean }) {
  return (
    <article className={active ? "comparison-card active" : "comparison-card"}>
      <div>
        <span>{title}</span>
        <strong>{distance} m</strong>
      </div>
      <dl>
        <div>
          <dt>Speed</dt>
          <dd>{speed} km/h</dd>
        </div>
        <div>
          <dt>Safety</dt>
          <dd>{safety}</dd>
        </div>
        <div>
          <dt>Result</dt>
          <dd>{detail}</dd>
        </div>
      </dl>
    </article>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function HistoryBar({ sample, maxDistance }: { sample: TrainingSample; maxDistance: number }) {
  const height = Math.max(10, Math.round((sample.bestDistance / maxDistance) * 100));

  return (
    <div className="history-item" title={`Gen ${sample.generation}: ${sample.bestDistance}m best, ${sample.averageDistance}m avg`}>
      <span className="history-bar" style={{ height: `${height}%` }}></span>
      <small>{sample.generation}</small>
    </div>
  );
}

function compactNumber(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value;
}

function AlgorithmExplanation({ scenario }: { scenario: Settings["scenario"] }) {
  return (
    <section className="algorithm-panel" aria-label="Algorithm explanation">
      <div className="dashboard-header">
        <h2>Algorithm</h2>
        <span>{scenarioLabels[scenario]}</span>
      </div>
      <div className="algorithm-grid">
        <ExplanationItem title="Sensors" body="Ray sensors estimate nearby road edges and traffic; shorter rays mean higher danger." />
        <ExplanationItem title="Network" body="Sensor readings feed a small neural network that chooses throttle, left, right, and brake." />
        <ExplanationItem title="Fitness" body="Cars score higher for distance, survival, speed, lane discipline, smooth steering, and clearance." />
        <ExplanationItem title="Evolution" body="Top cars survive as elites; the next generation mixes parent brains, then mutates weaker copies." />
      </div>
    </section>
  );
}

function ExplanationItem({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function isBrainShape(value: unknown): value is BrainShape {
  if (!value || typeof value !== "object" || !("levels" in value)) return false;
  const levels = (value as BrainShape).levels;
  return Array.isArray(levels) && levels.every((level) => Array.isArray(level.inputs) && Array.isArray(level.outputs) && Array.isArray(level.biases) && Array.isArray(level.weights));
}

function isImportPayload(value: unknown): value is { brain: BrainShape } {
  return Boolean(value && typeof value === "object" && "brain" in value && isBrainShape((value as { brain?: unknown }).brain));
}

function ProjectReport({ telemetry, settings, comparison }: { telemetry: Telemetry; settings: Settings; comparison: ComparisonSnapshot }) {
  const leaderText = comparison.leader === "tie" ? "Tie" : comparison.leader === "ai" ? "AI model" : "Manual driver";

  return (
    <section className="report-page" aria-label="Project report">
      <header className="report-hero">
        <div>
          <p className="eyebrow">Project report</p>
          <h2>Self Driving Car Simulation</h2>
        </div>
        <div className="report-badges">
        <span>{scenarioLabels[settings.scenario]}</span>
        <span>{settings.roadShape === "curved" ? "Curved road" : "Straight road"}</span>
        <span>{settings.obstacleMode === "none" ? "No hazards" : `${settings.obstacleDensity} hazard level`}</span>
        <span>{telemetry.accuracyScore}% accuracy</span>
      </div>
      </header>

      <div className="report-grid">
        <ReportSection
          icon={<Route size={18} />}
          title="Objective"
          body="Build an interactive autonomous-driving simulator where virtual cars learn lane keeping, traffic avoidance, and safe forward progress."
        />
        <ReportSection
          icon={<BrainCircuit size={18} />}
          title="Methodology"
          body="Cars sense road borders and traffic with ray sensors. A neural network converts sensor readings into driving controls, and a genetic algorithm evolves better networks over generations."
        />
        <ReportSection
          icon={<Film size={18} />}
          title="Replay"
          body="The simulator records the best run path when a new best model is found, then overlays that path and an animated replay vehicle for presentation."
        />
      </div>

      <div className="report-metrics">
        <MiniMetric label="Best distance" value={`${telemetry.bestEverDistance} m`} />
        <MiniMetric label="Average" value={`${telemetry.averageDistance} m`} />
        <MiniMetric label="Crash rate" value={`${telemetry.crashRate}%`} />
        <MiniMetric label="Training ticks" value={compactNumber(telemetry.trainingSteps)} />
      </div>

      <section className="report-section-wide">
        <h2>Manual vs AI Comparison</h2>
        <div className="report-metrics comparison-report">
          <MiniMetric label="AI distance" value={`${comparison.aiDistance} m`} />
          <MiniMetric label="Manual distance" value={`${comparison.manualDistance} m`} />
          <MiniMetric label="AI accuracy" value={`${comparison.aiAccuracy}%`} />
          <MiniMetric label="Winner" value={leaderText} />
        </div>
      </section>

      <section className="report-section-wide">
        <h2>Tech Stack</h2>
        <p>Vite, React, TypeScript, Canvas 2D, localStorage model persistence, and a custom genetic neural-network simulation engine.</p>
      </section>

      <section className="report-section-wide">
        <h2>Conclusion</h2>
        <p>
          The project demonstrates autonomous-control fundamentals: perception through sensors, decision making through a neural network, and model improvement through
          selection, crossover, mutation, replay, scenario testing, and performance metrics.
        </p>
      </section>
    </section>
  );
}

function ReportSection({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <article>
      <div className="report-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{body}</p>
    </article>
  );
}
