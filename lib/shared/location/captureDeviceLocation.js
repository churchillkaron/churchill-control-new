export function captureDeviceLocation({ timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("GPS location is not available on this device"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date(position.timestamp).toISOString(),
        });
      },
      (error) => {
        if (error?.code === 1) {
          reject(new Error("Location permission is required for this action"));
          return;
        }

        if (error?.code === 2) {
          reject(new Error("Your location could not be determined. Check GPS and try again"));
          return;
        }

        if (error?.code === 3) {
          reject(new Error("Location request timed out. Try again where GPS signal is stronger"));
          return;
        }

        reject(new Error("Unable to capture your location"));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: timeoutMs,
      }
    );
  });
}

export default captureDeviceLocation;
