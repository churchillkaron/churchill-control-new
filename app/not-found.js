import PlatformFailureCaptureBeacon from "@/components/platform/self-healing/PlatformFailureCaptureBeacon";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen text-white">
      <PlatformFailureCaptureBeacon
        category="route_not_found"
        statusCode={404}
        errorMessage="Application route not found"
        action="open application route"
      />
      <h1>Page not found</h1>
    </div>
  );
}
