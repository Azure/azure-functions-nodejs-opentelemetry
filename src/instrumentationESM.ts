// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import type * as AzFunc from '@azure/functions';
import { AzureFunctionsInstrumentation } from './instrumentation';

/** Azure Functions instrumentation with explicit module registration for ESM loaders. */
export class AzureFunctionsInstrumentationESM extends AzureFunctionsInstrumentation {
    private _registeredModule: typeof AzFunc | undefined;

    registerAzFunc(azFunc: typeof AzFunc): void {
        if (!this._registeredModule) {
            this._patch(azFunc);
            this._registeredModule = azFunc;
        }
    }

    protected _unPatch(azFunc: typeof AzFunc): void {
        super._unPatch(azFunc);
        this._registeredModule = undefined;
    }

    disable(): void {
        super.disable();
        if (this._registeredModule) {
            const azFunc = this._registeredModule;
            this._registeredModule = undefined;
            this._unPatch(azFunc);
        }
    }
}
