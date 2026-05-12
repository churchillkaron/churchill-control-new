# Route Migration Template

## Goal

Convert routes into:

Route
→ validation
→ tenant resolution
→ service orchestration
→ standardized response

---

# BEFORE

Typical bad route:
- DB queries inside route
- calculations inside route
- tenant logic inside route
- duplicated try/catch
- duplicated validation

---

# AFTER

## Route Example

```js
import { withApiHandler }
from "@/lib/shared/http/withApiHandler";

import { requireFields }
from "@/lib/shared/validation/required";

import { getTenantId }
from "@/lib/shared/tenant/getTenantId";

import { someService }
from "@/lib/domain/services/someService";

export const POST = withApiHandler(
  "scope-name",

  async (request) => {

    const body =
      await request.json();

    requireFields(body, [
      "field",
    ]);

    const tenantId =
      getTenantId(request);

    return await someService({
      tenantId,
      ...body,
    });

  }
);