export type Point = {
  x: number;
  y: number;
  offset?: number;
};

export type Segment = [Point, Point];

export type ControlType = "AI" | "DUMMY" | "MANUAL";

export type DriveMode = "ai" | "manual";

export type ScenarioMode = "easy" | "balanced" | "dense" | "blockers" | "fast";

export type RoadShape = "straight" | "curved";

export type ObstacleMode = "none" | "cones" | "stopped" | "mixed";

export type DebugOptions = {
  sensors: boolean;
  replayPath: boolean;
  traffic: boolean;
  collisions: boolean;
  network: boolean;
};

export type Settings = {
  population: number;
  traffic: number;
  obstacleDensity: number;
  mutation: number;
  sensorRays: number;
  lanes: number;
  driveMode: DriveMode;
  scenario: ScenarioMode;
  obstacleMode: ObstacleMode;
  roadShape: RoadShape;
  eliteRate: number;
  crossoverRate: number;
  trainingSpeed: number;
  debug: DebugOptions;
};

export type Telemetry = {
  generation: number;
  alive: number;
  distance: number;
  speed: number;
  currentCrashed: boolean;
  autopilot: AutopilotConfidence;
  storageState: string;
  mode: DriveMode;
  bestEverDistance: number;
  averageDistance: number;
  crashRate: number;
  eliteCount: number;
  accuracyScore: number;
  effectiveMutation: number;
  stagnantGenerations: number;
  trainingSteps: number;
  curriculumLevel: number;
  hasReplay: boolean;
  replaying: boolean;
  history: TrainingSample[];
};

export type AutopilotConfidence = {
  throttle: number;
  left: number;
  right: number;
  brake: number;
  hazard: number;
  leftClearance: number;
  rightClearance: number;
};

export type ReplayFrame = {
  x: number;
  y: number;
  angle: number;
  speed: number;
};

export type ObstacleType = "cone" | "stopped-car" | "roadblock";

type ScenarioConfig = {
  trafficMultiplier: number;
  spacing: number;
  speedBase: number;
  speedStep: number;
  jitter: number;
  blockerEvery?: number;
};

export const scenarioLabels: Record<ScenarioMode, string> = {
  easy: "Easy road",
  balanced: "Balanced traffic",
  dense: "Dense traffic",
  blockers: "Lane blockers",
  fast: "High-speed traffic",
};

const scenarioConfigs: Record<ScenarioMode, ScenarioConfig> = {
  easy: {
    trafficMultiplier: 0.55,
    spacing: 260,
    speedBase: 1.05,
    speedStep: 0.09,
    jitter: 130,
  },
  balanced: {
    trafficMultiplier: 1,
    spacing: 190,
    speedBase: 1.25,
    speedStep: 0.16,
    jitter: 90,
  },
  dense: {
    trafficMultiplier: 1.6,
    spacing: 145,
    speedBase: 1.15,
    speedStep: 0.1,
    jitter: 60,
  },
  blockers: {
    trafficMultiplier: 1.25,
    spacing: 165,
    speedBase: 1.08,
    speedStep: 0.08,
    jitter: 45,
    blockerEvery: 4,
  },
  fast: {
    trafficMultiplier: 1.05,
    spacing: 215,
    speedBase: 1.75,
    speedStep: 0.28,
    jitter: 110,
  },
};

export type TrainingSample = {
  generation: number;
  bestDistance: number;
  averageDistance: number;
  crashRate: number;
  survivalRate: number;
  accuracyScore: number;
};

export type ManualControls = {
  forward: boolean;
  left: boolean;
  right: boolean;
  reverse: boolean;
};

export type LevelShape = {
  inputs: number[];
  outputs: number[];
  biases: number[];
  weights: number[][];
};

export type BrainShape = {
  levels: LevelShape[];
};

export const storageKey = "self-driving-car-best-brain";
export const trainingStateKey = "self-driving-car-training-state";

type TrainingSnapshot = {
  version: number;
  generation: number;
  parentBrains: BrainShape[];
  bestEverBrain: BrainShape | null;
  bestEverDistance: number;
  averageDistance: number;
  crashRate: number;
  accuracyScore: number;
  effectiveMutation: number;
  stagnantGenerations: number;
  trainingSteps: number;
  curriculumLevel: number;
  bestReplay: ReplayFrame[];
  history: TrainingSample[];
};

export class Controls {
  forward = false;
  left = false;
  right = false;
  reverse = false;

  constructor(type: ControlType) {
    if (type === "DUMMY") {
      this.forward = true;
    }
  }
}

export class Road {
  x: number;
  width: number;
  laneCount: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  borders: Segment[];
  shape: RoadShape;
  curveAmplitude: number;
  curveFrequency = 760;

  constructor(x: number, width: number, laneCount = 3, shape: RoadShape = "straight") {
    this.x = x;
    this.width = width;
    this.laneCount = laneCount;
    this.shape = shape;
    this.curveAmplitude = shape === "curved" ? Math.min(95, width * 0.24) : 0;
    this.left = this.edgeAt(0, -1);
    this.right = this.edgeAt(0, 1);

    this.top = -9000;
    this.bottom = 1800;
    this.borders = [];
    this.rebuildBorders(0);
  }

  centerAt(y: number) {
    if (this.shape === "straight") return this.x;
    return this.x + Math.sin(y / this.curveFrequency) * this.curveAmplitude + Math.sin(y / (this.curveFrequency * 0.43)) * this.curveAmplitude * 0.28;
  }

  edgeAt(y: number, side: -1 | 1) {
    return this.centerAt(y) + side * (this.width / 2);
  }

  rebuildBorders(referenceY: number) {
    const top = Math.floor((referenceY - 9000) / 120) * 120;
    const bottom = Math.ceil((referenceY + 1800) / 120) * 120;
    this.top = top;
    this.bottom = bottom;
    this.borders = [this.buildEdgeSegments(-1), this.buildEdgeSegments(1)].flat();
  }

  buildEdgeSegments(side: -1 | 1) {
    const segments: Segment[] = [];
    let previous: Point | null = null;
    for (let y = this.top; y <= this.bottom; y += 120) {
      const point = { x: this.edgeAt(y, side), y };
      if (previous) segments.push([previous, point]);
      previous = point;
    }
    return segments;
  }

