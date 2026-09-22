export function projectStaffActivation(activation = {}) {
  const steps = activation.steps || {};
  return {
    complete: activation.complete === true,
    status: activation.status || null,
    steps: {
      email: {
        complete: steps.email?.complete === true,
        status: steps.email?.status || null,
      },
      phone: {
        complete: steps.phone?.complete === true,
        status: steps.phone?.status || null,
        phoneMasked: steps.phone?.phoneMasked || null,
      },
      identity: {
        complete: steps.identity?.complete === true,
        status: steps.identity?.status || null,
      },
      passkey: {
        complete: steps.passkey?.complete === true,
        status: steps.passkey?.status || null,
        enrolled: steps.passkey?.enrolled === true,
      },
    },
  };
}

export default Object.freeze({ projectStaffActivation });
