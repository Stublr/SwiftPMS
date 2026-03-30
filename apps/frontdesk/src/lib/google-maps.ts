let loaded = false;
let loading = false;
const callbacks: (() => void)[] = [];

/**
 * Dynamically loads the Google Maps Places API.
 * Reads the key from VITE_GOOGLE_MAPS_API_KEY env var.
 * No-ops if the key isn't set.
 */
export function loadGoogleMaps(): Promise<void> {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!key) return Promise.resolve();

  if (loaded) return Promise.resolve();

  return new Promise<void>((resolve) => {
    if (loading) {
      callbacks.push(resolve);
      return;
    }
    loading = true;
    callbacks.push(resolve);

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    script.async = true;
    script.onload = () => {
      loaded = true;
      loading = false;
      callbacks.forEach((cb) => cb());
      callbacks.length = 0;
    };
    script.onerror = () => {
      loading = false;
      callbacks.forEach((cb) => cb());
      callbacks.length = 0;
    };
    document.head.appendChild(script);
  });
}
