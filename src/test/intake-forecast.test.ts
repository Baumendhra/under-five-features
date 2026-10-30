import { describe, expect, it } from "vitest";
import {
  calculateMovingAverage,
  calculateWeightedMovingAverage,
  calculateLinearRegression,
  calculateMAE,
  calculateWAPE,
  backtestForecastingModels,
  calculateForecastUncertainty,
  generateIntakeScenarios,
  evaluateIntakeEarlyWarnings,
  generateProgrammeIntakeForecast,
  aggregateInstitutionIntakeIntelligence,
  type HistoricalIntakePoint,
} from "@/lib/intake-forecast";

describe("Predictive Intake Forecasting — Mathematical Primitives", () => {
  it("calculates Simple Moving Average (SMA) accurately", () => {
    // 3-year history: [50, 60, 70] -> average = 60
    expect(calculateMovingAverage([50, 60, 70], 3)).toBe(60);
    // 5-year history with window 3: only last 3 used [60, 70, 80] -> 70
    expect(calculateMovingAverage([40, 50, 60, 70, 80], 3)).toBe(70);
    // Empty array guard
    expect(calculateMovingAverage([])).toBe(0);
    // Window larger than array: averages available points
    expect(calculateMovingAverage([100, 110], 4)).toBe(105);
  });

  it("calculates Weighted Moving Average (WMA) giving higher weight to recent years", () => {
    // History: [40, 50, 60] with linear weights [1, 2, 3]
    // Weighted sum = (40*1 + 50*2 + 60*3) = 40 + 100 + 180 = 320
    // Weight sum = 1 + 2 + 3 = 6
    // 320 / 6 = 53.33 -> round 53
    expect(calculateWeightedMovingAverage([40, 50, 60])).toBe(53);

    // Recent upward trend: [30, 40, 80]
    // (30*1 + 40*2 + 80*3) / 6 = (30 + 80 + 240) / 6 = 350 / 6 = 58.33 -> 58
    // Simple MA would be (30+40+80)/3 = 50. WMA appropriately reflects recent surge (58 > 50)
    expect(calculateWeightedMovingAverage([30, 40, 80])).toBe(58);

    // Custom weights
    expect(calculateWeightedMovingAverage([10, 20], [1, 3])).toBe(18); // (10*1 + 20*3)/4 = 70/4 = 17.5 -> 18
  });

  it("calculates Linear Regression (OLS) slope, intercept, and future projections", () => {
    // Perfect linear sequence: Year 2021: 50, 2022: 60, 2023: 70
    const x = [2021, 2022, 2023];
    const y = [50, 60, 70];
    const reg = calculateLinearRegression(x, y);

    expect(reg.slope).toBe(10);
    expect(reg.rSquared).toBeCloseTo(1.0, 4);
    // Predicting 2024: 70 + 10 = 80
    expect(reg.predict(2024)).toBe(80);
    // Predicting 2025: 80 + 10 = 90
    expect(reg.predict(2025)).toBe(90);

    // Declining trend
    const decX = [2021, 2022, 2023];
    const decY = [60, 50, 40];
    const decReg = calculateLinearRegression(decX, decY);
    expect(decReg.slope).toBe(-10);
    expect(decReg.predict(2024)).toBe(30);

    // Non-negative clamp check: steep drop should not project negative intake
    const steepX = [2021, 2022, 2023];
    const steepY = [50, 20, 5];
    const steepReg = calculateLinearRegression(steepX, steepY);
    expect(steepReg.predict(2025)).toBeGreaterThanOrEqual(0);
  });

  it("evaluates Mean Absolute Error (MAE) correctly", () => {
    const actuals = [100, 120, 130];
    const predictions = [95, 125, 128];
    // Errors: |100-95| = 5, |120-125| = 5, |130-128| = 2 -> total = 12, MAE = 12 / 3 = 4.0
    expect(calculateMAE(actuals, predictions)).toBe(4.0);
    expect(calculateMAE([], [])).toBe(0);
  });

  it("evaluates Weighted Absolute Percentage Error (WAPE) with zero safety", () => {
    const actuals = [100, 100];
    const predictions = [90, 110];
    // Errors: |100-90| = 10, |100-110| = 10 -> sum = 20. Sum actuals = 200. WAPE = 20 / 200 = 10%
    expect(calculateWAPE(actuals, predictions)).toBe(10.0);

    // Safe handling when actuals sum to zero:
    expect(calculateWAPE([0, 0], [0, 0])).toBe(0);
    expect(calculateWAPE([0, 0], [5, 5])).toBe(100);
  });
});

