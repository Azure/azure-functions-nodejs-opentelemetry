// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { AzureFunctionsInstrumentationConfig } from './config';

export declare class AzureFunctionsInstrumentation extends InstrumentationBase<AzureFunctionsInstrumentationConfig> {
    constructor(config?: AzureFunctionsInstrumentationConfig);

    protected init(): InstrumentationNodeModuleDefinition;
}
