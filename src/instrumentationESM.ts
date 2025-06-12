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

export class AzureFunctionsInstrumentationESM extends InstrumentationBase {
    private azFuncDisposable: AzFunc.Disposable[] = [];

    constructor(config: InstrumentationConfig = {}) {
        super('@azure/functions-opentelemetry-instrumentation', version, config);
    }

    protected init() {
        const instrumentationNodeModuleDefinition = new InstrumentationNodeModuleDefinition(
            '@azure/functions',
            ['^4.5.0'],
            (moduleExports: typeof AzFunc) => {
                return this._patch(moduleExports);
            },
            (moduleExports: typeof AzFunc) => this._unPatch(moduleExports)
        );

        return instrumentationNodeModuleDefinition;
    }

    private _patch(azFunc: typeof AzFunc): typeof AzFunc {
        // Tell the Azure Functions Host that we will send logs directly from Node.js
        // (so that the host doesn't duplicate)
        azFunc.app.setup({
            capabilities: {
                WorkerOpenTelemetryEnabled: true,
            },
        });

        // Send logs directly from Node.js
        const logDisposable = azFunc.app.hook.log((context) => {
            this.logger.emit({
                body: context.message,
                severityNumber: toOtelSeverityNumber(context.level),
                severityText: context.level,
            });
        });

        // Ensure Azure Functions Host trace context is propagated onto the user's Node.js function handler
        const preInvocationDisposable = azFunc.app.hook.preInvocation((context) => {
            const traceContext = context.invocationContext.traceContext;
            if (traceContext) {
                const extractedContext = propagation.extract(otelContext.active(), {
                    traceparent: traceContext.traceParent || traceContext.traceParent,
                    tracestate: traceContext.traceState || traceContext.traceState,
                });

                const currentContext = extractedContext || otelContext.active();
                context.functionHandler = otelContext.bind(currentContext, context.functionHandler);
            }
        });

        this.azFuncDisposable.push(logDisposable, preInvocationDisposable);

        return azFunc;
    }

    private _unPatch(azFunc: typeof AzFunc): void {
        if (this.azFuncDisposable) {
            this.azFuncDisposable.forEach((disposable: AzFunc.Disposable): void => {
                disposable.dispose();
            });
            this.azFuncDisposable = [];
        }

        azFunc.app.setup({
            capabilities: {
                WorkerOpenTelemetryEnabled: false,
            },
        });
    }

    /**
     * Public method to manually trigger patching for ESM scenarios
     */
    registerAzFunc(azFunc: typeof AzFunc): void {
        this._patch(azFunc);
    }
}

/**
 * Helper function to map Azure Functions log levels to OpenTelemetry severity numbers.
 */
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
