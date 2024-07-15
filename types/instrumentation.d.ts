// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import {
    InstrumentationBase,
    InstrumentationConfig,
    InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';

export declare class AzureFunctionsInstrumentation extends InstrumentationBase {
    constructor(config?: InstrumentationConfig);

    protected init(): InstrumentationNodeModuleDefinition;
}
