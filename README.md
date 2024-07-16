# OpenTelemetry Azure Functions Instrumentation for Node.js

|Branch|Status|Support level|Node.js Versions|
|---|---|---|---|
|main|[![Build Status](https://img.shields.io/azure-devops/build/azfunc/public/911/main)](https://azfunc.visualstudio.com/public/_build/latest?definitionId=911&branchName=main) [![Test Status](https://img.shields.io/azure-devops/tests/azfunc/public/911/main?compact_message)](https://azfunc.visualstudio.com/public/_build/latest?definitionId=911&branchName=main)|Preview|20, 18|

This module provides automatic instrumentation for the [`@azure/functions`](https://learn.microsoft.com/azure/azure-functions/functions-reference-node?pivots=nodejs-model-v4) module, which may be loaded using the [`@opentelemetry/sdk-trace-node`](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Install

```bash
npm install --save @azure/functions-opentelemetry-instrumentation
```

### Supported Versions

- @azure/functions: `^4.5.0`

## Usage

To load the instrumentation, specify it in the Node Tracer's configuration:

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

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
