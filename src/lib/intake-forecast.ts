// ============================================================================
// EduTrace: Predictive Intake Intelligence & Capacity Forecasting Engine
// Transparent statistical forecasting, backtesting, and early warnings.
// This is an explainable decision-support module, not machine learning or AI.
// ============================================================================

export type ForecastingModelType =
  | "moving_average"
  | "weighted_moving_average"
  | "linear_regression"
  | "seasonal_baseline"
  | "insufficient_data";

export type ForecastConfidenceStatus = "reliable" | "preliminary" | "insufficient_data";

export type EarlyWarningSeverity = "low" | "medium" | "high" | "critical";

export type EarlyWarningCode =
  | "UNDER_UTILIZATION"
  | "CAPACITY_PRESSURE"
  | "DECLINING_DEMAND"
  | "SURGING_DEMAND"
  | "DATA_INSUFFICIENT"
  | "HISTORICAL_ANOMALY";

export interface HistoricalIntakePoint {
  academicYear: number;
  regularCount: number;
  lateralCount: number;
  supernumeraryCount: number;
  totalCount: number;
  approvedIntake: number;
  utilizationRate: number; // (regularCount / approvedIntake) * 100
}

export interface ModelAccuracyMetrics {
  mae: number; // Mean Absolute Error
  wape: number; // Weighted Absolute Percentage Error (percentage 0-100)
  testOriginsCount: number;
}

export interface ForecastUncertainty {
  standardError: number;
  lowerBound80: number; // 80% confidence interval lower bound
  upperBound80: number; // 80% confidence interval upper bound
  marginOfError: number;
}

export interface ScenarioProjections {
  conservative: {
    projectedIntake: number;
    projectedUtilization: number;
    description: string;
  };
  baseline: {
    projectedIntake: number;
    projectedUtilization: number;
    description: string;
  };
  highDemand: {
    projectedIntake: number;
    projectedUtilization: number;
    description: string;
  };
  customSimulated?: {
    adjustmentPercent: number;
    projectedIntake: number;
    projectedUtilization: number;
    description: string;
  };
}

export interface ProgrammeForecastResult {
  programmeCode: string;
  programmeName?: string | null | undefined;
  institutionId?: string | null | undefined;
  targetAcademicYear: number;
  approvedIntake: number;
  status: ForecastConfidenceStatus;
  selectedModel: ForecastingModelType;
  modelName: string;
  projectedRegularIntake: number;
  projectedTotalIntake: number;
  projectedUtilization: number; // percentage
  remainingCapacity: number;
  historicalYearsUsed: number[];
  historicalPointsCount: number;
  accuracyMetrics?: ModelAccuracyMetrics | undefined;
  uncertainty: ForecastUncertainty;
  scenarios: ScenarioProjections;
  explanation: string;
  assumptions: string[];
  limitations: string[];
  lastCalculatedAt: string;
}

export interface IntakeEarlyWarning {
  id: string;
  code: EarlyWarningCode;
  severity: EarlyWarningSeverity;
  programmeCode: string;
  programmeName?: string | null | undefined;
  academicYear: number;
  title: string;
  message: string;
  supportingMetric: string;
  suggestedAction: string;
  triggeredAt: string;
}

export interface InstitutionIntakeIntelligenceSummary {
  institutionId?: string | null | undefined;
  targetYear: number;
  totalApprovedCapacity: number;
  currentRegularAdmitted: number;
  currentSupernumerary: number;
  currentLateral: number;
  totalCurrentAdmitted: number;
  overallUtilizationRate: number;
  projectedDemandTotal: number;
  projectedOverallUtilization: number;
  flaggedProgrammesCount: number;
  reliableForecastsCount: number;
  preliminaryForecastsCount: number;
  insufficientDataCount: number;
  earlyWarnings: IntakeEarlyWarning[];
  programmeSummaries: ProgrammeForecastResult[];
  historicalTrend: {
    academicYear: number;
    approvedCapacity: number;
    regularAdmissions: number;
    supernumeraryAdmissions: number;
    lateralAdmissions: number;
    totalAdmissions: number;
    utilizationRate: number;
    projectedDemand?: number | null | undefined;
  }[];
}

