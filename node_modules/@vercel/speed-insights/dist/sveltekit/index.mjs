// src/sveltekit/index.ts
import { get } from "svelte/store";

// package.json
var name = "@vercel/speed-insights";
var version = "1.2.0";

// src/queue.ts
var initQueue = () => {
  if (window.si) return;
  window.si = function a(...params) {
    (window.siq = window.siq || []).push(params);
  };
};

// src/utils.ts
function isBrowser() {
  return typeof window !== "undefined";
}
function detectEnvironment() {
  try {
    const env = process.env.NODE_ENV;
    if (env === "development" || env === "test") {
      return "development";
    }
  } catch (e) {
  }
  return "production";
}
function isDevelopment() {
  return detectEnvironment() === "development";
}
function getScriptSrc(props) {
  if (props.scriptSrc) {
    return props.scriptSrc;
  }
  if (isDevelopment()) {
    return "https://va.vercel-scripts.com/v1/speed-insights/script.debug.js";
  }
  if (props.dsn) {
    return "https://va.vercel-scripts.com/v1/speed-insights/script.js";
  }
  if (props.basePath) {
    return `${props.basePath}/speed-insights/script.js`;
  }
  return "/_vercel/speed-insights/script.js";
}

// src/generic.ts
function injectSpeedInsights(props = {}) {
  var _a;
  if (!isBrowser() || props.route === null) return null;
  initQueue();
  const src = getScriptSrc(props);
  if (document.head.querySelector(`script[src*="${src}"]`)) return null;
  if (props.beforeSend) {
    (_a = window.si) == null ? void 0 : _a.call(window, "beforeSend", props.beforeSend);
  }
  const script = document.createElement("script");
  script.src = src;
  script.defer = true;
  script.dataset.sdkn = name + (props.framework ? `/${props.framework}` : "");
  script.dataset.sdkv = version;
  if (props.sampleRate) {
    script.dataset.sampleRate = props.sampleRate.toString();
  }
  if (props.route) {
    script.dataset.route = props.route;
  }
  if (props.endpoint) {
    script.dataset.endpoint = props.endpoint;
  } else if (props.basePath) {
    script.dataset.endpoint = `${props.basePath}/speed-insights/vitals`;
  }
  if (props.dsn) {
    script.dataset.dsn = props.dsn;
  }
  if (isDevelopment() && props.debug === false) {
    script.dataset.debug = "false";
  }
  script.onerror = () => {
    console.log(
      `[Vercel Speed Insights] Failed to load script from ${src}. Please check if any content blockers are enabled and try again.`
    );
  };
  document.head.appendChild(script);
  return {
    setRoute: (route) => {
      script.dataset.route = route ?? void 0;
    }
  };
}

// src/sveltekit/utils.ts
function getBasePath() {
  try {
    return import.meta.env.VITE_VERCEL_OBSERVABILITY_BASEPATH;
  } catch {
  }
}

// src/sveltekit/index.ts
import { page } from "$app/stores";
import { browser } from "$app/environment";
function injectSpeedInsights2(props = {}) {
  var _a;
  if (browser) {
    const speedInsights = injectSpeedInsights({
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- route could be undefined in layout.js file
      route: (_a = get(page).route) == null ? void 0 : _a.id,
      ...props,
      framework: "sveltekit",
      basePath: getBasePath()
    });
    if (speedInsights) {
      page.subscribe((value) => {
        var _a2;
        if ((_a2 = value.route) == null ? void 0 : _a2.id) {
          speedInsights.setRoute(value.route.id);
        }
      });
    }
  }
}
export {
  injectSpeedInsights2 as injectSpeedInsights
};
//# sourceMappingURL=index.mjs.map