const jobHandlers = new Map();

export function registerJobHandler(
  type,
  handler
) {

  jobHandlers.set(
    type,
    handler
  );

}

export function getJobHandler(
  type
) {

  return jobHandlers.get(
    type
  );

}

export function getRegisteredJobTypes() {

  return Array.from(
    jobHandlers.keys()
  );

}
