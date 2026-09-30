import type { DeliveredRepo } from "../delivery/summary.ts";
import type { FramingOutcome } from "../framing/workflow.ts";
import type { RunContext } from "../run.ts";

export interface ClosingContext extends RunContext {
  readonly framing: FramingOutcome;
  readonly delivered: readonly DeliveredRepo[];
}
