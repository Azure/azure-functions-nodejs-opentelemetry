// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import type * as AzFunc from '@azure/functions';
import { context as otelContext, propagation } from '@opentelemetry/api';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { AzureFunctionsInstrumentationConfig } from '../types/config';
import { version } from './constants';
import { createLogRecord, StructuredLogHookContext } from './logging';

export class AzureFunctionsInstrumentation extends InstrumentationBase<AzureFunctionsInstrumentationConfig> {
    private _azFuncDisposable: AzFunc.Disposable | undefined;
    private _logsEnabled = false;
    private _warnedInvalidAttributes = false;

    constructor(config: AzureFunctionsInstrumentationConfig = {}) {
        super('@azure/functions-opentelemetry-instrumentation', version, config);
    }

    protected init() {
        return new InstrumentationNodeModuleDefinition(
            '@azure/functions',
            ['^4.5.0'],
            (moduleExports: typeof AzFunc) => this._patch(moduleExports),
            (moduleExports: typeof AzFunc) => this._unPatch(moduleExports)
        );
    }

    protected _patch(azFunc: typeof AzFunc): typeof AzFunc {
        if (this._azFuncDisposable) {
            return azFunc;
        }
        const disposables: AzFunc.Disposable[] = [];
        if (this.getConfig().structuredLogExporterReady === true) {
            const registerLogHook: (
                handler: (context: StructuredLogHookContext) => void,
                options?: { structuredLogProperties: boolean }
            ) => AzFunc.Disposable = azFunc.app.hook.log;
            disposables.push(
                registerLogHook(
                    (context) => {
                        this.logger.emit(createLogRecord(context, () => this._warnInvalidAttributes()));
                    },
                    { structuredLogProperties: true }
                )
            );
            azFunc.app.setup({ capabilities: { WorkerOpenTelemetryEnabled: true } });
            this._logsEnabled = true;
        }
        disposables.push(
            azFunc.app.hook.preInvocation((context) => {
                const traceContext = context.invocationContext.traceContext;
                if (traceContext) {
                    context.functionHandler = otelContext.bind(
                        propagation.extract(otelContext.active(), {
                            traceparent: traceContext.traceParent,
                            tracestate: traceContext.traceState,
                        }),
                        context.functionHandler
                    );
                }
            })
        );
        this._azFuncDisposable = azFunc.Disposable.from(...disposables);
        return azFunc;
    }

    protected _unPatch(azFunc: typeof AzFunc): void {
        this._azFuncDisposable?.dispose();
        this._azFuncDisposable = undefined;
        if (this._logsEnabled) {
            this._logsEnabled = false;
            try {
                azFunc.app.setup({ capabilities: { WorkerOpenTelemetryEnabled: false } });
            } catch {
                this._diag.warn(
                    'Log forwarding stopped, but host capabilities cannot change after startup. Restart the app to restore host log export.'
                );
            }
        }
    }

    private _warnInvalidAttributes(): void {
        if (!this._warnedInvalidAttributes) {
            this._warnedInvalidAttributes = true;
            this._diag.warn('Skipped invalid or reserved structured log attributes.');
        }
    }
}