  getLaneCenter(laneIndex: number, y = 0) {
    const laneWidth = this.width / this.laneCount;
    return this.edgeAt(y, -1) + laneWidth / 2 + Math.min(laneIndex, this.laneCount - 1) * laneWidth;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#edf1e8";

    for (let i = 1; i <= this.laneCount - 1; i += 1) {
      ctx.setLineDash([20, 20]);
      ctx.beginPath();
      for (let y = this.top; y <= this.bottom; y += 80) {
        const x = lerp(this.edgeAt(y, -1), this.edgeAt(y, 1), i / this.laneCount);
        if (y === this.top) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.lineWidth = 5;
    this.borders.forEach((border) => {
      ctx.beginPath();
      ctx.moveTo(border[0].x, border[0].y);
      ctx.lineTo(border[1].x, border[1].y);
      ctx.stroke();
    });
  }
}

export class Sensor {
  car: Car;
  rayCount: number;
  rayLength = 240;
  raySpread = Math.PI / 1.18;
  rays: Segment[] = [];
  readings: Array<Point | null> = [];

  constructor(car: Car, rayCount: number) {
    this.car = car;
    this.rayCount = rayCount;
  }

  update(roadBorders: Segment[], trafficCars: Car[], obstacles: Obstacle[] = []) {
    this.castRays();
    this.readings = this.rays.map((ray) => this.getReading(ray, roadBorders, trafficCars, obstacles));
  }

  getReading(ray: Segment, roadBorders: Segment[], trafficCars: Car[], obstacles: Obstacle[]) {
    const touches: Point[] = [];

    roadBorders.forEach((border) => {
      const touch = getIntersection(ray[0], ray[1], border[0], border[1]);
      if (touch) touches.push(touch);
    });

    trafficCars.forEach((vehicle) => {
      const poly = vehicle.polygon;
      for (let i = 0; i < poly.length; i += 1) {
        const value = getIntersection(ray[0], ray[1], poly[i], poly[(i + 1) % poly.length]);
        if (value) touches.push(value);
      }
    });

    obstacles.forEach((obstacle) => {
      for (let i = 0; i < obstacle.polygon.length; i += 1) {
        const value = getIntersection(ray[0], ray[1], obstacle.polygon[i], obstacle.polygon[(i + 1) % obstacle.polygon.length]);
        if (value) touches.push(value);
      }
    });

    if (touches.length === 0) return null;
    const offsets = touches.map((touch) => touch.offset ?? 0);
    const minOffset = Math.min(...offsets);
    return touches.find((touch) => touch.offset === minOffset) ?? null;
  }

  castRays() {
    this.rays = [];
    for (let i = 0; i < this.rayCount; i += 1) {
      const rayAngle =
        lerp(this.raySpread / 2, -this.raySpread / 2, this.rayCount === 1 ? 0.5 : i / (this.rayCount - 1)) +
        this.car.angle;

      const start = { x: this.car.x, y: this.car.y };
      const end = {
        x: this.car.x - Math.sin(rayAngle) * this.rayLength,
        y: this.car.y - Math.cos(rayAngle) * this.rayLength,
      };
      this.rays.push([start, end]);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (let i = 0; i < this.rayCount; i += 1) {
      const ray = this.rays[i];
      if (!ray) continue;

      let end = ray[1];
      const reading = this.readings[i];
      if (reading) end = reading;

      ctx.lineWidth = 2;
      ctx.strokeStyle = "#e8b448";
      ctx.beginPath();
      ctx.moveTo(ray[0].x, ray[0].y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      ctx.strokeStyle = "#4f5661";
      ctx.beginPath();
      ctx.moveTo(ray[1].x, ray[1].y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
  }
}

export class Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  type: ObstacleType;
  laneIndex: number;
  polygon: Point[];

  constructor(x: number, y: number, type: ObstacleType, laneIndex: number, angle = 0) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.laneIndex = laneIndex;
    this.angle = angle;
    this.width = type === "roadblock" ? 58 : type === "stopped-car" ? 32 : 24;
    this.height = type === "roadblock" ? 24 : type === "stopped-car" ? 54 : 28;
    this.polygon = this.createPolygon();
  }

  updatePosition(x: number, y: number, angle: number) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.polygon = this.createPolygon();
  }

  createPolygon() {
    const points: Point[] = [];
    const radius = Math.hypot(this.width, this.height) / 2;
    const alpha = Math.atan2(this.width, this.height);

    points.push({
      x: this.x - Math.sin(this.angle - alpha) * radius,
      y: this.y - Math.cos(this.angle - alpha) * radius,
    });
    points.push({
      x: this.x - Math.sin(this.angle + alpha) * radius,
      y: this.y - Math.cos(this.angle + alpha) * radius,
    });
    points.push({
      x: this.x - Math.sin(Math.PI + this.angle - alpha) * radius,
      y: this.y - Math.cos(Math.PI + this.angle - alpha) * radius,
    });
    points.push({
      x: this.x - Math.sin(Math.PI + this.angle + alpha) * radius,
      y: this.y - Math.cos(Math.PI + this.angle + alpha) * radius,
    });

    return points;
  }

  draw(ctx: CanvasRenderingContext2D, showCollision = false) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(-this.angle);

    if (this.type === "cone") {
      ctx.fillStyle = "#e06f2f";
      ctx.beginPath();
      ctx.moveTo(0, -this.height / 2);
      ctx.lineTo(-this.width / 2, this.height / 2);
      ctx.lineTo(this.width / 2, this.height / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f6f0d8";
      ctx.fillRect(-this.width * 0.28, this.height * 0.08, this.width * 0.56, 4);
    } else {
      ctx.fillStyle = this.type === "roadblock" ? "#b84545" : "#536170";
      roundRect(ctx, -this.width / 2, -this.height / 2, this.width, this.height, 6);
      ctx.fill();
      ctx.fillStyle = "#f1c84b";
      ctx.fillRect(-this.width * 0.35, -this.height * 0.12, this.width * 0.7, 5);
    }

    ctx.restore();

    if (showCollision) {
      drawPolygon(ctx, this.polygon, "rgba(201, 75, 75, 0.75)", 2);
    }
  }
}

export class Car {
  x: number;
  y: number;
  width: number;
  height: number;
  speed = 0;
  acceleration = 0.22;
  maxSpeed: number;
  friction = 0.045;
  angle = 0;
  damaged = false;
  color: string;
  controls: Controls;
  useBrain: boolean;
  polygon: Point[] = [];
  ticksAlive = 0;
  speedTotal = 0;
  hazardSpeedTotal = 0;
  steeringTotal = 0;
  brakeTicks = 0;
  hazardBrakeTicks = 0;
  closestSensorReading = 0;
  frontHazard = 0;
  leftClearance = 1;
  rightClearance = 1;
  autopilotConfidence: AutopilotConfidence = {
    throttle: 0,
    left: 0,
    right: 0,
    brake: 0,
    hazard: 0,
    leftClearance: 100,
    rightClearance: 100,
  };
  laneIndex = 0;
  path: ReplayFrame[] = [];
  sensor?: Sensor;
  brain?: BrainShape;

  constructor(x: number, y: number, width: number, height: number, controlType: ControlType, maxSpeed = 3, color = "#008b8b", rayCount = 7) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.maxSpeed = maxSpeed;
    this.color = color;
    this.controls = new Controls(controlType);
    this.useBrain = controlType === "AI";
    this.polygon = this.createPolygon();

    if (controlType !== "DUMMY") {
      this.sensor = new Sensor(this, rayCount);
    }

    if (controlType === "AI") {
      this.brain = new NeuralNetwork([rayCount + 1, 10, 7, 4]);
    }
  }

  update(roadBorders: Segment[], trafficCars: Car[], obstacles: Obstacle[] = []) {
    if (!this.damaged) {
      this.move();
      this.ticksAlive += 1;
      this.speedTotal += Math.max(0, this.speed);
      this.steeringTotal += Math.abs(this.angle);
      if (this.ticksAlive % 4 === 0) {
        this.path.push({ x: this.x, y: this.y, angle: this.angle, speed: this.speed });
        if (this.path.length > 1600) this.path.shift();
      }
      this.polygon = this.createPolygon();
      this.damaged = this.assessDamage(roadBorders, trafficCars, obstacles);
    }

    if (this.damaged) return;

    if (this.sensor) {
      this.sensor.update(roadBorders, trafficCars, obstacles);
      const sensorValues = this.sensor.readings.map((reading) => (reading === null ? 0 : 1 - (reading.offset ?? 0)));
      const middle = Math.floor(sensorValues.length / 2);
      const leftValues = sensorValues.slice(0, middle);
      const rightValues = sensorValues.slice(middle + 1);
      this.closestSensorReading = Math.max(0, ...sensorValues);
      this.frontHazard = Math.max(sensorValues[middle] ?? 0, sensorValues[middle - 1] ?? 0, sensorValues[middle + 1] ?? 0);
      this.leftClearance = 1 - Math.max(0, ...leftValues);
      this.rightClearance = 1 - Math.max(0, ...rightValues);
      this.hazardSpeedTotal += this.frontHazard * Math.max(0, this.speed);

      if (this.useBrain && this.brain) {
        const speedInput = clamp(Math.abs(this.speed) / this.maxSpeed, 0, 1);
        const outputs = NeuralNetwork.feedForward([...sensorValues, speedInput], this.brain);
        this.controls.forward = outputs[0] > 0.5;
        this.controls.left = outputs[1] > 0.5;
        this.controls.right = outputs[2] > 0.5;
        this.controls.reverse = outputs[3] > 0.5;

        if (this.frontHazard > 0.58 && this.speed > this.maxSpeed * 0.42) {
          this.controls.forward = false;
          this.controls.reverse = true;
        }

        if (this.frontHazard > 0.72) {
          this.controls.forward = false;
          this.controls.reverse = true;
          this.controls.left = this.leftClearance > this.rightClearance;
          this.controls.right = this.rightClearance >= this.leftClearance;
        }

        if (this.controls.reverse) {
          this.brakeTicks += 1;
          if (this.frontHazard > 0.45) this.hazardBrakeTicks += 1;
        }

        this.autopilotConfidence = {
          throttle: this.controls.forward ? Math.max(65, Math.round(outputs[0] * 100)) : Math.round(outputs[0] * 35),
          left: this.controls.left ? 100 : Math.round(outputs[1] * 100),
          right: this.controls.right ? 100 : Math.round(outputs[2] * 100),
          brake: this.controls.reverse ? Math.max(70, Math.round(this.frontHazard * 100)) : Math.round(outputs[3] * 100),
          hazard: Math.round(this.frontHazard * 100),
          leftClearance: Math.round(this.leftClearance * 100),
          rightClearance: Math.round(this.rightClearance * 100),
        };
      }
    }
  }

  assessDamage(roadBorders: Segment[], trafficCars: Car[], obstacles: Obstacle[]) {
    for (let i = 0; i < roadBorders.length; i += 1) {
      if (polysIntersect(this.polygon, roadBorders[i])) return true;
    }

    for (let i = 0; i < trafficCars.length; i += 1) {
      if (polysIntersect(this.polygon, trafficCars[i].polygon)) return true;
    }

    for (let i = 0; i < obstacles.length; i += 1) {
      if (polysIntersect(this.polygon, obstacles[i].polygon)) return true;
    }

    return false;
  }

  createPolygon() {
    const points: Point[] = [];
    const radius = Math.hypot(this.width, this.height) / 2;
    const alpha = Math.atan2(this.width, this.height);

    points.push({
      x: this.x - Math.sin(this.angle - alpha) * radius,
      y: this.y - Math.cos(this.angle - alpha) * radius,
    });
    points.push({
      x: this.x - Math.sin(this.angle + alpha) * radius,
      y: this.y - Math.cos(this.angle + alpha) * radius,
    });
    points.push({
      x: this.x - Math.sin(Math.PI + this.angle - alpha) * radius,
      y: this.y - Math.cos(Math.PI + this.angle - alpha) * radius,
    });
    points.push({
      x: this.x - Math.sin(Math.PI + this.angle + alpha) * radius,
      y: this.y - Math.cos(Math.PI + this.angle + alpha) * radius,
    });

    return points;
  }

  move() {
    if (this.controls.forward) this.speed += this.acceleration;
    if (this.controls.reverse) this.speed -= this.acceleration;

    if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;
    if (this.speed < -this.maxSpeed / 2) this.speed = -this.maxSpeed / 2;

    if (this.speed > 0) this.speed -= this.friction;
    if (this.speed < 0) this.speed += this.friction;
    if (Math.abs(this.speed) < this.friction) this.speed = 0;

    if (this.speed !== 0) {
      const flip = this.speed > 0 ? 1 : -1;
      if (this.controls.left) this.angle += 0.032 * flip;
      if (this.controls.right) this.angle -= 0.032 * flip;
    }

    this.x -= Math.sin(this.angle) * this.speed;
    this.y -= Math.cos(this.angle) * this.speed;
  }

  draw(ctx: CanvasRenderingContext2D, drawSensor = false, showCollision = false) {
    if (this.sensor && drawSensor) {
      this.sensor.draw(ctx);
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(-this.angle);

    ctx.fillStyle = this.damaged ? "rgba(120, 126, 132, 0.6)" : this.color;
    roundRect(ctx, -this.width / 2, -this.height / 2, this.width, this.height, 7);
    ctx.fill();

    ctx.fillStyle = this.damaged ? "rgba(72, 76, 80, 0.6)" : "#f2f5ed";
    roundRect(ctx, -this.width * 0.31, -this.height * 0.28, this.width * 0.62, this.height * 0.25, 4);
    ctx.fill();

    ctx.fillStyle = this.damaged ? "rgba(65, 69, 74, 0.6)" : "#11161a";
    ctx.fillRect(-this.width * 0.52, -this.height * 0.28, 5, this.height * 0.26);
    ctx.fillRect(this.width * 0.38, -this.height * 0.28, 5, this.height * 0.26);
    ctx.fillRect(-this.width * 0.52, this.height * 0.12, 5, this.height * 0.26);
    ctx.fillRect(this.width * 0.38, this.height * 0.12, 5, this.height * 0.26);

    ctx.fillStyle = "#f1c84b";
    ctx.fillRect(-this.width * 0.32, -this.height * 0.51, 8, 4);
    ctx.fillRect(this.width * 0.18, -this.height * 0.51, 8, 4);

    ctx.restore();

    if (showCollision) {
      drawPolygon(ctx, this.polygon, this.damaged ? "rgba(201, 75, 75, 0.88)" : "rgba(0, 139, 139, 0.7)", 2);
    }
  }
}

export class NeuralNetwork implements BrainShape {
  levels: Level[];

  constructor(neuronCounts: number[]) {
    this.levels = [];
    for (let i = 0; i < neuronCounts.length - 1; i += 1) {
      this.levels.push(new Level(neuronCounts[i], neuronCounts[i + 1]));
    }
  }

  static feedForward(givenInputs: number[], network: BrainShape) {
    let outputs = Level.feedForward(givenInputs, network.levels[0]);
    for (let i = 1; i < network.levels.length; i += 1) {
      outputs = Level.feedForward(outputs, network.levels[i]);
    }
    return outputs;
  }

  static mutate(network: BrainShape, amount = 1) {
    network.levels.forEach((level) => {
      level.biases = level.biases.map((bias) => lerp(bias, Math.random() * 2 - 1, amount));
      level.weights = level.weights.map((weights) =>
        weights.map((weight) => lerp(weight, Math.random() * 2 - 1, amount)),
      );
    });
  }
}

export class Level implements LevelShape {
  inputs: number[];
  outputs: number[];
  biases: number[];
  weights: number[][];

  constructor(inputCount: number, outputCount: number) {
    this.inputs = new Array(inputCount);
    this.outputs = new Array(outputCount);
    this.biases = new Array(outputCount);
    this.weights = Array.from({ length: inputCount }, () => new Array(outputCount));
    Level.randomize(this);
  }

  static randomize(level: LevelShape) {
    for (let i = 0; i < level.inputs.length; i += 1) {
      for (let j = 0; j < level.outputs.length; j += 1) {
        level.weights[i][j] = Math.random() * 2 - 1;
      }
    }

    for (let i = 0; i < level.biases.length; i += 1) {
      level.biases[i] = Math.random() * 2 - 1;
    }
  }

  static feedForward(givenInputs: number[], level: LevelShape) {
    for (let i = 0; i < level.inputs.length; i += 1) {
      level.inputs[i] = givenInputs[i] ?? 0;
    }

    for (let i = 0; i < level.outputs.length; i += 1) {
      let sum = 0;
      for (let j = 0; j < level.inputs.length; j += 1) {
        sum += level.inputs[j] * (level.weights[j]?.[i] ?? 0);
      }
      level.outputs[i] = sum > level.biases[i] ? 1 : 0;
    }

    return level.outputs;
  }
}

export class Visualizer {
  static drawNetwork(ctx: CanvasRenderingContext2D, network: BrainShape, displayWidth: number, displayHeight: number) {
    const margin = 28;
    const left = margin;
    const top = margin;
    const width = displayWidth - margin * 2;
    const height = displayHeight - margin * 2;
    const levelHeight = height / network.levels.length;

    for (let i = network.levels.length - 1; i >= 0; i -= 1) {
      const levelTop = top + lerp(height - levelHeight, 0, network.levels.length === 1 ? 0.5 : i / (network.levels.length - 1));
      ctx.setLineDash([7, 3]);
      Visualizer.drawLevel(ctx, network.levels[i], left, levelTop, width, levelHeight, i === network.levels.length - 1);
    }
  }

  static drawLevel(ctx: CanvasRenderingContext2D, level: LevelShape, left: number, top: number, width: number, height: number, outputLevel: boolean) {
    const right = left + width;
    const bottom = top + height;
    const nodeRadius = 16;

    for (let i = 0; i < level.inputs.length; i += 1) {
      for (let j = 0; j < level.outputs.length; j += 1) {
        ctx.beginPath();
        ctx.moveTo(Visualizer.getNodeX(level.inputs, i, left, right), bottom);
        ctx.lineTo(Visualizer.getNodeX(level.outputs, j, left, right), top);
        ctx.lineWidth = 2;
        ctx.strokeStyle = getRgba(level.weights[i][j]);
        ctx.stroke();
      }
    }

    for (let i = 0; i < level.inputs.length; i += 1) {
      const x = Visualizer.getNodeX(level.inputs, i, left, right);
      ctx.beginPath();
      ctx.arc(x, bottom, nodeRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#11161a";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, bottom, nodeRadius * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = getRgba(level.inputs[i]);
      ctx.fill();
    }

    const labels = ["F", "L", "R", "B"];
    for (let i = 0; i < level.outputs.length; i += 1) {
      const x = Visualizer.getNodeX(level.outputs, i, left, right);
      ctx.beginPath();
      ctx.arc(x, top, nodeRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#11161a";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, top, nodeRadius * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = getRgba(level.outputs[i]);
      ctx.fill();
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.arc(x, top, nodeRadius * 0.82, 0, Math.PI * 2);
      ctx.strokeStyle = getRgba(level.biases[i]);
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      if (outputLevel) {
        ctx.fillStyle = "#eef1eb";
        ctx.font = `${nodeRadius * 1.2}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(labels[i] ?? "", x, top + 1);
      }
    }
  }

  static getNodeX(nodes: number[], index: number, left: number, right: number) {
    return lerp(left, right, nodes.length === 1 ? 0.5 : index / (nodes.length - 1));
  }
}

export class Simulation {
  road: Road;
  cars: Car[];
  traffic: Car[];
  obstacles: Obstacle[] = [];
  bestCar: Car;
  generation = 1;
  generationStartY = 0;
  storageState = "Unsaved";
  settings: Settings;
  displayWidth: number;
  parentBrains: BrainShape[] = [];
  bestEverBrain: BrainShape | null = null;
  bestEverDistance = 0;
  averageDistance = 0;
  crashRate = 0;
  accuracyScore = 0;
  effectiveMutation = 0;
  stagnantGenerations = 0;
  trainingSteps = 0;
  curriculumLevel = 1;
  bestReplay: ReplayFrame[] = [];
  replaying = false;
  replayIndex = 0;
  history: TrainingSample[] = [];
  manualControls: ManualControls = {
    forward: false,
    left: false,
    right: false,
    reverse: false,
  };

  constructor(settings: Settings, displayWidth: number) {
    this.settings = settings;
    this.displayWidth = displayWidth;
    this.effectiveMutation = settings.mutation;
    this.road = this.createRoad();
    this.cars = [];
    this.traffic = [];
    this.bestCar = new Car(0, 0, 30, 52, "AI");
    const restored = this.restoreTrainingState();
    this.reset(false);
    if (restored) this.storageState = "Restored";
  }

  createRoad() {
    const roadWidth = Math.min(420, Math.max(280, this.displayWidth * 0.58));
    return new Road(this.displayWidth / 2, roadWidth, this.settings.lanes, this.settings.roadShape);
  }

  reset(advanceGeneration = false) {
    this.road = this.createRoad();
    this.cars = this.generateCars();
    this.traffic = this.generateTraffic();
    this.obstacles = this.generateObstacles();
    this.generation += advanceGeneration ? 1 : 0;
    this.generationStartY = this.cars[0].y;
    this.bestCar = this.cars[0];
    this.applyBrainSeed();
  }

  updateSettings(settings: Settings, displayWidth: number) {
    this.settings = settings;
    this.displayWidth = displayWidth;
    this.reset(false);
  }

  restoreTrainingState() {
    if (this.settings.driveMode === "manual") return false;

    const snapshot = loadTrainingSnapshot();
    if (!snapshot) return false;

    const bestEverBrain = snapshot.bestEverBrain ? normalizeBrainInputs(snapshot.bestEverBrain, this.brainInputTarget()) : null;
    let parentBrains = snapshot.parentBrains
      .map((brain) => normalizeBrainInputs(brain, this.brainInputTarget()))
      .filter((brain): brain is BrainShape => Boolean(brain))
      .slice(0, 36);
    if (parentBrains.length === 0 && bestEverBrain) parentBrains = [cloneBrain(bestEverBrain)];

    if (!bestEverBrain && parentBrains.length === 0) return false;

    this.generation = Math.max(1, snapshot.generation);
    this.parentBrains = parentBrains;
    this.bestEverBrain = bestEverBrain;
    this.bestEverDistance = Math.max(0, snapshot.bestEverDistance);
    this.averageDistance = Math.max(0, snapshot.averageDistance);
    this.crashRate = clamp(snapshot.crashRate, 0, 100);
    this.accuracyScore = clamp(snapshot.accuracyScore, 0, 100);
    this.effectiveMutation = clamp(snapshot.effectiveMutation, 0, 100);
    this.stagnantGenerations = Math.max(0, snapshot.stagnantGenerations);
    this.trainingSteps = Math.max(0, snapshot.trainingSteps);
    this.curriculumLevel = clamp(snapshot.curriculumLevel, 1, 5);
    this.bestReplay = Array.isArray(snapshot.bestReplay) ? snapshot.bestReplay.slice(-1600) : [];
    this.history = Array.isArray(snapshot.history) ? snapshot.history.slice(-24) : [];
    return true;
  }

  saveTrainingState() {
    if (this.settings.driveMode !== "ai") return;

    const snapshot: TrainingSnapshot = {
      version: 2,
      generation: this.generation,
      parentBrains: this.parentBrains.slice(0, 36).map(cloneBrain),
      bestEverBrain: this.bestEverBrain ? cloneBrain(this.bestEverBrain) : null,
      bestEverDistance: this.bestEverDistance,
      averageDistance: this.averageDistance,
      crashRate: this.crashRate,
      accuracyScore: this.accuracyScore,
      effectiveMutation: this.effectiveMutation,
      stagnantGenerations: this.stagnantGenerations,
      trainingSteps: this.trainingSteps,
      curriculumLevel: this.curriculumLevel,
      bestReplay: this.bestReplay.slice(-1600),
      history: this.history.slice(-24),
    };

    localStorage.setItem(trainingStateKey, JSON.stringify(snapshot));
  }

  step() {
    if (this.replaying) {
      this.replayIndex = (this.replayIndex + 1) % Math.max(1, this.bestReplay.length);
      return;
    }

    if (this.settings.driveMode === "manual") {
      this.applyManualControls();
    }

    this.bestCar = this.selectBestCar();
    this.road.rebuildBorders(this.bestCar.y);
    this.updateTraffic();
    this.updateObstacles();
    this.updateCars();
    if (this.settings.driveMode === "ai") {
      this.trainingSteps += 1;
    }
    this.bestCar = this.selectBestCar();

    const alive = this.cars.filter((car) => !car.damaged).length;
    if (this.settings.driveMode === "ai" && (alive === 0 || this.bestCar.y < this.generationStartY - this.generationDistanceTarget())) {
      this.finishGeneration();
      this.reset(true);
    }
  }

  selectBestCar() {
    const onRoadAlive = this.cars.filter((car) => !car.damaged && this.isCarInRoadView(car));
    if (onRoadAlive.length > 0) return onRoadAlive.reduce((best, car) => (car.y < best.y ? car : best), onRoadAlive[0]);

    const alive = this.cars.filter((car) => !car.damaged);
    if (alive.length > 0) return alive.reduce((best, car) => (car.y < best.y ? car : best), alive[0]);

    return this.cars.reduce((best, car) => (car.y < best.y ? car : best), this.cars[0]);
  }

  isCarInRoadView(car: Car) {
    const left = this.road.edgeAt(car.y, -1) - car.width * 1.8;
    const right = this.road.edgeAt(car.y, 1) + car.width * 1.8;
    return car.x >= left && car.x <= right;
  }

  updateCars() {
    if (this.settings.driveMode === "manual") {
      const car = this.cars[0];
      if (car) car.update(this.nearbyRoadBorders(car), this.nearbyTraffic(car), this.nearbyObstacles(car));
      return;
    }

    this.cars.forEach((car) => {
      if (car.damaged) return;
      car.update(this.nearbyRoadBorders(car), this.nearbyTraffic(car), this.nearbyObstacles(car));
      this.applyRoadDiscipline(car);
    });
  }

  applyRoadDiscipline(car: Car) {
    if (this.settings.driveMode !== "ai" || car.damaged) return;

    const left = this.road.edgeAt(car.y, -1);
    const right = this.road.edgeAt(car.y, 1);
    const margin = car.width * 0.9;
    const nearLeft = car.x < left + margin;
    const nearRight = car.x > right - margin;

    if (nearLeft || nearRight) {
      car.controls.forward = false;
      car.controls.reverse = car.speed > car.maxSpeed * 0.32;
      car.controls.left = nearRight;
      car.controls.right = nearLeft;
      car.angle *= 0.96;
    }
  }

  nearbyRoadBorders(car: Car) {
    const yRange = 390;
    const top = car.y - yRange;
    const bottom = car.y + yRange;
    return this.road.borders.filter(([start, end]) => Math.max(Math.min(start.y, end.y), top) <= Math.min(Math.max(start.y, end.y), bottom));
  }

  nearbyTraffic(car: Car) {
    const yRange = 335;
    const xRange = this.road.width * 0.58;
    return this.traffic.filter((vehicle) => Math.abs(vehicle.y - car.y) <= yRange && Math.abs(vehicle.x - car.x) <= xRange);
  }

  nearbyObstacles(car: Car) {
    const yRange = 335;
    const xRange = this.road.width * 0.58;
    return this.obstacles.filter((obstacle) => Math.abs(obstacle.y - car.y) <= yRange && Math.abs(obstacle.x - car.x) <= xRange);
  }

  generateCars() {
    if (this.settings.driveMode === "manual") {
      return [new Car(this.road.getLaneCenter(Math.floor(this.road.laneCount / 2), 100), 100, 30, 52, "MANUAL", 3.4, "#0f7490", this.settings.sensorRays)];
    }

    return Array.from(
      { length: clamp(this.settings.population, 1, 500) },
      () => new Car(this.road.getLaneCenter(Math.floor(this.road.laneCount / 2), 100), 100, 30, 52, "AI", 3.2, "#008b8b", this.settings.sensorRays),
    );
  }

  generateTraffic() {
    const vehicles: Car[] = [];
    const palette = ["#d79121", "#c94b4b", "#5c766c", "#4e5964"];
    const config = scenarioConfigs[this.settings.scenario];
    const totalTraffic = Math.max(0, Math.round(this.effectiveTrafficCount() * config.trafficMultiplier));

    for (let i = 0; i < totalTraffic; i += 1) {
      const lane = this.scenarioLane(i);
      const y = -120 - i * config.spacing - Math.random() * config.jitter;
      const isBlocker = config.blockerEvery !== undefined && i > 0 && i % config.blockerEvery === 0;
      const speed = isBlocker ? 0.72 : config.speedBase + (i % 3) * config.speedStep;
      const vehicle = new Car(this.road.getLaneCenter(lane, y), y, 30, 52, "DUMMY", speed, palette[i % palette.length]);
      vehicle.laneIndex = lane;
      vehicles.push(vehicle);
    }
    return vehicles;
  }

  generateObstacles() {
    if (this.settings.obstacleMode === "none" || this.settings.obstacleDensity === 0) return [];

    const obstacles: Obstacle[] = [];
    const effectiveDensity = this.effectiveObstacleDensity();
    const total = Math.round(effectiveDensity * 1.8);
    const spacing = 275 - Math.min(105, effectiveDensity * 12);

    for (let i = 0; i < total; i += 1) {
      const lane = (i + Math.floor(i / 2)) % this.road.laneCount;
      const y = -360 - i * spacing - Math.random() * 110;
      const type = this.obstacleType(i);
      const offset = type === "cone" ? (i % 2 === 0 ? -18 : 18) : 0;
      obstacles.push(new Obstacle(this.road.getLaneCenter(lane, y) + offset, y, type, lane, this.road.shape === "curved" ? this.roadTangentAngle(y) : 0));
    }

    return obstacles;
  }

  obstacleType(index: number): ObstacleType {
    if (this.settings.driveMode === "ai" && this.bestEverDistance < 1000 && index % 3 !== 0) return "cone";
    if (this.settings.obstacleMode === "cones") return "cone";
    if (this.settings.obstacleMode === "stopped") return "stopped-car";
    return index % 5 === 0 ? "roadblock" : index % 2 === 0 ? "stopped-car" : "cone";
  }

  scenarioLane(index: number) {
    if (this.settings.scenario === "blockers") {
      return index % this.road.laneCount;
    }

    if (this.settings.scenario === "dense") {
      return (index + Math.floor(index / 2)) % this.road.laneCount;
    }

    return (index * 2 + Math.floor(index / 3)) % this.road.laneCount;
  }

  updateTraffic() {
    this.traffic.forEach((car) => {
      car.update(this.road.borders, [], []);
      car.x = this.road.getLaneCenter(car.laneIndex, car.y);
      car.angle = this.road.shape === "curved" ? this.roadTangentAngle(car.y) : 0;
      car.polygon = car.createPolygon();
    });
    const leadY = this.bestCar.y;
    this.traffic.forEach((vehicle, index) => {
      if (vehicle.y > leadY + 720) {
        vehicle.y = leadY - 1300 - index * 105;
        vehicle.laneIndex = (index * 2 + this.generation) % this.road.laneCount;
        vehicle.x = this.road.getLaneCenter(vehicle.laneIndex, vehicle.y);
        vehicle.angle = this.road.shape === "curved" ? this.roadTangentAngle(vehicle.y) : 0;
        vehicle.damaged = false;
        vehicle.polygon = vehicle.createPolygon();
      }
    });
  }

  updateObstacles() {
    const leadY = this.bestCar.y;
    this.obstacles.forEach((obstacle, index) => {
      if (obstacle.y > leadY + 720) {
        obstacle.y = leadY - 1500 - index * 160;
        obstacle.laneIndex = (index + this.generation) % this.road.laneCount;
      }

      obstacle.updatePosition(
        this.road.getLaneCenter(obstacle.laneIndex, obstacle.y) + (obstacle.type === "cone" ? (index % 2 === 0 ? -18 : 18) : 0),
        obstacle.y,
        this.road.shape === "curved" ? this.roadTangentAngle(obstacle.y) : 0,
      );
    });
  }

  applyBrainSeed() {
    if (this.settings.driveMode === "manual") {
      this.storageState = "Manual";
      return;
    }

    if (this.parentBrains.length > 0) {
      this.breedPopulation();
      this.storageState = "Evolving";
      return;
    }

    const brain = loadSavedBrain();
    if (!brain) {
      this.storageState = "Unsaved";
      return;
    }

    const adaptedBrain = normalizeBrainInputs(brain, this.brainInputTarget());
    if (!adaptedBrain) {
      this.storageState = "Sensor mismatch";
      return;
    }

    this.cars.forEach((car, index) => {
      car.brain = cloneBrain(adaptedBrain);
      if (index === 0 || !car.brain) return;
      const protectedCount = Math.ceil(this.cars.length * 0.24);
      NeuralNetwork.mutate(car.brain, index < protectedCount ? Math.min(0.07, this.settings.mutation / 260) : this.settings.mutation / 140);
    });
    this.storageState = "Loaded";
  }

  brainInputTarget() {
    return this.settings.sensorRays + 1;
  }

  breedPopulation() {
    const parentCount = this.parentBrains.length;
    if (parentCount === 0) return;

    const eliteCount = this.eliteCount();
    const sprintingForGoal = this.goalSprintActive();
    const protectedCount = Math.max(eliteCount + 1, Math.ceil(this.cars.length * (sprintingForGoal ? 0.28 : 0.2)));
    this.cars.forEach((car, index) => {
      if (index < eliteCount) {
        car.brain = cloneBrain(this.parentBrains[index % parentCount]);
        return;
      }

      if (index < protectedCount) {
        car.brain = cloneBrain(this.parentBrains[index % parentCount]);
        NeuralNetwork.mutate(car.brain, Math.min(0.08, this.effectiveMutation / 260));
        return;
      }

      const immigrantRate = sprintingForGoal ? 0.24 : this.bestEverDistance < 1000 ? 0.14 : 0.04;
      if (index > eliteCount && Math.random() < immigrantRate) {
        return;
      }

      const parentA = this.parentBrains[randomIndex(parentCount)];
      const parentB = this.parentBrains[tournamentIndex(parentCount)];
      const useCrossover = Math.random() * 100 < this.settings.crossoverRate;
      car.brain = useCrossover ? crossoverBrains(parentA, parentB) : cloneBrain(parentA);
      const mutationScale = index < this.cars.length * 0.62 ? 140 : 95;
      NeuralNetwork.mutate(car.brain, this.effectiveMutation / mutationScale);
    });
  }

  finishGeneration() {
    const ranked = this.rankCars();
    const best = ranked[0];
    const average = ranked.reduce((sum, entry) => sum + entry.distance, 0) / Math.max(1, ranked.length);
    const crashed = ranked.filter((entry) => entry.car.damaged).length;

    this.averageDistance = Math.round(average / 18);
    this.crashRate = Math.round((crashed / Math.max(1, ranked.length)) * 100);
    this.curriculumLevel = this.nextCurriculumLevel();

    const bestMeters = Math.round(best.distance / 18);
    const improved = bestMeters > this.bestEverDistance;
    this.stagnantGenerations = improved ? 0 : this.stagnantGenerations + 1;
    this.effectiveMutation = this.adaptiveMutation();
    this.accuracyScore = this.calculateAccuracy(bestMeters, this.averageDistance, this.crashRate);

    if (bestMeters >= this.bestEverDistance && best.car.brain) {
      this.bestEverDistance = bestMeters;
      this.bestEverBrain = cloneBrain(best.car.brain);
      this.bestReplay = best.car.path.slice();
      this.replayIndex = 0;
      localStorage.setItem(storageKey, JSON.stringify(best.car.brain));
      this.storageState = "Saved";
    }

    const parentShare = this.goalSprintActive() && this.stagnantGenerations > 2 ? 0.14 : 0.24;
    const parentLimit = Math.max(this.eliteCount(), Math.ceil(ranked.length * parentShare));
    const generationParents = ranked
      .slice(0, parentLimit)
      .map((entry) => entry.car.brain)
      .filter((brain): brain is BrainShape => Boolean(brain))
      .map(cloneBrain);

    this.parentBrains =
      this.bestEverBrain && brainInputCount(this.bestEverBrain) === this.brainInputTarget()
        ? [cloneBrain(this.bestEverBrain), ...generationParents].slice(0, parentLimit + 1)
        : generationParents;

    this.history = [
      ...this.history,
      {
        generation: this.generation,
        bestDistance: bestMeters,
        averageDistance: this.averageDistance,
        crashRate: this.crashRate,
        survivalRate: Math.round(((ranked.length - crashed) / Math.max(1, ranked.length)) * 100),
        accuracyScore: this.accuracyScore,
      },
    ].slice(-24);

    this.saveTrainingState();
  }

  rankCars() {
    return this.cars
      .map((car) => {
        const distance = Math.max(0, this.generationStartY - car.y);
        const distanceMeters = distance / 18;
        const center = this.road.getLaneCenter(Math.floor(this.road.laneCount / 2), car.y);
        const averageSpeed = car.ticksAlive > 0 ? car.speedTotal / car.ticksAlive : 0;
        const goalSeeking = this.bestEverDistance < 1000;
        const sprintingForGoal = this.goalSprintActive();
        const distanceReward = distance * (sprintingForGoal ? 1.72 : goalSeeking ? 1.48 : 1);
        const progressBonus = goalSeeking ? Math.max(0, distanceMeters - this.bestEverDistance) * 52 : 0;
        const milestoneBonus = distanceMeters >= 1000 ? 1800 : distanceMeters >= 950 ? 760 : distanceMeters >= 900 ? 360 : 0;
        const roadLeft = this.road.edgeAt(car.y, -1);
        const roadRight = this.road.edgeAt(car.y, 1);
        const offroadDistance = Math.max(0, roadLeft + car.width * 0.25 - car.x, car.x - (roadRight - car.width * 0.25));
        const lanePenalty = Math.abs(car.x - center) * 0.32;
        const offroadPenalty = offroadDistance * 9 + (offroadDistance > 0 ? 520 : 0);
        const damagePenalty = car.damaged ? (goalSeeking ? 380 : 520) : 0;
        const reversePenalty = car.speed < 0 ? 180 : 0;
        const survivalReward = car.ticksAlive * 0.7;
        const speedReward = averageSpeed * (sprintingForGoal ? 205 : goalSeeking ? 178 : 130);
        const clearancePenalty = car.closestSensorReading * 95;
        const frontHazardPenalty = car.frontHazard * (sprintingForGoal ? 130 : goalSeeking ? 160 : 260);
        const hazardSpeedPenalty = car.hazardSpeedTotal * (sprintingForGoal ? 12 : goalSeeking ? 16 : 34);
        const hazardBrakeReward = car.hazardBrakeTicks * 10;
        const wastedBrakePenalty = Math.max(0, car.brakeTicks - car.hazardBrakeTicks) * 6;
        const hazardBalanceReward = Math.max(car.leftClearance, car.rightClearance) * 42;
        const steeringPenalty = (car.steeringTotal / Math.max(1, car.ticksAlive)) * 80;
        return {
          car,
          distance,
          fitness:
            distanceReward +
            progressBonus +
            milestoneBonus +
            survivalReward +
            speedReward +
            hazardBrakeReward +
            hazardBalanceReward -
            lanePenalty -
            offroadPenalty -
            damagePenalty -
            reversePenalty -
            clearancePenalty -
            frontHazardPenalty -
            hazardSpeedPenalty -
            wastedBrakePenalty -
            steeringPenalty,
        };
      })
      .sort((a, b) => b.fitness - a.fitness);
  }

  setManualControls(controls: ManualControls) {
    this.manualControls = controls;
  }

  applyManualControls() {
    const car = this.cars[0];
    car.controls.forward = this.manualControls.forward;
    car.controls.left = this.manualControls.left;
    car.controls.right = this.manualControls.right;
    car.controls.reverse = this.manualControls.reverse;
  }

  saveBestBrain() {
    const brain = this.bestEverBrain ?? this.bestCar.brain;
    if (!brain) return;
    localStorage.setItem(storageKey, JSON.stringify(brain));
    this.saveTrainingState();
    this.storageState = "Saved";
  }

  exportBestBrain() {
    return this.bestEverBrain ?? this.bestCar.brain ?? loadSavedBrain();
  }

  importBrain(brain: BrainShape) {
    const adaptedBrain = normalizeBrainInputs(brain, this.brainInputTarget());
    if (!adaptedBrain) {
      this.storageState = "Sensor mismatch";
      return;
    }

    localStorage.setItem(storageKey, JSON.stringify(adaptedBrain));
    this.parentBrains = [cloneBrain(adaptedBrain)];
    this.bestEverBrain = cloneBrain(adaptedBrain);
    this.bestEverDistance = Math.max(this.bestEverDistance, 0);
    this.saveTrainingState();
    this.storageState = "Imported";
    this.reset(false);
  }

  toggleReplay() {
    if (this.bestReplay.length === 0) return;
    this.replaying = !this.replaying;
    this.replayIndex = 0;
  }

  stopReplay() {
    this.replaying = false;
  }

  clearBestBrain() {
    localStorage.removeItem(storageKey);
    localStorage.removeItem(trainingStateKey);
    this.parentBrains = [];
    this.bestEverBrain = null;
    this.bestEverDistance = 0;
    this.averageDistance = 0;
    this.crashRate = 0;
    this.accuracyScore = 0;
    this.effectiveMutation = this.settings.mutation;
    this.stagnantGenerations = 0;
    this.trainingSteps = 0;
    this.curriculumLevel = 1;
    this.bestReplay = [];
    this.history = [];
    this.generation = 1;
    this.storageState = "Cleared";
    this.reset(false);
  }

  telemetry(): Telemetry {
    const alive = this.cars.filter((car) => !car.damaged).length;
    return {
      generation: this.generation,
      alive,
      distance: Math.max(0, Math.round((this.generationStartY - this.bestCar.y) / 18)),
      speed: Math.round(Math.abs(this.bestCar.speed) * 28),
      currentCrashed: this.bestCar.damaged,
      autopilot: this.bestCar.autopilotConfidence,
      storageState: this.storageState,
      mode: this.settings.driveMode,
      bestEverDistance: this.bestEverDistance,
      averageDistance: this.averageDistance,
      crashRate: this.crashRate,
      eliteCount: this.eliteCount(),
      accuracyScore: this.accuracyScore,
      effectiveMutation: this.effectiveMutation,
      stagnantGenerations: this.stagnantGenerations,
      trainingSteps: this.trainingSteps,
      curriculumLevel: this.curriculumLevel,
      hasReplay: this.bestReplay.length > 0,
      replaying: this.replaying,
      history: this.history,
    };
  }

  render(
    carCtx: CanvasRenderingContext2D,
    networkCtx: CanvasRenderingContext2D,
    carWidth: number,
    carHeight: number,
    networkWidth: number,
    networkHeight: number,
    options: { fastVisuals?: boolean; renderNetwork?: boolean } = {},
  ) {
    const fastVisuals = options.fastVisuals ?? false;
    const renderNetwork = options.renderNetwork ?? true;

    carCtx.clearRect(0, 0, carWidth, carHeight);
    carCtx.save();
    carCtx.translate(0, -this.bestCar.y + carHeight * 0.72);
    this.drawEnvironment(carCtx, carWidth, carHeight);
    this.road.draw(carCtx);
    if (this.settings.debug.traffic) {
      this.traffic.forEach((car) => car.draw(carCtx, false, this.settings.debug.collisions));
    }
    this.obstacles.forEach((obstacle) => obstacle.draw(carCtx, this.settings.debug.collisions));

    carCtx.globalAlpha = 0.22;
    const backgroundCars = fastVisuals ? this.cars.filter((_, index) => index % Math.ceil(this.cars.length / 36) === 0) : this.cars;
    backgroundCars.forEach((car) => car.draw(carCtx, false, this.settings.debug.collisions));
    carCtx.globalAlpha = 1;
    this.bestCar.draw(carCtx, this.settings.debug.sensors, this.settings.debug.collisions);
    if (this.settings.debug.replayPath) {
      this.drawReplay(carCtx);
    }
    carCtx.restore();

    if (!renderNetwork) return;

    networkCtx.clearRect(0, 0, networkWidth, networkHeight);
    if (!this.settings.debug.network) {
      networkCtx.fillStyle = "#eef1eb";
      networkCtx.font = "700 15px Arial";
      networkCtx.textAlign = "center";
      networkCtx.textBaseline = "middle";
      networkCtx.fillText("Network hidden", networkWidth / 2, networkHeight / 2);
    } else if (this.bestCar.brain) {
      networkCtx.lineDashOffset = -(performance.now() / 48) % 18;
      Visualizer.drawNetwork(networkCtx, this.bestCar.brain, networkWidth, networkHeight);
    } else {
      networkCtx.fillStyle = "#eef1eb";
      networkCtx.font = "700 15px Arial";
      networkCtx.textAlign = "center";
      networkCtx.textBaseline = "middle";
      networkCtx.fillText("Manual mode", networkWidth / 2, networkHeight / 2 - 10);
      networkCtx.fillStyle = "#aeb7bd";
      networkCtx.font = "12px Arial";
      networkCtx.fillText("Use W A S D or arrow keys", networkWidth / 2, networkHeight / 2 + 16);
    }
  }

  eliteCount() {
    if (this.settings.driveMode === "manual") return 0;
    return Math.max(1, Math.ceil(clamp(this.settings.population, 1, 500) * (this.settings.eliteRate / 100)));
  }

  adaptiveMutation() {
    const base = this.settings.mutation;
    const stagnationBoost = Math.min(18, this.stagnantGenerations * 3);
    const generationCooling = Math.min(8, Math.floor(this.generation / 8));
    const goalBoost = this.goalSprintActive() ? 14 : this.bestEverDistance < 1000 ? 9 : 0;
    return clamp(base + goalBoost + stagnationBoost - generationCooling, 3, 55);
  }

  calculateAccuracy(bestMeters: number, averageMeters: number, crashRate: number) {
    const distanceScore = Math.min(52, bestMeters / 7);
    const consistencyScore = Math.min(30, averageMeters / Math.max(1, bestMeters) * 30);
    const safetyScore = Math.max(0, 18 - crashRate * 0.18);
    return Math.round(clamp(distanceScore + consistencyScore + safetyScore, 0, 100));
  }

  generationDistanceTarget() {
    if (this.goalSprintActive()) {
      return 24000;
    }
    if (this.bestEverDistance < 1000) {
      return 12600 + Math.min(9000, this.generation * 420);
    }
    return 10800 + Math.min(5400, this.generation * 120);
  }

  goalSprintActive() {
    return this.settings.driveMode === "ai" && this.bestEverDistance >= 720 && this.bestEverDistance < 1000;
  }

  effectiveTrafficCount() {
    if (this.settings.driveMode !== "ai" || this.bestEverDistance >= 1000) return this.settings.traffic;
    if (this.goalSprintActive()) return Math.max(3, Math.round(this.settings.traffic * 0.32));
    const progress = clamp(this.bestEverDistance / 1000, 0, 1);
    const scale = lerp(0.4, 0.72, progress);
    return Math.max(4, Math.round(this.settings.traffic * scale));
  }

  effectiveObstacleDensity() {
    const target = this.settings.obstacleDensity;
    if (this.settings.driveMode !== "ai") return target;
    if (this.goalSprintActive()) return Math.max(1, Math.round(target * 0.24));
    const goalRamp = this.bestEverDistance < 1000 ? lerp(0.2, 0.58, clamp(this.bestEverDistance / 1000, 0, 1)) : 1;
    const ramp = clamp((this.curriculumLevel / 5) * goalRamp, 0.2, 1);
    return Math.max(1, Math.round(target * ramp));
  }

  nextCurriculumLevel() {
    if (this.goalSprintActive()) {
      return 1;
    }
    if (this.bestEverDistance < 1000 && this.averageDistance < 700) {
      return Math.max(1, Math.min(this.curriculumLevel, 3));
    }
    if (this.crashRate < 72 && this.averageDistance > 60) {
      return Math.min(5, this.curriculumLevel + 1);
    }
    if (this.crashRate > 92 && this.curriculumLevel > 1) {
      return this.curriculumLevel - 1;
    }
    return this.curriculumLevel;
  }

  roadTangentAngle(y: number) {
    const ahead = this.road.centerAt(y - 40);
    const behind = this.road.centerAt(y + 40);
    return Math.atan2(ahead - behind, 80);
  }

  drawReplay(ctx: CanvasRenderingContext2D) {
    if (this.bestReplay.length < 2) return;

    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(232, 180, 72, 0.78)";
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    this.bestReplay.forEach((frame, index) => {
      if (index === 0) ctx.moveTo(frame.x, frame.y);
      else ctx.lineTo(frame.x, frame.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    if (this.replaying) {
      const frame = this.bestReplay[this.replayIndex % this.bestReplay.length];
      ctx.translate(frame.x, frame.y);
      ctx.rotate(-frame.angle);
      ctx.fillStyle = "rgba(232, 180, 72, 0.92)";
      roundRect(ctx, -16, -27, 32, 54, 7);
      ctx.fill();
    }

    ctx.restore();
  }

  drawEnvironment(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const y = this.bestCar.y;
    ctx.fillStyle = "#6f8266";
    ctx.fillRect(0, y - height, width, height * 3);

    ctx.fillStyle = "#5d7056";
    for (let i = -10; i < 30; i += 1) {
      const markerY = Math.floor((y - height + i * 90) / 90) * 90;
      const leftX = this.road.edgeAt(markerY, -1) - 70 - ((i * 23) % 45);
      const rightX = this.road.edgeAt(markerY, 1) + 42 + ((i * 19) % 50);
      ctx.fillRect(leftX, markerY, 20, 50);
      ctx.fillRect(rightX, markerY + 40, 20, 50);
    }

    ctx.fillStyle = "#2e3438";
    ctx.beginPath();
    for (let roadY = y - height * 2; roadY <= y + height * 2; roadY += 80) {
      const x = this.road.edgeAt(roadY, -1);
      if (roadY === y - height * 2) ctx.moveTo(x, roadY);
      else ctx.lineTo(x, roadY);
    }
    for (let roadY = y + height * 2; roadY >= y - height * 2; roadY -= 80) {
      ctx.lineTo(this.road.edgeAt(roadY, 1), roadY);
    }
    ctx.closePath();
    ctx.fill();
  }
}

export function loadSavedBrain() {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as BrainShape) : null;
  } catch {
    return null;
  }
}

export function loadTrainingSnapshot() {
  try {
    const raw = localStorage.getItem(trainingStateKey);
    if (!raw) return null;

    const snapshot = JSON.parse(raw) as Partial<TrainingSnapshot>;
    if (!snapshot || typeof snapshot !== "object") return null;
    if (!Array.isArray(snapshot.parentBrains)) return null;
    if (snapshot.bestEverBrain !== null && snapshot.bestEverBrain !== undefined && !Array.isArray(snapshot.bestEverBrain.levels)) return null;

    return {
      version: Number(snapshot.version ?? 1),
      generation: Number(snapshot.generation ?? 1),
      parentBrains: snapshot.parentBrains,
      bestEverBrain: snapshot.bestEverBrain ?? null,
      bestEverDistance: Number(snapshot.bestEverDistance ?? 0),
      averageDistance: Number(snapshot.averageDistance ?? 0),
      crashRate: Number(snapshot.crashRate ?? 0),
      accuracyScore: Number(snapshot.accuracyScore ?? 0),
      effectiveMutation: Number(snapshot.effectiveMutation ?? 0),
      stagnantGenerations: Number(snapshot.stagnantGenerations ?? 0),
      trainingSteps: Number(snapshot.trainingSteps ?? 0),
      curriculumLevel: Number(snapshot.curriculumLevel ?? 1),
      bestReplay: Array.isArray(snapshot.bestReplay) ? snapshot.bestReplay : [],
      history: Array.isArray(snapshot.history) ? snapshot.history : [],
    } satisfies TrainingSnapshot;
  } catch {
    return null;
  }
}

export function cloneBrain(brain: BrainShape): BrainShape {
  return JSON.parse(JSON.stringify(brain)) as BrainShape;
}

export function brainInputCount(brain: BrainShape) {
  return brain.levels?.[0]?.inputs?.length ?? 0;
}

export function normalizeBrainInputs(brain: BrainShape, targetInputCount: number) {
  if (!brain.levels?.[0] || targetInputCount <= 0) return null;

  const normalized = cloneBrain(brain);
  const firstLevel = normalized.levels[0];
  const outputCount = firstLevel.outputs.length;

  firstLevel.inputs = Array.from({ length: targetInputCount }, (_, index) => firstLevel.inputs[index] ?? 0);
  firstLevel.weights = Array.from({ length: targetInputCount }, (_, rowIndex) => {
    const existingRow = firstLevel.weights[rowIndex];
    return existingRow ? [...existingRow] : new Array(outputCount).fill(0);
  });

  return normalized;
}

export function crossoverBrains(parentA: BrainShape, parentB: BrainShape): BrainShape {
  return {
    levels: parentA.levels.map((level, levelIndex) => {
      const otherLevel = parentB.levels[levelIndex] ?? level;
      return {
        inputs: [...level.inputs],
        outputs: [...level.outputs],
        biases: level.biases.map((bias, index) => (Math.random() < 0.5 ? bias : (otherLevel.biases[index] ?? bias))),
        weights: level.weights.map((weights, rowIndex) =>
          weights.map((weight, columnIndex) => (Math.random() < 0.5 ? weight : (otherLevel.weights[rowIndex]?.[columnIndex] ?? weight))),
        ),
      };
    }),
  };
}

export function randomIndex(length: number) {
  return Math.floor(Math.random() * Math.max(1, length));
}

export function tournamentIndex(length: number) {
  const candidateA = randomIndex(length);
  const candidateB = randomIndex(length);
  const candidateC = randomIndex(length);
  return Math.min(candidateA, candidateB, candidateC);
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function getIntersection(a: Point, b: Point, c: Point, d: Point) {
  const tTop = (d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x);
  const uTop = (c.y - a.y) * (a.x - b.x) - (c.x - a.x) * (a.y - b.y);
  const bottom = (d.y - c.y) * (b.x - a.x) - (d.x - c.x) * (b.y - a.y);

  if (bottom !== 0) {
    const t = tTop / bottom;
    const u = uTop / bottom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        offset: t,
      };
    }
  }

  return null;
}

export function polysIntersect(poly1: Point[], poly2: Point[]) {
  for (let i = 0; i < poly1.length; i += 1) {
    for (let j = 0; j < poly2.length; j += 1) {
      const touch = getIntersection(poly1[i], poly1[(i + 1) % poly1.length], poly2[j], poly2[(j + 1) % poly2.length]);
      if (touch) return true;
    }
  }
  return false;
}

export function getRgba(value: number) {
  const alpha = Math.abs(value);
  const color = value > 0 ? "215, 145, 33" : "201, 75, 75";
  return `rgba(${color}, ${alpha})`;
}

export function drawPolygon(ctx: CanvasRenderingContext2D, polygon: Point[], color: string, lineWidth: number) {
  if (polygon.length === 0) return;

  ctx.save();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(polygon[0].x, polygon[0].y);
  for (let i = 1; i < polygon.length; i += 1) {
    ctx.lineTo(polygon[i].x, polygon[i].y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
