// src/index.ts
var worker = {
  async scheduled(_event, env, ctx) {
    if (!env.AUTOPILOT_URL || !env.AUTOPILOT_SECRET) {
      console.error("AUTOPILOT_URL or AUTOPILOT_SECRET is not set \u2014 nothing to poke.");
      return;
    }
    ctx.waitUntil(
      (async () => {
        try {
          const response = await fetch(env.AUTOPILOT_URL, {
            method: "POST",
            headers: { authorization: `Bearer ${env.AUTOPILOT_SECRET}` }
          });
          const body = await response.text();
          if (!response.ok) {
            console.error(`autopilot \u2192 HTTP ${response.status} ${body.slice(0, 300)}`);
            return;
          }
          console.log(`autopilot \u2192 ${body.slice(0, 300)}`);
        } catch (cause) {
          console.error("autopilot \u2192 request failed", cause);
        }
      })()
    );
  }
};
var index_default = worker;
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
