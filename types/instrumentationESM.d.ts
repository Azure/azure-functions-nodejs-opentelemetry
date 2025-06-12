// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import type * as AzFunc from '@azure/functions';
import {
    InstrumentationBase,
    InstrumentationConfig,
    InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';

export declare class AzureFunctionsInstrumentationESM extends InstrumentationBase {
    constructor(config?: InstrumentationConfig);

    protected init(): InstrumentationNodeModuleDefinition;
    registerAzFunc(azFunc: typeof AzFunc): void;
}