// ── Math & Statistical Primitives ──────────────────────────────────────────

/**
 * Standard Simple Moving Average (SMA).
 * Takes recent k values and computes arithmetic mean.
 */
export function calculateMovingAverage(values: number[], windowSize = 3): number {
  if (values.length === 0) return 0;
  const k = Math.min(Math.max(1, windowSize), values.length);
  const slice = values.slice(-k);
  const sum = slice.reduce((a, b) => a + b, 0);
  return Math.max(0, Math.round(sum / k));
}

/**
 * Weighted Moving Average (WMA).
 * Gives linearly higher weight to more recent academic years.
 * e.g., for window 3: weights are [1, 2, 3], normalized to sum to 1.
 */
export function calculateWeightedMovingAverage(values: number[], customWeights?: number[]): number {
  if (values.length === 0) return 0;
  const k = customWeights ? Math.min(customWeights.length, values.length) : values.length;
  const slice = values.slice(-k);

  let weights: number[];
  if (customWeights && customWeights.length >= k) {
    weights = customWeights.slice(-k);
  } else {
    // Generate linear weights: 1, 2, ..., k
    weights = Array.from({ length: k }, (_, i) => i + 1);
  }

  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) return calculateMovingAverage(values, k);

  let weightedSum = 0;
  for (let i = 0; i < k; i++) {
    weightedSum += (slice[i] ?? 0) * (weights[i] ?? 1);
  }

  return Math.max(0, Math.round(weightedSum / weightSum));
}

/**
 * Ordinary Least Squares (OLS) Linear Regression.
 * Fits y = m * x + c and projects value for target X.
 */
