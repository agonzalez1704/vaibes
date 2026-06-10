import { useEffect, useState } from 'react';
import * as ScreenCapture from 'expo-screen-capture';

// Lightweight hook — returns a boolean that flips true once when a screenshot
// is detected, and lets the caller reset it after handling.
export function useScreenshotDetected(): { detected: boolean; clear: () => void } {
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    const sub = ScreenCapture.addScreenshotListener(() => {
      setDetected(true);
    });
    return () => {
      sub.remove();
    };
  }, []);

  return { detected, clear: () => setDetected(false) };
}
