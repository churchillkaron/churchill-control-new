function projectRequest(request) {
  if (!request) return null;
  return {
    status: request.status || null,
    rejectionReason: request.rejectionReason || null,
    createdAt: request.createdAt || null,
    approvedAt: request.approvedAt || null,
    rejectedAt: request.rejectedAt || null,
    expiresAt: request.expiresAt || null,
    reason: request.reason || null,
    targets: Array.isArray(request.targets) ? request.targets : [],
    failureCode: request.failureCode || null,
  };
}

export function projectStaffClockInExceptionState(state = {}) {
  const requests = (Array.isArray(state.requests) ? state.requests : [])
    .map(projectRequest)
    .filter(Boolean);
  return {
    requests,
    latest: projectRequest(state.latest),
    activeApprovedTargets: Array.isArray(state.activeApprovedTargets)
      ? state.activeApprovedTargets
      : [],
    pendingTargets: Array.isArray(state.pendingTargets)
      ? state.pendingTargets
      : [],
  };
}

export function projectStaffClockInExceptionRequest(result = {}) {
  return {
    created: result.created === true,
    request: projectRequest(result.request),
  };
}

export default Object.freeze({
  projectStaffClockInExceptionState,
  projectStaffClockInExceptionRequest,
});
