import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const runtime=fs.readFileSync(new URL('../lib/people/workforce/StaffPhoneVerificationRuntime.js',import.meta.url),'utf8');
const route=fs.readFileSync(new URL('../app/api/staff/phone-verification/route.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../components/staff/StaffActivationSetup.jsx',import.meta.url),'utf8');

test('phone verification supports first-time phone entry without persisting raw OTP or unverified phone',()=>{
  assert.match(runtime,/import crypto from "node:crypto"/);
  assert.match(runtime,/verificationPhone = requestedPhone \|\| canonical\.phone/);
  assert.match(runtime,/phone_hash: phoneHash\(verificationPhone\)/);
  assert.match(runtime,/code_hmac: otpHash/);
  assert.doesNotMatch(runtime,/code:\s*code,/);
  const promotion=runtime.indexOf('.update({ phone: verificationPhone');
  const compare=runtime.indexOf('safeEqual(challenge.data.code_hmac, candidateHash)');
  assert.ok(promotion>compare,'canonical phone must be promoted only after OTP proof');
});

test('phone API binds both send and verify to the entered phone',()=>{
  assert.match(route,/requestStaffPhoneVerification\(\{[^}]*phone: body\.phone/s);
  assert.match(route,/verifyStaffPhoneCode\(\{[^}]*phone: body\.phone/s);
});

test('activation UI exposes E.164 phone input only when canonical phone is absent',()=>{
  assert.match(ui,/aria-label="International phone number"/);
  assert.match(ui,/placeholder="\+66812345678"/);
  assert.match(ui,/!steps\.phone\?\.phoneMasked/);
  assert.match(ui,/body: JSON\.stringify\(\{ phone: phoneNumber\.trim\(\) \|\| undefined \}\)/);
});
