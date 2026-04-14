import { Suspense } from "react";
import ControlFinal from "./ControlFinal";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 20 }}>Loading...</div>}>
      <ControlFinal />
    </Suspense>
  );
}