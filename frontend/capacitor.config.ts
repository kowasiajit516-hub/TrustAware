import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.example.trustaware",
  appName: "TrustAware",

  // MUST match vite.config.js -> build.outDir exactly.
  // If this says "www" or anything other than "dist", `npx cap copy android`
  // will copy the wrong (or a stale/nonexistent) folder into the APK, which
  // is the #1 cause of the raw /src/main.jsx MIME error.
  webDir: "dist",

  server: {
    // Serves the WebView content over https://localhost instead of file://,
    // which avoids mixed-content blocks when calling your Render API.
    androidScheme: "https",
  },

  android: {
    allowMixedContent: false,
  },
};

export default config;
