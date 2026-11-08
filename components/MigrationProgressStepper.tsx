"use client";

import { useState, useEffect } from "react";

export interface PipelineStage {
  id: number;
  label: string;
  detail: string;
}

export const PIPELINE_STAGES: PipelineStage[] = [
  {
    id: 1,
    label: "Source Fingerprint & Manifest Ingestion",
    detail: "Pinning commit revision, reading bounded file tree, and indexing dependencies.",
  },
  {
    id: 2,
    label: "AST Route Extraction & Hierarchy Mapping",
    detail: "Parsing JSX/TSX route trees and mapping static routes against target conventions.",
  },
  {
    id: 3,
    label: "Procedural Memory Rule Matching",
    detail: "Querying promoted repair rules and learned transformation fixtures for target stack.",
  },
  {
    id: 4,
    label: "Autonomous Target Code Synthesis",
    detail: "Synthesizing route screens, layout scaffolding, TypeScript configs, and READMEs.",
  },
  {
    id: 5,
    label: "AST Output Guard & Sandbox Validation",
    detail: "Enforcing element restrictions, blocking Node built-ins, and verifying imports.",
  },
  {
    id: 6,
    label: "Archive Packaging & Artifact Unpacking",
    detail: "Synthesizing compressed ZIP blob, unrolling memory tree, and compiling line diffs.",
  },
];

interface MigrationProgressStepperProps {
  currentStage: number; // 1 to 6
  isComplete: boolean;
  error?: string | null;
  targetStack: string;
}

export function MigrationProgressStepper({
  currentStage,
  isComplete,
  error,
  targetStack,
}: MigrationProgressStepperProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (isComplete || error) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => +(prev + 0.1).toFixed(1));
    }, 100);
    return () => clearInterval(interval);
  }, [isComplete, error]);

  const effectiveStage = isComplete ? 6 : Math.max(1, Math.min(6, currentStage));
  const progressPercent = isComplete ? 100 : Math.round(((effectiveStage - 0.5) / 6) * 100);

  return (
    <div className="stepper-workspace-card animate-fadein" role="status" aria-live="polite">
      {/* Header with Title and Timer */}
      <div className="stepper-header-row">
        <div className="stepper-header-left">
          <div className="stepper-live-dot-wrap">
            <span className={`stepper-live-dot ${error ? "is-error" : isComplete ? "is-done" : "is-active"}`} />
          </div>
          <div>
            <h3 className="stepper-title">
              {isComplete
                ? `Autonomous Migration to ${targetStack} Complete`
                : error
                ? "Transformation Pipeline Interrupted"
                : `Synthesizing ${targetStack} Project`}
            </h3>
            <p className="stepper-subtitle">
              {isComplete
                ? "All 6 pipeline stages successfully verified. Artifacts ready for inspection below."
                : error
                ? "A fatal validation or network exception halted execution."
                : `Executing deterministic cross-stack migration pipeline (${effectiveStage} of 6)...`}
            </p>
          </div>
        </div>

        <div className="stepper-timer-badge">
          <span className="timer-lbl">ELAPSED:</span>
          <span className="timer-val">{elapsedSeconds.toFixed(1)}s</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="stepper-progress-track" aria-hidden="true">
        <div
          className={`stepper-progress-fill ${error ? "is-error" : isComplete ? "is-complete" : ""}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Pipeline Stage Items */}
      <div className="stepper-stages-list">
        {PIPELINE_STAGES.map((stage) => {
          const isDone = isComplete || stage.id < effectiveStage;
          const isCurrent = !isComplete && stage.id === effectiveStage;
          const isFailed = isCurrent && Boolean(error);

          return (
            <div
              key={stage.id}
              className={`stage-row ${
                isFailed ? "is-failed" : isDone ? "is-done" : isCurrent ? "is-current" : "is-pending"
              }`}
            >
              <div className="stage-indicator-col">
                <div className="stage-bubble">
                  {isFailed ? (
                    <span>✕</span>
                  ) : isDone ? (
                    <span>✓</span>
                  ) : isCurrent ? (
                    <span className="stage-spinner" />
                  ) : (
                    <span>{stage.id}</span>
                  )}
                </div>
                {stage.id < 6 && <div className="stage-connector-line" />}
              </div>

              <div className="stage-content-col">
                <div className="stage-title-wrap">
                  <span className="stage-label">{stage.label}</span>
                  {isCurrent && !isFailed && <span className="stage-pill active">ACTIVE</span>}
                  {isDone && <span className="stage-pill done">DONE</span>}
                  {isFailed && <span className="stage-pill error">ERROR</span>}
                </div>
                <p className="stage-detail">{stage.detail}</p>
                {isFailed && error && (
                  <div className="stage-error-box">
                    <strong>Failure Details:</strong> {error}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
