import assert from "node:assert/strict";
import test from "node:test";

import {
  AVANTIQO_EXPERT_PREFIX_CONTRACT,
  buildAvantiqoExpertPrefix,
  prependAvantiqoExpertPrefix,
  resolveAvantiqoExpertDomain,
} from "../lib/intelligence/runtime/AvantiqoExpertPrefixRuntime.js";

test("expert prefix is deterministic for the same domain despite volatile context", () => {
  const first = buildAvantiqoExpertPrefix({
    context: {
      intelligence_domain: "business",
      request_id: "request-a",
      now: "2026-08-31T03:00:00Z",
      organization_id: "org-a",
    },
  });
  const second = buildAvantiqoExpertPrefix({
    context: {
      intelligence_domain: "business",
      request_id: "request-b",
      now: "2026-08-31T04:00:00Z",
      organization_id: "org-b",
    },
  });

  assert.equal(first.contract, AVANTIQO_EXPERT_PREFIX_CONTRACT);
  assert.equal(first.domain, "business");
  assert.equal(first.content, second.content);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.contains_volatile_context, false);
});

test("specialist domain aliases canonicalize before fingerprinting", () => {
  const software = buildAvantiqoExpertPrefix({ domain: "software" });
  const engineering = buildAvantiqoExpertPrefix({ domain: "engineering" });
  const code = buildAvantiqoExpertPrefix({ domain: "code" });

  assert.equal(software.domain, "code");
  assert.equal(engineering.domain, "code");
  assert.equal(software.fingerprint, code.fingerprint);
  assert.equal(engineering.fingerprint, code.fingerprint);
});

test("business, Avantiqo and code receive distinct stable expert prefixes", () => {
  const business = buildAvantiqoExpertPrefix({ domain: "business" });
  const avantiqo = buildAvantiqoExpertPrefix({ domain: "avantiqo" });
  const code = buildAvantiqoExpertPrefix({ domain: "code" });

  assert.notEqual(business.fingerprint, avantiqo.fingerprint);
  assert.notEqual(avantiqo.fingerprint, code.fingerprint);
  assert.notEqual(code.fingerprint, business.fingerprint);
});

test("context domain is resolved without admitting arbitrary context into the prefix", () => {
  const input = {
    context: {
      intelligence_domain: "avantiqo",
      secret: "must-not-enter-prefix",
      timestamp: "volatile",
    },
  };
  const prefix = buildAvantiqoExpertPrefix(input);

  assert.equal(resolveAvantiqoExpertDomain(input), "avantiqo");
  assert.doesNotMatch(prefix.content, /must-not-enter-prefix/);
  assert.doesNotMatch(prefix.content, /volatile/);
});

test("prefix is the first message and caller messages retain exact order and values", () => {
  const callerMessages = [
    { role: "system", content: "Repository-specific instructions." },
    { role: "user", content: "Debug the failing runtime." },
  ];
  const prepared = prependAvantiqoExpertPrefix(callerMessages, { domain: "code" });

  assert.equal(prepared.messages[0].role, "system");
  assert.equal(prepared.messages[0].content, prepared.prefix.content);
  assert.deepEqual(prepared.messages.slice(1), callerMessages);
  assert.equal(callerMessages.length, 2);
});

test("unknown domains safely fall back to general instead of fragmenting the cache", () => {
  const unknownA = buildAvantiqoExpertPrefix({ domain: "random-a" });
  const unknownB = buildAvantiqoExpertPrefix({ domain: "random-b" });

  assert.equal(unknownA.domain, "general");
  assert.equal(unknownB.domain, "general");
  assert.equal(unknownA.fingerprint, unknownB.fingerprint);
});
