import type { PatientState, ResourceState, Sop, Status, LearnedModel } from "../types";

export function evaluate(model: LearnedModel, sop: Sop, patient: PatientState, resources: ResourceState[], now: number) {
  const current = model.nodes.find((item) => patient.currentStep === item.id);
  const pathway = sop.pathways[patient.pathway];
  const transition = patient.previousStep ? [patient.previousStep, patient.currentStep] as [string, string] : undefined;
  const allowed = transition && pathway?.allowedTransitions.some(([from, to]) => from === transition[0] && to === transition[1]);
  const prerequisites = pathway?.prerequisites[patient.currentStep] ?? [];
  const hasPrerequisite = prerequisites.length === 0 || prerequisites.some((step) => patient.orderedSteps?.includes(step));
  const edge = transition && model.edges.find((item) => item.from === transition[0] && item.to === transition[1]);
  let status: Status = "ON_TRACK";
  let reason = "within expected pathway";
  if ((patient.currentStep === "DISCHARGE" || patient.currentStep === "ADMIT") && !hasPrerequisite) {
    status = "UNEXPECTED";
    reason = `Step skipped (Discharged without ${prerequisites.join(" or ")}, expected for ${patient.pathway.toLowerCase().replaceAll("_", " ")})`;
  } else if (transition && (!allowed || !edge)) {
    status = "UNEXPECTED";
    reason = !allowed ? `Never seen (not in SOP: ${transition[0]} before ${transition[1]})` : "Never seen (no learned edge)";
  } else if (!hasPrerequisite) {
    status = "UNEXPECTED";
    reason = `prerequisite missing: no test ordered before ${patient.currentStep}`;
  } else if (edge && edge.prob < 0.03) {
    status = "UNEXPECTED";
    reason = `Rare path (${Math.round(edge.prob * 100)}%)`;
  } else if (current) {
    const elapsed = now - patient.lastEventT;
    const limit = current.visits < 30 ? pathway?.defaultMaxMinutes[patient.currentStep] ?? current.p90Min : current.p90Min;
    if (elapsed > limit) {
      status = "LATE";
      if (elapsed > limit) reason = `Late (${elapsed} min; 90% move on within ${limit} min)`;
      else if (elapsed > current.medianMin * 1.5) reason = `Slower (${elapsed} min; over 1.5 times the median)`;
    }
  }
  const blockedBy = current?.needs && resources.find((resource) => resource.id === current.needs && (resource.status === "DOWN" || resource.available === 0))?.id;
  return { status, reason: blockedBy ? `${reason}; ${blockedBy} unavailable` : reason, blockedBy, predictedNext: model.edges.filter((edge) => edge.from === patient.currentStep).sort((a, b) => b.prob - a.prob) };
}
