// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import type * as AzFunc from '@azure/functions';
import { AzureFunctionsInstrumentation } from './instrumentation';

export declare class AzureFunctionsInstrumentationESM extends AzureFunctionsInstrumentation {
    registerAzFunc(azFunc: typeof AzFunc): void;
}