export function calculateLinearRegression(
  xValues: number[],
  yValues: number[],
): {
  slope: number;
  intercept: number;
  rSquared: number;
  predict: (x: number) => number;
} {
  const n = Math.min(xValues.length, yValues.length);
  if (n < 2) {
    const val = yValues[0] ?? 0;
    return {
      slope: 0,
      intercept: val,
      rSquared: 0,
      predict: () => Math.max(0, val),
    };
  }

  const sumX = xValues.slice(0, n).reduce((a, b) => a + b, 0);
  const sumY = yValues.slice(0, n).reduce((a, b) => a + b, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;

  let numerator = 0;
  let denominator = 0;
  let totalSS = 0;

  for (let i = 0; i < n; i++) {
    const xi = xValues[i]!;
    const yi = yValues[i]!;
    numerator += (xi - meanX) * (yi - meanY);
    denominator += (xi - meanX) ** 2;
    totalSS += (yi - meanY) ** 2;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanY - slope * meanX;

  // Calculate R² (Coefficient of determination)
  let residualSS = 0;
  for (let i = 0; i < n; i++) {
    const predY = slope * xValues[i]! + intercept;
    residualSS += (yValues[i]! - predY) ** 2;
  }
  const rSquared = totalSS === 0 ? 1 : Math.max(0, Math.min(1, 1 - residualSS / totalSS));

  return {
    slope,
    intercept,
    rSquared,
    predict: (targetX: number) => Math.max(0, Math.round(slope * targetX + intercept)),
  };
}

/**
 * Mean Absolute Error (MAE).
 * Average magnitude of forecast errors in identical units.
 */
export function calculateMAE(actuals: number[], predictions: number[]): number {
  if (actuals.length === 0 || actuals.length !== predictions.length) return 0;
  const totalError = actuals.reduce((sum, act, i) => sum + Math.abs(act - predictions[i]!), 0);
  return Number((totalError / actuals.length).toFixed(2));
}

/**
 * Weighted Absolute Percentage Error (WAPE).
 * Sum of absolute errors divided by sum of actuals, represented as percentage (0-100%).
 * Safely handles zeros without division-by-zero errors.
 */
export function calculateWAPE(actuals: number[], predictions: number[]): number {
  if (actuals.length === 0 || actuals.length !== predictions.length) return 0;
  const sumActual = actuals.reduce((a, b) => a + b, 0);
  const sumAbsError = actuals.reduce((sum, act, i) => sum + Math.abs(act - predictions[i]!), 0);

  if (sumActual === 0) {
    return sumAbsError === 0 ? 0 : 100;
  }

  return Number(((sumAbsError / sumActual) * 100).toFixed(2));
}

// ── Rolling-Origin Backtesting & Model Selection ───────────────────────────

interface CandidateEvaluation {
  modelType: ForecastingModelType;
  modelName: string;
  mae: number;
  wape: number;
  predictions: number[];
  actuals: number[];
}

/**
 * Evaluates candidate models via rolling-origin backtesting.
 * For each test origin t, models are trained on [0..t-1] and evaluated on actual t.
 */
export function backtestForecastingModels(
  historicalPoints: HistoricalIntakePoint[],
): CandidateEvaluation[] {
  // Sort chronologically ascending
  const sorted = [...historicalPoints].sort((a, b) => a.academicYear - b.academicYear);
  const n = sorted.length;

  if (n < 3) {
    return [];
  }

  // We test on origins starting from index 2 up to n-1 (minimum 2 historical training points)
  const candidateModels: {
    type: ForecastingModelType;
    name: string;
    predictNext: (trainPoints: HistoricalIntakePoint[], targetYear: number) => number;
  }[] = [
    {
      type: "weighted_moving_average",
      name: "Weighted Moving Average (Recent-Year Weighted)",
      predictNext: (pts) => calculateWeightedMovingAverage(pts.map((p) => p.regularCount)),
    },
    {
      type: "moving_average",
      name: "Simple Moving Average (3-Year Baseline)",
      predictNext: (pts) =>
        calculateMovingAverage(
          pts.map((p) => p.regularCount),
          3,
        ),
    },
    {
      type: "linear_regression",
      name: "Linear Trend Regression (OLS)",
      predictNext: (pts, targetYr) => {
        const x = pts.map((p) => p.academicYear);
        const y = pts.map((p) => p.regularCount);
        const reg = calculateLinearRegression(x, y);
        return reg.predict(targetYr);
      },
    },
  ];

  const evaluations: CandidateEvaluation[] = candidateModels.map((m) => ({
    modelType: m.type,
    modelName: m.name,
    mae: 0,
    wape: 0,
    predictions: [],
    actuals: [],
  }));

  for (let origin = 2; origin < n; origin++) {
    const trainingSlice = sorted.slice(0, origin);
    const testPoint = sorted[origin]!;
    const actualVal = testPoint.regularCount;

    for (const [idx, candidate] of candidateModels.entries()) {
      const pred = candidate.predictNext(trainingSlice, testPoint.academicYear);
      evaluations[idx]!.predictions.push(pred);
      evaluations[idx]!.actuals.push(actualVal);
    }
  }

  for (const evalResult of evaluations) {
    evalResult.mae = calculateMAE(evalResult.actuals, evalResult.predictions);
    evalResult.wape = calculateWAPE(evalResult.actuals, evalResult.predictions);
  }

  // Sort by WAPE ascending (lowest error first)
  evaluations.sort((a, b) => a.wape - b.wape || a.mae - b.mae);
  return evaluations;
}

// ── Uncertainty & Prediction Intervals ────────────────────────────────────

/**
 * Computes forecast uncertainty and 80% prediction interval.
 */
export function calculateForecastUncertainty(
  actuals: number[],
  predictedValue: number,
  rSquared?: number,
): ForecastUncertainty {
  const n = actuals.length;
  if (n < 2) {
    const margin = Math.round(predictedValue * 0.25);
    return {
      standardError: margin,
      lowerBound80: Math.max(0, predictedValue - margin),
      upperBound80: predictedValue + margin,
      marginOfError: margin,
    };
  }

  // Calculate sample standard deviation of historical values
  const mean = actuals.reduce((a, b) => a + b, 0) / n;
  const variance = actuals.reduce((sum, val) => sum + (val - mean) ** 2, 0) / (n - 1);
  const sampleStdDev = Math.sqrt(Math.max(0, variance));

  // If regression R² is provided, unexplained standard error S_yx = s_y * sqrt(1 - R²)
  let standardError = sampleStdDev;
  if (typeof rSquared === "number" && rSquared >= 0 && rSquared <= 1) {
    standardError = sampleStdDev * Math.sqrt(1 - rSquared);
  }

  // For 80% prediction interval, z-score ≈ 1.28 (t-distribution critical value with df=2..5 is ~1.4 to 1.6)
  const zScore = n <= 3 ? 1.64 : 1.28;
  const marginOfError = Math.max(2, Math.round(zScore * standardError));

  return {
    standardError: Number(standardError.toFixed(2)),
    lowerBound80: Math.max(0, predictedValue - marginOfError),
    upperBound80: predictedValue + marginOfError,
    marginOfError,
  };
}

// ── Scenario Simulation ───────────────────────────────────────────────────

/**
 * Builds conservative, baseline, high-demand, and custom scenario simulations.
 */
export function generateIntakeScenarios(
  baselineForecast: number,
  approvedIntake: number,
  uncertaintyMargin: number,
  userAdjustmentPercent?: number,
): ScenarioProjections {
  const safeBaseline = Math.max(0, Math.round(baselineForecast));
  // Conservative is -15% or -uncertainty margin
  const conservativeReduction = Math.max(Math.round(safeBaseline * 0.12), uncertaintyMargin);
  const conservativeIntake = Math.max(0, safeBaseline - conservativeReduction);

  // High demand is +15% or +uncertainty margin
  const highDemandIncrease = Math.max(Math.round(safeBaseline * 0.12), uncertaintyMargin);
  const highDemandIntake = safeBaseline + highDemandIncrease;

  const calcUtil = (val: number) =>
    approvedIntake > 0 ? Number(((val / approvedIntake) * 100).toFixed(1)) : 0;

  const scenarios: ScenarioProjections = {
    conservative: {
      projectedIntake: conservativeIntake,
      projectedUtilization: calcUtil(conservativeIntake),
      description:
        "Conservative scenario (-12% to -1σ): Reflects softer applicant demand or regional enrollment contraction.",
    },
    baseline: {
      projectedIntake: safeBaseline,
      projectedUtilization: calcUtil(safeBaseline),
      description:
        "Baseline scenario: Expected projection from historical trend analysis and backtested model.",
    },
    highDemand: {
      projectedIntake: highDemandIntake,
      projectedUtilization: calcUtil(highDemandIntake),
      description:
        "High-demand scenario (+12% to +1σ): Reflects strong counseling seat acceptance and elevated intake.",
    },
  };

  if (typeof userAdjustmentPercent === "number") {
    const customVal = Math.max(
      0,
      Math.round(safeBaseline * (1 + Number(userAdjustmentPercent) / 100)),
    );
    scenarios.customSimulated = {
      adjustmentPercent: userAdjustmentPercent,
      projectedIntake: customVal,
      projectedUtilization: calcUtil(customVal),
      description: `User-adjusted scenario (${userAdjustmentPercent >= 0 ? "+" : ""}${userAdjustmentPercent}%): Custom institutional planning parameter.`,
    };
  }

  return scenarios;
}

// ── Early Warning Engine ──────────────────────────────────────────────────

/**
 * Evaluates operational early-warning rules for institutional capacity planning.
 */
export function evaluateIntakeEarlyWarnings(
  programmes: ProgrammeForecastResult[],
): IntakeEarlyWarning[] {
  const warnings: IntakeEarlyWarning[] = [];
  const now = new Date().toISOString();

  for (const prog of programmes) {
    const {
      programmeCode,
      programmeName,
      targetAcademicYear,
      approvedIntake,
      projectedRegularIntake,
      projectedUtilization,
      status,
      historicalPointsCount,
    } = prog;

    // 1. Data Insufficiency Warning
    if (status === "insufficient_data" || historicalPointsCount < 2) {
      warnings.push({
        id: `WARN-DATA-${programmeCode}-${targetAcademicYear}`,
        code: "DATA_INSUFFICIENT",
        severity: "medium",
        programmeCode,
        programmeName,
        academicYear: targetAcademicYear,
        title: "Insufficient Historical Intake Data",
        message: `Programme ${programmeCode} has only ${historicalPointsCount} recorded academic year(s). Minimum 2 required for trend projection, 3+ for backtested reliability.`,
        supportingMetric: `${historicalPointsCount} year(s) recorded`,
        suggestedAction:
          "Upload prior academic year student registries or historical intake snapshots to enable statistical forecasting.",
        triggeredAt: now,
      });
      continue; // Skip statistical warning rules if data is insufficient
    }

    // 2. Severe or Moderate Under-Utilization
    if (projectedUtilization < 40 && approvedIntake > 0) {
      warnings.push({
        id: `WARN-CRIT-UNDER-${programmeCode}-${targetAcademicYear}`,
        code: "UNDER_UTILIZATION",
        severity: "high",
        programmeCode,
        programmeName,
        academicYear: targetAcademicYear,
        title: "Severe Projected Under-Utilization (<40%)",
        message: `Projected enrollment (${projectedRegularIntake}) is only ${projectedUtilization}% of approved capacity (${approvedIntake}). Risk of programme viability challenges.`,
        supportingMetric: `Projected utilization: ${projectedUtilization}% (Approved: ${approvedIntake})`,
        suggestedAction:
          "Review curriculum relevance, outreach strategies, or consider rationalizing approved seat matrix in annual regulatory filing.",
        triggeredAt: now,
      });
    } else if (projectedUtilization < 60 && approvedIntake > 0) {
      warnings.push({
        id: `WARN-UNDER-${programmeCode}-${targetAcademicYear}`,
        code: "UNDER_UTILIZATION",
        severity: "medium",
        programmeCode,
        programmeName,
        academicYear: targetAcademicYear,
        title: "Low Projected Utilization (<60%)",
        message: `Projected intake of ${projectedRegularIntake} seats is below the 60% healthy enrollment threshold of approved capacity (${approvedIntake}).`,
        supportingMetric: `Projected utilization: ${projectedUtilization}%`,
        suggestedAction:
          "Investigate counselling round conversion rates and benchmark against regional peer institutions.",
        triggeredAt: now,
      });
    }

    // 3. Capacity Pressure / Near Overflow
    if (projectedRegularIntake > approvedIntake && approvedIntake > 0) {
      warnings.push({
        id: `WARN-OVER-${programmeCode}-${targetAcademicYear}`,
        code: "CAPACITY_PRESSURE",
        severity: "high",
        programmeCode,
        programmeName,
        academicYear: targetAcademicYear,
        title: "Projected Demand Exceeds Approved Capacity",
        message: `Estimated regular demand (${projectedRegularIntake}) exceeds approved intake (${approvedIntake}) by ${projectedRegularIntake - approvedIntake} seats (${projectedUtilization}%). Note: Supernumerary seats are excluded from this limit.`,
        supportingMetric: `Demand: ${projectedRegularIntake} / Capacity: ${approvedIntake} (${projectedUtilization}%)`,
        suggestedAction:
          "Prepare strict cut-off scores, prioritize merit lists, or apply to regulatory authority for an approved seat enhancement.",
        triggeredAt: now,
      });
    } else if (projectedUtilization >= 95 && approvedIntake > 0) {
      warnings.push({
        id: `WARN-PRESS-${programmeCode}-${targetAcademicYear}`,
        code: "CAPACITY_PRESSURE",
        severity: "low",
        programmeCode,
        programmeName,
        academicYear: targetAcademicYear,
        title: "High Capacity Utilization (≥95%)",
        message: `Projected enrollment is operating at full capacity (${projectedUtilization}%). Limited buffer available for late seat reconciliation.`,
        supportingMetric: `${approvedIntake - projectedRegularIntake} regular seat(s) remaining buffer`,
        suggestedAction:
          "Ensure close coordination between institutional admission cell and state counseling authority.",
        triggeredAt: now,
      });
    }
  }

  return warnings;
}

// ── Main Forecasting Orchestration ────────────────────────────────────────

/**
 * Predicts intake demand for a single academic programme using historical records.
 */
export function generateProgrammeIntakeForecast(
  programmeCode: string,
  programmeName: string | null | undefined,
  approvedIntake: number,
  historicalPoints: HistoricalIntakePoint[],
  targetAcademicYear?: number,
  userAdjustmentPercent?: number,
): ProgrammeForecastResult {
  const sortedPoints = [...historicalPoints]
    .filter((p) => typeof p.academicYear === "number" && !isNaN(p.academicYear))
    .sort((a, b) => a.academicYear - b.academicYear);

  const n = sortedPoints.length;
  const lastRecordedYear = n > 0 ? sortedPoints[n - 1]!.academicYear : new Date().getFullYear();
  const targetYear = targetAcademicYear ?? lastRecordedYear + 1;
  const now = new Date().toISOString();

  // Guard: Zero or insufficient history
  if (n < 2) {
    const defaultIntake = n === 1 ? sortedPoints[0]!.regularCount : approvedIntake;
    const uncertainty = calculateForecastUncertainty(
      sortedPoints.map((p) => p.regularCount),
      defaultIntake,
    );
    const scenarios = generateIntakeScenarios(
      defaultIntake,
      approvedIntake,
      uncertainty.marginOfError,
      userAdjustmentPercent,
    );

    return {
      programmeCode,
      programmeName,
      targetAcademicYear: targetYear,
      approvedIntake,
      status: "insufficient_data",
      selectedModel: "insufficient_data",
      modelName: "Insufficient Historical Data",
      projectedRegularIntake: defaultIntake,
      projectedTotalIntake: defaultIntake,
      projectedUtilization:
        approvedIntake > 0 ? Number(((defaultIntake / approvedIntake) * 100).toFixed(1)) : 0,
      remainingCapacity: Math.max(0, approvedIntake - defaultIntake),
      historicalYearsUsed: sortedPoints.map((p) => p.academicYear),
      historicalPointsCount: n,
      uncertainty,
      scenarios,
      explanation:
        "Insufficient historical data: At least 2 historical academic years are required for preliminary trend projection, and 3 or more for rolling backtested model selection. Showing baseline capacity fallback.",
      assumptions: [
        "No historical trend can be reliably computed with fewer than 2 data points.",
        "Projections require historical admissions data to establish baseline variation.",
      ],
      limitations: [
        "Statistical error metrics cannot be determined.",
        "Cannot be used as a predictive indicator until additional academic years are imported.",
      ],
      lastCalculatedAt: now,
    };
  }

  // Handle n == 2: Preliminary trend
  if (n === 2) {
    const regularCounts = sortedPoints.map((p) => p.regularCount);
    const projectedVal = calculateWeightedMovingAverage(regularCounts, [1, 2]);
    const uncertainty = calculateForecastUncertainty(regularCounts, projectedVal);
    const scenarios = generateIntakeScenarios(
      projectedVal,
      approvedIntake,
      uncertainty.marginOfError,
      userAdjustmentPercent,
    );
    const projectedUtil =
      approvedIntake > 0 ? Number(((projectedVal / approvedIntake) * 100).toFixed(1)) : 0;

    return {
      programmeCode,
      programmeName,
      targetAcademicYear: targetYear,
      approvedIntake,
      status: "preliminary",
      selectedModel: "weighted_moving_average",
      modelName: "Weighted Moving Average (2-Year Preliminary)",
      projectedRegularIntake: projectedVal,
      projectedTotalIntake: projectedVal,
      projectedUtilization: projectedUtil,
      remainingCapacity: Math.max(0, approvedIntake - projectedVal),
      historicalYearsUsed: sortedPoints.map((p) => p.academicYear),
      historicalPointsCount: n,
      uncertainty,
      scenarios,
      explanation: `Preliminary projection of ${projectedVal} regular students is based on a weighted 2-year average (${sortedPoints[0]!.academicYear} & ${sortedPoints[1]!.academicYear}), with higher weight given to ${sortedPoints[1]!.academicYear}. Rolling backtesting requires 3+ years.`,
      assumptions: [
        `Admission trends will mirror the direction established between ${sortedPoints[0]!.academicYear} and ${sortedPoints[1]!.academicYear}.`,
        "Approved intake parameters remain unchanged across compared periods.",
      ],
      limitations: [
        "Small sample size (N=2): Susceptible to single-year admission shocks.",
        "Backtested accuracy metrics (MAE/WAPE) cannot be computed with only two observations.",
      ],
      lastCalculatedAt: now,
    };
  }

  // Handle n >= 3: Full backtested model selection
  const evaluations = backtestForecastingModels(sortedPoints);
  const bestModelEval = evaluations[0]!;

  const regularCounts = sortedPoints.map((p) => p.regularCount);
  const years = sortedPoints.map((p) => p.academicYear);

  let projectedVal: number;
  let modelName: string;
  let rSquared: number | undefined;

  if (bestModelEval.modelType === "linear_regression") {
    const reg = calculateLinearRegression(years, regularCounts);
    projectedVal = reg.predict(targetYear);
    modelName = "Linear Trend Regression (OLS)";
    rSquared = reg.rSquared;
  } else if (bestModelEval.modelType === "moving_average") {
    projectedVal = calculateMovingAverage(regularCounts, 3);
    modelName = "Simple Moving Average (3-Year Baseline)";
  } else {
    projectedVal = calculateWeightedMovingAverage(regularCounts);
    modelName = "Weighted Moving Average (Recent-Year Weighted)";
  }

  const uncertainty = calculateForecastUncertainty(regularCounts, projectedVal, rSquared);
  const scenarios = generateIntakeScenarios(
    projectedVal,
    approvedIntake,
    uncertainty.marginOfError,
    userAdjustmentPercent,
  );
  const projectedUtil =
    approvedIntake > 0 ? Number(((projectedVal / approvedIntake) * 100).toFixed(1)) : 0;

  const trainingPeriodStr = `${sortedPoints[0]!.academicYear}–${sortedPoints[n - 1]!.academicYear}`;
  const explanation =
    `Projected regular intake of ${projectedVal} seats is estimated using ${modelName}, selected via rolling-origin backtesting across ${n} academic years (${trainingPeriodStr}). ` +
    `Backtested model accuracy: WAPE ${bestModelEval.wape}%, MAE ±${bestModelEval.mae} students. ` +
    `This estimate is an advisory planning indicator and does not represent an official regulatory directive.`;

  return {
    programmeCode,
    programmeName,
    targetAcademicYear: targetYear,
    approvedIntake,
    status: "reliable",
    selectedModel: bestModelEval.modelType,
    modelName,
    projectedRegularIntake: projectedVal,
    projectedTotalIntake: projectedVal,
    projectedUtilization: projectedUtil,
    remainingCapacity: Math.max(0, approvedIntake - projectedVal),
    historicalYearsUsed: years,
    historicalPointsCount: n,
    accuracyMetrics: {
      mae: bestModelEval.mae,
      wape: bestModelEval.wape,
      testOriginsCount: bestModelEval.actuals.length,
    },
    uncertainty,
    scenarios,
    explanation,
    assumptions: [
      `Historical admission momentum from ${trainingPeriodStr} persists into academic year ${targetYear}.`,
      "State counseling procedures and institutional seat quotas maintain structural stability.",
      "Supernumerary seats (NRI, TFWS, PMSSS, Lateral Entry) are managed outside regular capacity limits.",
    ],
    limitations: [
      "Exogenous factors such as new competing institutions or macroeconomic shifts are not captured in statistical time-series.",
      "Model assumes consistent reporting standards across all recorded academic years.",
    ],
    lastCalculatedAt: now,
  };
}

/**
 * Aggregates programme forecasts into an institutional intelligence summary.
 */
export function aggregateInstitutionIntakeIntelligence(
  programmes: {
    courseCode: string;
    courseName?: string | null | undefined;
    approvedIntake: number;
    history: HistoricalIntakePoint[];
  }[],
  targetAcademicYear?: number,
  userAdjustmentPercent?: number,
): InstitutionIntakeIntelligenceSummary {
  const targetYear = targetAcademicYear ?? new Date().getFullYear() + 1;
  const programmeSummaries: ProgrammeForecastResult[] = [];

  let totalApprovedCapacity = 0;
  let currentRegularAdmitted = 0;
  let currentSupernumerary = 0;
  let currentLateral = 0;
  let totalCurrentAdmitted = 0;
  let projectedDemandTotal = 0;

  // Build academic year trend map
  const yearAggMap = new Map<
    number,
    {
      approved: number;
      regular: number;
      supernumerary: number;
      lateral: number;
      total: number;
    }
  >();

  for (const prog of programmes) {
    totalApprovedCapacity += prog.approvedIntake;

    const forecast = generateProgrammeIntakeForecast(
      prog.courseCode,
      prog.courseName,
      prog.approvedIntake,
      prog.history,
      targetYear,
      userAdjustmentPercent,
    );
    programmeSummaries.push(forecast);
    projectedDemandTotal += forecast.projectedRegularIntake;

    // Accumulate historical trend points
    for (const pt of prog.history) {
      if (!yearAggMap.has(pt.academicYear)) {
        yearAggMap.set(pt.academicYear, {
          approved: 0,
          regular: 0,
          supernumerary: 0,
          lateral: 0,
          total: 0,
        });
      }
      const agg = yearAggMap.get(pt.academicYear)!;
      agg.approved += pt.approvedIntake;
      agg.regular += pt.regularCount;
      agg.supernumerary += pt.supernumeraryCount;
      agg.lateral += pt.lateralCount;
      agg.total += pt.totalCount;
    }

    // Get current (most recent) figures
    if (prog.history.length > 0) {
      const sortedHistory = [...prog.history].sort((a, b) => b.academicYear - a.academicYear);
      const latest = sortedHistory[0]!;
      currentRegularAdmitted += latest.regularCount;
      currentSupernumerary += latest.supernumeraryCount;
      currentLateral += latest.lateralCount;
      totalCurrentAdmitted += latest.totalCount;
    }
  }

  const overallUtilizationRate =
    totalApprovedCapacity > 0
      ? Number(((currentRegularAdmitted / totalApprovedCapacity) * 100).toFixed(1))
      : 0;

  const projectedOverallUtilization =
    totalApprovedCapacity > 0
      ? Number(((projectedDemandTotal / totalApprovedCapacity) * 100).toFixed(1))
      : 0;

  const earlyWarnings = evaluateIntakeEarlyWarnings(programmeSummaries);

  const reliableForecastsCount = programmeSummaries.filter((p) => p.status === "reliable").length;
  const preliminaryForecastsCount = programmeSummaries.filter(
    (p) => p.status === "preliminary",
  ).length;
  const insufficientDataCount = programmeSummaries.filter(
    (p) => p.status === "insufficient_data",
  ).length;
  const flaggedProgrammesCount = new Set(earlyWarnings.map((w) => w.programmeCode)).size;

  // Format historical trend array
  const historicalTrend = Array.from(yearAggMap.entries())
    .sort(([yrA], [yrB]) => yrA - yrB)
    .map(([yr, data]) => ({
      academicYear: yr,
      approvedCapacity: data.approved,
      regularAdmissions: data.regular,
      supernumeraryAdmissions: data.supernumerary,
      lateralAdmissions: data.lateral,
      totalAdmissions: data.total,
      utilizationRate:
        data.approved > 0 ? Number(((data.regular / data.approved) * 100).toFixed(1)) : 0,
      projectedDemand: null as number | null,
    }));

  // Append target forecast year to trend for visualization
  if (
    historicalTrend.length > 0 &&
    targetYear > historicalTrend[historicalTrend.length - 1]!.academicYear
  ) {
    historicalTrend.push({
      academicYear: targetYear,
      approvedCapacity: totalApprovedCapacity,
      regularAdmissions: 0,
      supernumeraryAdmissions: 0,
      lateralAdmissions: 0,
      totalAdmissions: 0,
      utilizationRate: projectedOverallUtilization,
      projectedDemand: projectedDemandTotal,
    });
  }

  return {
    targetYear,
    totalApprovedCapacity,
    currentRegularAdmitted,
    currentSupernumerary,
    currentLateral,
    totalCurrentAdmitted,
    overallUtilizationRate,
    projectedDemandTotal,
    projectedOverallUtilization,
    flaggedProgrammesCount,
    reliableForecastsCount,
    preliminaryForecastsCount,
    insufficientDataCount,
    earlyWarnings,
    programmeSummaries,
    historicalTrend,
  };
}
