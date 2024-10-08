// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import type * as AzFunc from '@azure/functions';
import { context as otelContext, propagation } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import {
    InstrumentationBase,
    InstrumentationConfig,
    InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import { version } from './constants';

export class AzureFunctionsInstrumentation extends InstrumentationBase {
    private _azFuncDisposable: AzFunc.Disposable | undefined;

    constructor(config: InstrumentationConfig = {}) {
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

    private _patch(azFunc: typeof AzFunc): typeof AzFunc {
        const disposables: AzFunc.Disposable[] = [];

        // Tell the Azure Functions Host that we will send logs directly from Node.js
        // (so that the host doesn't duplicate)
        azFunc.app.setup({
            capabilities: {
                WorkerOpenTelemetryEnabled: true,
            },
        });

        // Send logs directly from Node.js
        disposables.push(
            azFunc.app.hook.log((context) => {
                this.logger.emit({
                    body: context.message,
                    severityNumber: toOtelSeverityNumber(context.level),
                    severityText: context.level,
                });
            })
        );

        // Ensure Azure Functions Host trace context is propagated onto the user's Node.js function handler
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

    private _unPatch(azFunc: typeof AzFunc): void {
        this._azFuncDisposable?.dispose();

        azFunc.app.setup({
            capabilities: {
                WorkerOpenTelemetryEnabled: false,
            },
        });
    }
}

function toOtelSeverityNumber(level: AzFunc.LogLevel): SeverityNumber {
    switch (level) {
        case 'information':
            return SeverityNumber.INFO;
        case 'debug':
            return SeverityNumber.DEBUG;
        case 'error':
            return SeverityNumber.ERROR;
        case 'trace':
            return SeverityNumber.TRACE;
        case 'warning':
            return SeverityNumber.WARN;
        case 'critical':
            return SeverityNumber.FATAL;
        default:
            return SeverityNumber.UNSPECIFIED;
    }
}
