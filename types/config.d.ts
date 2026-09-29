// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface AzureFunctionsInstrumentationConfig extends InstrumentationConfig {
    /** Set true only after configuring a log provider and exporter; enables log forwarding and host suppression. */
    structuredLogExporterReady?: boolean;
}
