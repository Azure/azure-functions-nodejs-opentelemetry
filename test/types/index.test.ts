// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import {
    AzureFunctionsInstrumentation,
    AzureFunctionsInstrumentationConfig,
    AzureFunctionsInstrumentationESM,
} from '@azure/functions-opentelemetry-instrumentation';

const config: AzureFunctionsInstrumentationConfig = { enabled: false, structuredLogExporterReady: true };
new AzureFunctionsInstrumentation(config);
new AzureFunctionsInstrumentationESM(config);
new AzureFunctionsInstrumentation();
new AzureFunctionsInstrumentationESM();
// @ts-expect-error Exporter readiness must be a boolean.
new AzureFunctionsInstrumentation({ structuredLogExporterReady: 'yes' });
// @ts-expect-error Exporter readiness must be a boolean in ESM too.
new AzureFunctionsInstrumentationESM({ structuredLogExporterReady: 'yes' });