describe("Rolling-Origin Backtesting & Model Selection", () => {
  it("backtests multiple candidate models on historical time series", () => {
    const history: HistoricalIntakePoint[] = [
      {
        academicYear: 2020,
        regularCount: 50,
        lateralCount: 5,
        supernumeraryCount: 2,
        totalCount: 57,
        approvedIntake: 60,
        utilizationRate: 83.3,
      },
      {
        academicYear: 2021,
        regularCount: 55,
        lateralCount: 4,
        supernumeraryCount: 3,
        totalCount: 62,
        approvedIntake: 60,
        utilizationRate: 91.7,
      },
      {
        academicYear: 2022,
        regularCount: 60,
        lateralCount: 6,
        supernumeraryCount: 2,
        totalCount: 68,
        approvedIntake: 60,
        utilizationRate: 100.0,
      },
      {
        academicYear: 2023,
        regularCount: 65,
        lateralCount: 5,
        supernumeraryCount: 4,
        totalCount: 74,
        approvedIntake: 60,
        utilizationRate: 108.3,
      },
    ];

    const evaluations = backtestForecastingModels(history);
    expect(evaluations.length).toBe(3);

    // Linear regression should fit this steady linear growth (+5 per year) with high precision
    const linearModel = evaluations.find((m) => m.modelType === "linear_regression");
    expect(linearModel).toBeDefined();
    expect(linearModel!.wape).toBeLessThanOrEqual(5.0);
    expect(linearModel!.mae).toBeLessThanOrEqual(3.0);

    // Candidate list should be sorted by WAPE ascending
    expect(evaluations[0]!.wape).toBeLessThanOrEqual(evaluations[1]!.wape);
  });

  it("returns empty evaluations if history has fewer than 3 academic years", () => {
    const twoYears: HistoricalIntakePoint[] = [
      {
        academicYear: 2022,
        regularCount: 50,
        lateralCount: 0,
        supernumeraryCount: 0,
        totalCount: 50,
        approvedIntake: 60,
        utilizationRate: 83.3,
      },
      {
        academicYear: 2023,
        regularCount: 55,
        lateralCount: 0,
        supernumeraryCount: 0,
        totalCount: 55,
        approvedIntake: 60,
        utilizationRate: 91.7,
      },
    ];
    expect(backtestForecastingModels(twoYears)).toHaveLength(0);
  });
});

describe("Uncertainty & Scenario Planning Simulation", () => {
  it("computes realistic 80% prediction intervals", () => {
    const actuals = [50, 52, 48, 55, 51];
    const predicted = 53;
    const uncertainty = calculateForecastUncertainty(actuals, predicted);

    expect(uncertainty.lowerBound80).toBeLessThanOrEqual(predicted);
    expect(uncertainty.upperBound80).toBeGreaterThanOrEqual(predicted);
    expect(uncertainty.lowerBound80).toBeGreaterThanOrEqual(0);
    expect(uncertainty.marginOfError).toBeGreaterThan(0);
  });

  it("generates conservative, baseline, high-demand, and custom simulated scenarios", () => {
    const baseline = 60;
    const approved = 60;
    const margin = 8;
    const userAdjustment = 15; // +15% custom simulation

    const scenarios = generateIntakeScenarios(baseline, approved, margin, userAdjustment);

    expect(scenarios.baseline.projectedIntake).toBe(60);
    expect(scenarios.baseline.projectedUtilization).toBe(100);

    // Conservative is lower than baseline
    expect(scenarios.conservative.projectedIntake).toBeLessThan(60);
    expect(scenarios.conservative.projectedUtilization).toBeLessThan(100);

    // High demand is higher than baseline
    expect(scenarios.highDemand.projectedIntake).toBeGreaterThan(60);
    expect(scenarios.highDemand.projectedUtilization).toBeGreaterThan(100);

    // Custom simulated scenario
    expect(scenarios.customSimulated).toBeDefined();
    expect(scenarios.customSimulated!.projectedIntake).toBe(69); // 60 * 1.15 = 69
    expect(scenarios.customSimulated!.projectedUtilization).toBe(115);
  });
});

