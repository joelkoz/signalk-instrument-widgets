(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // ../signalk-plotterext-bus/dist/chunk-ZYQKQSOC.js
  var BUS_ID = "plotterExt/1";
  var RPC_ERRORS = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    HOST_ERROR: -32e3,
    TIMEOUT: -32001,
    CONNECTION_CLOSED: -32002
  };
  var RpcError = class _RpcError extends Error {
    constructor(message, opts = {}) {
      super(message);
      __publicField(this, "code");
      __publicField(this, "data");
      this.name = "RpcError";
      this.code = opts.code ?? RPC_ERRORS.HOST_ERROR;
      const data = { ...opts.data ?? {} };
      if (opts.reason !== void 0) data.reason = opts.reason;
      this.data = Object.keys(data).length > 0 ? data : void 0;
    }
    get reason() {
      return typeof this.data?.reason === "string" ? this.data.reason : void 0;
    }
    toErrorObject() {
      return {
        code: this.code,
        message: this.message,
        ...this.data ? { data: this.data } : {}
      };
    }
    static fromErrorObject(err) {
      return new _RpcError(err.message, { code: err.code, data: err.data });
    }
    /** Normalize any thrown value into an RpcError suitable for the wire. */
    static from(err) {
      if (err instanceof _RpcError) return err;
      if (err instanceof Error) {
        return new _RpcError(err.message, { code: RPC_ERRORS.INTERNAL_ERROR });
      }
      return new _RpcError(String(err), { code: RPC_ERRORS.INTERNAL_ERROR });
    }
  };
  var EVENT_READY = "bus.ready";
  var EVENT_HANDSHAKE = "bus.handshake";
  function matchesPattern(pattern, name) {
    if (pattern === name) return true;
    return match(pattern.split("."), 0, name.split("."), 0);
  }
  function match(p, pi, n, ni) {
    while (pi < p.length) {
      const seg = p[pi];
      if (seg === "**") {
        if (pi === p.length - 1) return true;
        for (let skip = ni; skip <= n.length; skip++) {
          if (match(p, pi + 1, n, skip)) return true;
        }
        return false;
      }
      if (ni >= n.length) return false;
      if (seg !== "*" && seg !== n[ni]) return false;
      pi++;
      ni++;
    }
    return ni === n.length;
  }
  function matchesAny(patterns, name) {
    for (const pattern of patterns) {
      if (matchesPattern(pattern, name)) return true;
    }
    return false;
  }
  function wrap(msg) {
    return { bus: BUS_ID, msg };
  }
  function unwrap(data) {
    if (typeof data !== "object" || data === null) return null;
    const env = data;
    if (env.bus !== BUS_ID) return null;
    return isJsonRpcMessage(env.msg) ? env.msg : null;
  }
  function isJsonRpcMessage(v) {
    if (typeof v !== "object" || v === null) return false;
    const m = v;
    if (m.jsonrpc !== "2.0") return false;
    if (typeof m.method === "string") {
      return m.id === void 0 || typeof m.id === "string" || typeof m.id === "number";
    }
    const idOk = typeof m.id === "string" || typeof m.id === "number" || m.id === null;
    if (!idOk) return false;
    const hasResult = "result" in m;
    const err = m.error;
    const hasError = typeof err === "object" && err !== null && typeof err.code === "number" && typeof err.message === "string";
    return hasResult ? !("error" in m) : hasError;
  }
  function isRequest(msg) {
    return "method" in msg && "id" in msg && msg.id !== void 0;
  }
  function isNotification(msg) {
    return "method" in msg && (!("id" in msg) || msg.id === void 0);
  }
  function isResponse(msg) {
    return !("method" in msg);
  }
  function windowPort(peer, opts = {}) {
    const listenWindow = opts.listenWindow ?? globalThis;
    const origin = opts.origin ?? listenWindow.location?.origin ?? "*";
    return {
      post(data) {
        peer.postMessage(data, origin);
      },
      listen(handler) {
        const fn = (ev) => {
          if (ev.source !== peer) return;
          if (origin !== "*" && ev.origin !== origin) return;
          handler(ev.data);
        };
        listenWindow.addEventListener("message", fn);
        return () => listenWindow.removeEventListener("message", fn);
      }
    };
  }
  var DEFAULT_CALL_TIMEOUT_MS = 1e4;
  var BusEndpoint = class {
    constructor(opts) {
      __publicField(this, "callTimeoutMs");
      __publicField(this, "port");
      __publicField(this, "unlisten");
      __publicField(this, "onError");
      __publicField(this, "pending", /* @__PURE__ */ new Map());
      __publicField(this, "methods", /* @__PURE__ */ new Map());
      __publicField(this, "eventHandlers", /* @__PURE__ */ new Set());
      __publicField(this, "idPrefix", Math.random().toString(36).slice(2, 8));
      __publicField(this, "seq", 0);
      __publicField(this, "closed", false);
      this.port = opts.port;
      this.callTimeoutMs = opts.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
      this.onError = opts.onError ?? ((err) => console.warn("[plotterext-bus]", err));
      this.unlisten = this.port.listen((data) => this.onData(data));
    }
    registerMethod(name, handler) {
      this.methods.set(name, handler);
    }
    unregisterMethod(name) {
      this.methods.delete(name);
    }
    /**
     * Handle incoming notifications whose names match any of the wildcard
     * patterns. Returns an unsubscribe function. This is local dispatch only;
     * telling the peer which events to forward is a separate concern
     * (`events.subscribe`).
     */
    onEvent(patterns, fn) {
      const entry = { patterns, fn };
      this.eventHandlers.add(entry);
      return () => this.eventHandlers.delete(entry);
    }
    /** Send a notification (an event) to the peer. */
    notify(method, params) {
      this.send({ jsonrpc: "2.0", method, ...params !== void 0 ? { params } : {} });
    }
    /** Call a method on the peer; resolves with its result. */
    call(method, params, opts = {}) {
      if (this.closed) {
        return Promise.reject(
          new RpcError("Bus endpoint is closed", {
            code: RPC_ERRORS.CONNECTION_CLOSED,
            reason: "CLOSED"
          })
        );
      }
      const id = `${this.idPrefix}-${++this.seq}`;
      const timeoutMs = opts.timeoutMs ?? this.callTimeoutMs;
      return new Promise((resolve, reject) => {
        const timer = timeoutMs > 0 ? setTimeout(() => {
          this.pending.delete(id);
          reject(
            new RpcError(`Call timed out after ${timeoutMs}ms: ${method}`, {
              code: RPC_ERRORS.TIMEOUT,
              reason: "TIMEOUT"
            })
          );
        }, timeoutMs) : null;
        this.pending.set(id, { resolve, reject, timer });
        this.send({
          jsonrpc: "2.0",
          id,
          method,
          ...params !== void 0 ? { params } : {}
        });
      });
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      this.unlisten();
      for (const [, p] of this.pending) {
        if (p.timer) clearTimeout(p.timer);
        p.reject(
          new RpcError("Bus endpoint closed", {
            code: RPC_ERRORS.CONNECTION_CLOSED,
            reason: "CLOSED"
          })
        );
      }
      this.pending.clear();
      this.eventHandlers.clear();
    }
    send(msg) {
      if (this.closed) return;
      this.port.post(wrap(msg));
    }
    onData(data) {
      const msg = unwrap(data);
      if (!msg) return;
      if (isResponse(msg)) {
        this.onResponse(msg);
      } else if (isRequest(msg)) {
        void this.onRequest(msg);
      } else if (isNotification(msg)) {
        this.onNotification(msg.method, msg.params);
      }
    }
    onResponse(msg) {
      if (msg.id === null) return;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (p.timer) clearTimeout(p.timer);
      if ("error" in msg) {
        p.reject(RpcError.fromErrorObject(msg.error));
      } else {
        p.resolve(msg.result);
      }
    }
    async onRequest(msg) {
      const handler = this.methods.get(msg.method);
      if (!handler) {
        this.send({
          jsonrpc: "2.0",
          id: msg.id,
          error: {
            code: RPC_ERRORS.METHOD_NOT_FOUND,
            message: `Method not found: ${msg.method}`
          }
        });
        return;
      }
      try {
        const result = await handler(msg.params, { endpoint: this });
        this.send({
          jsonrpc: "2.0",
          id: msg.id,
          result: result === void 0 ? null : result
        });
      } catch (err) {
        this.send({
          jsonrpc: "2.0",
          id: msg.id,
          error: RpcError.from(err).toErrorObject()
        });
      }
    }
    onNotification(name, params) {
      for (const entry of [...this.eventHandlers]) {
        if (matchesAny(entry.patterns, name)) {
          try {
            entry.fn(name, params);
          } catch (err) {
            this.onError(err);
          }
        }
      }
    }
  };

  // ../signalk-plotterext-bus/dist/chunk-EGWZMA5J.js
  var ExtensionClient = class {
    constructor(endpoint, handshake) {
      __publicField(this, "handshake");
      __publicField(this, "endpoint");
      /** Host-persisted key/value state (see spec: State Storage). */
      __publicField(this, "state", {
        get: async (keys, scope) => {
          const result = await this.call("state.get", {
            ...scope ? { scope } : {},
            ...keys ? { keys } : {}
          });
          return result.values ?? {};
        },
        set: async (values, scope) => {
          await this.call("state.set", {
            ...scope ? { scope } : {},
            values
          });
        }
      });
      /** Signal K data relayed by the host (capabilities signalk.stream / .put). */
      __publicField(this, "signalk", {
        /**
         * Subscribe to Signal K path values. The host publishes them as
         * `sk.<path>` events; this helper hides the event-name mapping and
         * establishes both the event-forwarding subscription and the host's
         * upstream Signal K subscription.
         */
        subscribe: async (paths, handler) => {
          const patterns = paths.map((p) => `sk.${p}`);
          const offEvents = await this.subscribe(
            patterns,
            (_name, params) => handler(params)
          );
          let subscriptionId;
          try {
            const result = await this.call("signalk.subscribe", { paths });
            subscriptionId = result.subscriptionId;
          } catch (err) {
            await offEvents();
            throw err;
          }
          return async () => {
            await offEvents();
            await this.call("signalk.unsubscribe", { subscriptionId }).catch(
              () => {
              }
            );
          };
        },
        put: (path, value) => {
          return this.call("signalk.put", { path, value });
        }
      });
      this.endpoint = endpoint;
      this.handshake = handshake;
    }
    get context() {
      return this.handshake.context;
    }
    get apiVersion() {
      return this.handshake.apiVersion;
    }
    get capabilities() {
      return this.handshake.capabilities;
    }
    hasCapability(id) {
      return this.handshake.capabilities.includes(id);
    }
    /** Call a host API method. */
    call(method, params, opts) {
      return this.endpoint.call(method, params, opts);
    }
    /** Send a notification to the host. */
    notify(method, params) {
      this.endpoint.notify(method, params);
    }
    /**
     * Subscribe to host events matching wildcard patterns. Registers both the
     * host-side forwarding subscription and local dispatch; the returned
     * function tears down both.
     */
    async subscribe(patterns, handler) {
      const off = this.endpoint.onEvent(patterns, handler);
      let subscriptionId;
      try {
        const result = await this.call("events.subscribe", { patterns });
        subscriptionId = result.subscriptionId;
      } catch (err) {
        off();
        throw err;
      }
      return async () => {
        off();
        await this.call("events.unsubscribe", { subscriptionId }).catch(() => {
        });
      };
    }
    close() {
      this.endpoint.close();
    }
  };
  function connectExtension(opts = {}) {
    const port = opts.port ?? windowPort(globalThis.parent, {
      origin: "*"
    });
    const endpoint = new BusEndpoint({
      port,
      callTimeoutMs: opts.callTimeoutMs,
      onError: opts.onError
    });
    return new Promise((resolve, reject) => {
      let done = false;
      const off = endpoint.onEvent([EVENT_HANDSHAKE], (_name, params) => {
        if (done) return;
        done = true;
        cleanup();
        resolve(new ExtensionClient(endpoint, params));
      });
      const interval = setInterval(
        () => endpoint.notify(EVENT_READY),
        opts.readyIntervalMs ?? 250
      );
      const timeout = setTimeout(() => {
        if (done) return;
        done = true;
        cleanup();
        endpoint.close();
        reject(
          new RpcError("Timed out waiting for host handshake", {
            code: RPC_ERRORS.TIMEOUT,
            reason: "HANDSHAKE_TIMEOUT"
          })
        );
      }, opts.timeoutMs ?? 1e4);
      const cleanup = () => {
        off();
        clearInterval(interval);
        clearTimeout(timeout);
      };
      endpoint.notify(EVENT_READY);
    });
  }

  // src/web/common.js
  var CONVERSIONS = {
    none: { label: "Raw value", units: "", fn: (v) => v },
    "ms-kn": { label: "m/s \u2192 knots", units: "kn", fn: (v) => v * 1.943844 },
    "ms-kmh": { label: "m/s \u2192 km/h", units: "km/h", fn: (v) => v * 3.6 },
    "ms-mph": { label: "m/s \u2192 mph", units: "mph", fn: (v) => v * 2.236936 },
    "k-c": { label: "K \u2192 \xB0C", units: "\xB0C", fn: (v) => v - 273.15 },
    "k-f": {
      label: "K \u2192 \xB0F",
      units: "\xB0F",
      fn: (v) => (v - 273.15) * 1.8 + 32
    },
    "rad-deg": {
      label: "rad \u2192 \xB0",
      units: "\xB0",
      fn: (v) => v * 180 / Math.PI
    },
    "ratio-pct": { label: "ratio \u2192 %", units: "%", fn: (v) => v * 100 },
    "m-ft": { label: "m \u2192 ft", units: "ft", fn: (v) => v * 3.28084 },
    "m-nm": { label: "m \u2192 nm", units: "nm", fn: (v) => v / 1852 },
    "pa-hpa": { label: "Pa \u2192 hPa", units: "hPa", fn: (v) => v / 100 }
  };
  function convert(value, conversionKey) {
    const conv = CONVERSIONS[conversionKey] ?? CONVERSIONS.none;
    return typeof value === "number" ? conv.fn(value) : value;
  }
  function conversionUnits(conversionKey) {
    return (CONVERSIONS[conversionKey] ?? CONVERSIONS.none).units;
  }
  function formatValue(value, decimals = 1) {
    if (typeof value !== "number" || !isFinite(value)) return "--";
    return value.toFixed(decimals);
  }
  var LONG_PRESS_MS = 600;
  function installLongPress(client) {
    let timer = null;
    let fired = false;
    const start = () => {
      fired = false;
      timer = setTimeout(() => {
        fired = true;
        client.call("ui.openConfigPanel").catch(() => {
        });
      }, LONG_PRESS_MS);
    };
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    window.addEventListener("pointerdown", start);
    window.addEventListener("pointerup", cancel);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("pointerleave", cancel);
    return () => fired;
  }
  async function startInstrument({ defaults = {}, onUpdate }) {
    const client = await connectExtension();
    const longPressFired = installLongPress(client);
    let config = { ...defaults };
    let value;
    let unsubscribeSk = null;
    const emit = () => onUpdate({ config, value, client });
    async function applyConfig() {
      const stored = await client.state.get();
      config = { ...defaults, ...stored };
      value = void 0;
      if (unsubscribeSk) {
        const u = unsubscribeSk;
        unsubscribeSk = null;
        await u().catch(() => {
        });
      }
      emit();
      if (config.path) {
        unsubscribeSk = await client.signalk.subscribe([config.path], (ev) => {
          value = ev.value;
          emit();
        });
      }
    }
    await client.subscribe(["state.changed"], () => {
      applyConfig().catch((err) => console.warn("config reload failed", err));
    });
    await applyConfig();
    return { client, longPressFired };
  }

  // src/web/gauge.js
  var START_ANGLE = -210;
  var SWEEP = 240;
  function polar(cx, cy, r, deg) {
    const rad = deg * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }
  function arcPath(cx, cy, r, fromDeg, toDeg) {
    const [x1, y1] = polar(cx, cy, r, fromDeg);
    const [x2, y2] = polar(cx, cy, r, toDeg);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  function render({ config, value }) {
    const root = document.getElementById("root");
    const min = Number(config.min ?? 0);
    const max = Number(config.max ?? 10);
    const decimals = Number(config.decimals ?? 1);
    const display = convert(value, config.convert);
    const units = config.units || conversionUnits(config.convert);
    const label = config.label || config.path || "Not configured";
    let frac = 0;
    if (typeof display === "number" && isFinite(display) && max > min) {
      frac = Math.min(1, Math.max(0, (display - min) / (max - min)));
    }
    const needleDeg = START_ANGLE + SWEEP * frac;
    const [nx, ny] = polar(50, 53, 38, needleDeg);
    root.innerHTML = `
  <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
    <path d="${arcPath(50, 53, 44, START_ANGLE, START_ANGLE + SWEEP)}"
          class="track"/>
    <path d="${arcPath(50, 53, 44, START_ANGLE, needleDeg)}" class="fill"/>
    <line x1="50" y1="53" x2="${nx.toFixed(2)}" y2="${ny.toFixed(2)}" class="needle"/>
    <circle cx="50" cy="53" r="3.2" class="hub"/>
    <text x="50" y="48" class="value">${formatValue(display, decimals)}</text>
    <text x="50" y="62" class="units">${units}</text>
    <text x="50" y="97" class="label">${label}</text>
    <text x="${polar(50, 53, 48, START_ANGLE)[0].toFixed(0)}" y="86" class="bound">${min}</text>
    <text x="${polar(50, 53, 48, START_ANGLE + SWEEP)[0].toFixed(0)}" y="86" class="bound">${max}</text>
  </svg>`;
  }
  startInstrument({
    defaults: { min: 0, max: 10, decimals: 1, convert: "none" },
    onUpdate: render
  }).catch((err) => {
    document.getElementById("root").textContent = "Host connection failed";
    console.error(err);
  });
})();
//# sourceMappingURL=gauge.js.map
