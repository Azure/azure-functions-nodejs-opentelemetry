# OpenTelemetry Azure Functions Instrumentation for Node.js

|Branch|Status|Support level|Node.js Versions|
|---|---|---|---|
|main|[![Build Status](https://img.shields.io/azure-devops/build/azfunc/public/911/main)](https://azfunc.visualstudio.com/public/_build/latest?definitionId=911&branchName=main) [![Test Status](https://img.shields.io/azure-devops/tests/azfunc/public/911/main?compact_message)](https://azfunc.visualstudio.com/public/_build/latest?definitionId=911&branchName=main)|GA|18+|

This module provides automatic instrumentation for the [`@azure/functions`](https://learn.microsoft.com/azure/azure-functions/functions-reference-node?pivots=nodejs-model-v4) module, which may be loaded using the [`@opentelemetry/sdk-trace-node`](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Install

```bash
npm install --save @azure/functions-opentelemetry-instrumentation
```

### Supported Versions

- @azure/functions: `^4.5.0`

## Usage

### CommonJS

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { AzureFunctionsInstrumentation } = require('@azure/functions-opentelemetry-instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    // Azure Functions instrumentation expects HTTP layer to be instrumented
    new HttpInstrumentation(),
    new AzureFunctionsInstrumentation(),
  ],
});
```

### ESM

ESM requires a separate setup because Node.js uses a different module loader for ESM vs CommonJS. Instrumentation patching in ESM needs an experimental loader hook (`--experimental-loader=@opentelemetry/instrumentation/hook.mjs`) and a minimum Node.js version of `18.19.0`. The `--import` flag must be used to ensure the instrumentation is initialized before application code. For more details, see [OpenTelemetry ESM Support](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/esm-support.md).

```js
import FunctionInstrumentation from "@azure/functions-opentelemetry-instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { NodeTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { AzureMonitorTraceExporter } from "@azure/monitor-opentelemetry-exporter";

const { AzureFunctionsInstrumentationESM } = FunctionInstrumentation;

const tracerProvider = new NodeTracerProvider();
tracerProvider.addSpanProcessor(new SimpleSpanProcessor(new AzureMonitorTraceExporter()));
tracerProvider.register();

const azureFunctionsInstrumentation = new AzureFunctionsInstrumentationESM();
registerInstrumentations({
  tracerProvider,
  instrumentations: [new HttpInstrumentation(), azureFunctionsInstrumentation],
});

const azureFunctions = await import("@azure/functions");
azureFunctionsInstrumentation.registerAzFunc(azureFunctions);

azureFunctions.app.setup({
  enableHttpStream: true,
});
```

## Log exporter readiness

`structuredLogExporterReady` defaults to `false`. Without explicit readiness the instrumentation propagates invocation context but does not forward logs or suppress the host's logs. This changes the previous default of unconditional forwarding. Set it to `true` only after configuring a log provider and exporter, before loading or registering the Functions module. Readiness is a caller assertion, not a network delivery check.

For example, initialize Azure Monitor before enabling log forwarding:

```js
const { useAzureMonitor } = require('@azure/monitor-opentelemetry');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { AzureFunctionsInstrumentation } = require('@azure/functions-opentelemetry-instrumentation');
useAzureMonitor({ enableTraceBasedSamplingForLogs: false });
registerInstrumentations({
    instrumentations: [new AzureFunctionsInstrumentation({ structuredLogExporterReady: true })],
});
const { app } = require('@azure/functions');
app.setup({ structuredLogProperties: 'lastPlainObject' });
```

The example requires `@azure/monitor-opentelemetry` in the application. For explicit ESM registration, construct `new AzureFunctionsInstrumentationESM({ enabled: false, structuredLogExporterReady: true })` after configuring the exporter, then call `registerAzFunc` once the Functions module is imported. Repeated registration on the same instance does not add consumers. Public `disable()` also disposes manually registered ESM hooks when automatic instrumentation is disabled. Capabilities can only be restored before Functions setup is locked; disabling after startup stops forwarding and emits a diagnostic warning, and restarting the app is required to restore host export.

A host configured with `telemetryMode: "OpenTelemetry"` uses the instrumentation's `WorkerOpenTelemetryEnabled` capability to avoid exporting the same log twice. This does not suppress the older Application Insights host exporter, which can produce duplicates when combined with forwarding. Do not set the capability manually before the exporter is ready.

## Structured fields

Structured properties require the companion Functions library and Node worker changes exposing attributes through the log hook; no future release version is assigned here. Older libraries continue to supply text-only logs. After opting in through `app.setup`, a call such as `context.error('Job submission failed', { component: 'disease_prediction_runner', errorCode: 'COMPONENT_NOT_FOUND' })` preserves the existing text and exposes supported flat properties as separate OpenTelemetry attributes. The message is not parsed to recover properties on older workers.

Only own enumerable data properties with string, boolean or finite number values are forwarded. Accessors, non-scalar values and reserved keys are skipped without invoking getters or mutating the original object. Reserved names are case-insensitive: `CategoryName`, `__proto__`, `prototype`, `constructor`, and prefixes `exception.`, `_MS`, `microsoft`, `ai.`. The instrumentation emits at most one diagnostic warning per instance for skipped attributes, without their names or values.

Disabling trace-based log sampling in the exporter prevents that processor from dropping errors associated with unsampled traces. Host logging settings do not control this exporter. Export remains buffered and subject to exporter and network failures; readiness does not imply exactly-once or guaranteed delivery. Durable orchestrators must still avoid emitting duplicate business logs during replay.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