describe("Capacity Utilization & Supernumerary Separation", () => {
  it("separates regular intake from supernumerary and lateral quotas", () => {
    // Supernumerary and lateral entries do not consume regular approved capacity
    const history: HistoricalIntakePoint[] = [
      {
        academicYear: 2021,
        regularCount: 50,
        lateralCount: 6,
        supernumeraryCount: 8,
        totalCount: 64,
        approvedIntake: 60,
        utilizationRate: 83.3,
      },
      {
        academicYear: 2022,
        regularCount: 52,
        lateralCount: 5,
        supernumeraryCount: 7,
        totalCount: 64,
        approvedIntake: 60,
        utilizationRate: 86.7,
      },
      {
        academicYear: 2023,
        regularCount: 54,
        lateralCount: 6,
        supernumeraryCount: 9,
        totalCount: 69,
        approvedIntake: 60,
        utilizationRate: 90.0,
      },
    ];

    const forecast = generateProgrammeIntakeForecast("ECE", "Electronics", 60, history, 2024);

    // The forecast should target regular intake only
    expect(forecast.projectedRegularIntake).toBeGreaterThanOrEqual(52);
    expect(forecast.remainingCapacity).toBe(60 - forecast.projectedRegularIntake);
    expect(forecast.projectedUtilization).toBeCloseTo(
      (forecast.projectedRegularIntake / 60) * 100,
      1,
    );
  });
});

describe("Data Sufficiency & Transparency Standards", () => {
  it("flags insufficient data status when fewer than 2 years exist", () => {
    const singleYear: HistoricalIntakePoint[] = [
      {
        academicYear: 2023,
        regularCount: 45,
        lateralCount: 0,
        supernumeraryCount: 0,
        totalCount: 45,
        approvedIntake: 60,
        utilizationRate: 75.0,
      },
    ];

    const forecast = generateProgrammeIntakeForecast(
      "MECH",
      "Mechanical Eng",
      60,
      singleYear,
      2024,
    );

    expect(forecast.status).toBe("insufficient_data");
    expect(forecast.selectedModel).toBe("insufficient_data");
    expect(forecast.explanation).toContain("Insufficient historical data");
  });

  it("flags preliminary status for 2 years of history", () => {
    const twoYears: HistoricalIntakePoint[] = [
      {
        academicYear: 2022,
        regularCount: 40,
        lateralCount: 0,
        supernumeraryCount: 0,
        totalCount: 40,
        approvedIntake: 60,
        utilizationRate: 66.7,
      },
      {
        academicYear: 2023,
        regularCount: 46,
        lateralCount: 0,
        supernumeraryCount: 0,
        totalCount: 46,
        approvedIntake: 60,
        utilizationRate: 76.7,
      },
    ];

    const forecast = generateProgrammeIntakeForecast("CIVIL", "Civil Eng", 60, twoYears, 2024);

    expect(forecast.status).toBe("preliminary");
    expect(forecast.selectedModel).toBe("weighted_moving_average");
    expect(forecast.accuracyMetrics).toBeUndefined(); // Backtesting not possible with N=2
    expect(forecast.explanation).toContain("Preliminary projection");
  });

  it("includes legal disclaimer that forecasts are not official regulatory determinations", () => {
    const threeYears: HistoricalIntakePoint[] = [
      {
        academicYear: 2021,
        regularCount: 55,
        lateralCount: 0,
        supernumeraryCount: 0,
        totalCount: 55,
        approvedIntake: 60,
        utilizationRate: 91.7,
      },
      {
        academicYear: 2022,
        regularCount: 58,
        lateralCount: 0,
        supernumeraryCount: 0,
        totalCount: 58,
        approvedIntake: 60,
        utilizationRate: 96.7,
      },
      {
        academicYear: 2023,
        regularCount: 57,
        lateralCount: 0,
        supernumeraryCount: 0,
        totalCount: 57,
        approvedIntake: 60,
        utilizationRate: 95.0,
      },
    ];

    const forecast = generateProgrammeIntakeForecast(
      "CSE",
      "Computer Science",
      60,
      threeYears,
      2024,
    );

    expect(forecast.status).toBe("reliable");
    expect(forecast.accuracyMetrics).toBeDefined();
    expect(forecast.explanation).toContain(
      "advisory planning indicator and does not represent an official regulatory directive",
    );
  });
});

