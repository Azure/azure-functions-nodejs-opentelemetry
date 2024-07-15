// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

// This file will be compiled by multiple versions of TypeScript as decribed in ./test/types.test.ts to verify there are no errors

import { AzureFunctionsInstrumentation } from '@azure/functions-opentelemetry-instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
    instrumentations: [
        // Azure Functions instrumentation expects HTTP layer to be instrumented
        new HttpInstrumentation(),
        new AzureFunctionsInstrumentation(),
    ],
});
