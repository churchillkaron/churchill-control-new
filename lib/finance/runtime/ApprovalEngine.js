/**
 * APPROVAL ENGINE (LEVEL 6 CORE)
 * Human-in-the-loop financial control system
 */

const pendingApprovals = [];

export function createApprovalRequest(request) {
  const approval = {
    id: `${Date.now()}-${Math.random()}`,
    status: "PENDING",
    ...request
  };

  pendingApprovals.push(approval);
  return approval;
}

export function approveRequest(id) {
  const req = pendingApprovals.find(r => r.id === id);
  if (req) req.status = "APPROVED";
  return req;
}

export function rejectRequest(id) {
  const req = pendingApprovals.find(r => r.id === id);
  if (req) req.status = "REJECTED";
  return req;
}

export function getPendingApprovals() {
  return pendingApprovals.filter(r => r.status === "PENDING");
}