describe("Early-Warning Engine", () => {
  it("triggers under-utilization warning when projected intake < 60%", () => {
    const underUtilHistory: HistoricalIntakePoint[] = [
      {
        academicYear: 2021,
        regularCount: 30,
        lateralCount: 0,
        supernumeraryCount: 0,
        totalCount: 30,
        approvedIntake: 100,
        utilizationRate: 30,
      },
      {
        academicYear: 2022,
        regularCount: 32,
        lateralCount: 0,
        supernumeraryCount: 0,
        totalCount: 32,
        approvedIntake: 100,
        utilizationRate: 32,
      },
      {
        academicYear: 2023,
        regularCount: 31,
        lateralCount: 0,
        supernumeraryCount: 0,
        totalCount: 31,
        approvedIntake: 100,
        utilizationRate: 31,
      },
    ];

    const forecast = generateProgrammeIntakeForecast("BIO", "Biotech", 100, underUtilHistory, 2024);
    const warnings = evaluateIntakeEarlyWarnings([forecast]);

    const underUtilWarn = warnings.find((w) => w.code === "UNDER_UTILIZATION");
    expect(underUtilWarn).toBeDefined();
    expect(underUtilWarn!.severity).toBe("high"); // < 40% is high severity
    expect(underUtilWarn!.message.toLowerCase()).toContain("approved capacity");
  });

  it("triggers capacity pressure warning when projected intake >= 95% or exceeds approved", () => {
    const overCapacityHistory: HistoricalIntakePoint[] = [
      {
        academicYear: 2021,
        regularCount: 58,
        lateralCount: 0,
        supernumeraryCount: 0,
        totalCount: 58,
        approvedIntake: 60,
        utilizationRate: 96.7,
      },
      {
        academicYear: 2022,
        regularCount: 60,
        lateralCount: 0,
        supernumeraryCount: 0,
        totalCount: 60,
        approvedIntake: 60,
        utilizationRate: 100,
      },
      {
        academicYear: 2023,
        regularCount: 62,
        lateralCount: 0,
        supernumeraryCount: 0,
        totalCount: 62,
        approvedIntake: 60,
        utilizationRate: 103.3,
      },
    ];

    const forecast = generateProgrammeIntakeForecast(
      "AIML",
      "AI & ML",
      60,
      overCapacityHistory,
      2024,
    );
    const warnings = evaluateIntakeEarlyWarnings([forecast]);

    const capacityWarn = warnings.find((w) => w.code === "CAPACITY_PRESSURE");
    expect(capacityWarn).toBeDefined();
    expect(capacityWarn!.message.toLowerCase()).toContain("approved intake");
  });

  it("triggers data insufficiency warning when programme has fewer than 2 years recorded", () => {
    const forecast = generateProgrammeIntakeForecast("NEW-PROG", "New Programme", 60, [], 2024);
    const warnings = evaluateIntakeEarlyWarnings([forecast]);

    const dataWarn = warnings.find((w) => w.code === "DATA_INSUFFICIENT");
    expect(dataWarn).toBeDefined();
    expect(dataWarn!.suggestedAction).toContain("Upload prior academic year student registries");
  });
});

describe("Institutional Intake Intelligence Aggregation", () => {
  it("aggregates multi-programme institution metrics and historical trends accurately", () => {
    const programmes = [
      {
        courseCode: "CSE",
        courseName: "Computer Science",
        approvedIntake: 60,
        history: [
          {
            academicYear: 2022,
            regularCount: 58,
            lateralCount: 5,
            supernumeraryCount: 4,
            totalCount: 67,
            approvedIntake: 60,
            utilizationRate: 96.7,
          },
          {
            academicYear: 2023,
            regularCount: 60,
            lateralCount: 6,
            supernumeraryCount: 5,
            totalCount: 71,
            approvedIntake: 60,
            utilizationRate: 100.0,
          },
        ],
      },
      {
        courseCode: "ECE",
        courseName: "Electronics",
        approvedIntake: 60,
        history: [
          {
            academicYear: 2022,
            regularCount: 45,
            lateralCount: 4,
            supernumeraryCount: 3,
            totalCount: 52,
            approvedIntake: 60,
            utilizationRate: 75.0,
          },
          {
            academicYear: 2023,
            regularCount: 48,
            lateralCount: 4,
            supernumeraryCount: 3,
            totalCount: 55,
            approvedIntake: 60,
            utilizationRate: 80.0,
          },
        ],
      },
    ];

    const summary = aggregateInstitutionIntakeIntelligence(programmes, 2024);

    expect(summary.totalApprovedCapacity).toBe(120);
    // Current (2023) regular = 60 + 48 = 108
    expect(summary.currentRegularAdmitted).toBe(108);
    // Current supernumerary = 5 + 3 = 8
    expect(summary.currentSupernumerary).toBe(8);
    // Current lateral = 6 + 4 = 10
    expect(summary.currentLateral).toBe(10);
    // Overall utilization = 108 / 120 = 90%
    expect(summary.overallUtilizationRate).toBe(90.0);

    // Projected demand is aggregated from individual programmes
    expect(summary.projectedDemandTotal).toBeGreaterThan(100);
    expect(summary.historicalTrend.length).toBeGreaterThanOrEqual(2);
  });
});
