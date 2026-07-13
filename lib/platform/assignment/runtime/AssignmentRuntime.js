import {
  createAssignment,
} from "../documents/Assignment";


export const AssignmentRuntime = {


  create(input) {

    return createAssignment(input);

  },


};
