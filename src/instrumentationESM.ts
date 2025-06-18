// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

// Import Azure Functions types
import type * as AzFunc from '@azure/functions';
// Import OpenTelemetry APIs for context propagation
import { context as otelContext, propagation } from '@opentelemetry/api';
// Import OpenTelemetry severity levels for logging
import { SeverityNumber } from '@opentelemetry/api-logs';
// Import OpenTelemetry instrumentation base classes
import {
    InstrumentationBase,
    InstrumentationConfig,
    InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
// Import instrumentation version constant
import { version } from './constants';

/**
 * Azure Functions Instrumentation class specifically designed for ESM scenarios.
 * Extends OpenTelemetry's InstrumentationBase to integrate with Azure Functions.
 */
export class AzureFunctionsInstrumentationESM extends InstrumentationBase {
    // Array to store disposables for cleanup during unpatching
    private azFuncDisposable: AzFunc.Disposable[] = [];

    /**
     * Constructor initializes the instrumentation with a given configuration.
     * @param config Optional instrumentation configuration.
     */
    constructor(config: InstrumentationConfig = {}) {
        super('@azure/functions-opentelemetry-instrumentation', version, config);
    }

    /**
     * Initializes the instrumentation by defining how to patch and unpatch the Azure Functions module.
     * This method is called automatically by OpenTelemetry instrumentation lifecycle.
     */
    protected init() {
        const instrumentationNodeModuleDefinition = new InstrumentationNodeModuleDefinition(
            '@azure/functions', // Target module to instrument
            ['^4.5.0'], // Supported versions
            (moduleExports: typeof AzFunc) => this._patch(moduleExports), // Patch method
            (moduleExports: typeof AzFunc) => this._unPatch(moduleExports) // Unpatch method
        );

        return instrumentationNodeModuleDefinition;
    }

    /**
     * Internal method to patch Azure Functions SDK.
     * Sets up logging and trace context propagation hooks.
     * @param azFunc Azure Functions module exports.
     * @returns Patched Azure Functions module exports.
     */
    private _patch(azFunc: typeof AzFunc): typeof AzFunc {
        // Inform Azure Functions Host that logs will be sent directly from Node.js
        azFunc.app.setup({
            capabilities: {
                WorkerOpenTelemetryEnabled: true,
            },
        });

        // Hook into Azure Functions logging to emit logs via OpenTelemetry
        const logDisposable = azFunc.app.hook.log((context) => {
            this.logger.emit({
                body: context.message,
                severityNumber: toOtelSeverityNumber(context.level),
                severityText: context.level,
            });
        });

        // Hook into Azure Functions pre-invocation to propagate trace context
        const preInvocationDisposable = azFunc.app.hook.preInvocation((context) => {
            const traceContext = context.invocationContext.traceContext;
            if (traceContext) {
                // Extract trace context from Azure Functions invocation context
                const extractedContext = propagation.extract(otelContext.active(), {
                    traceparent: traceContext.traceParent,
                    tracestate: traceContext.traceState,
                });

                // Bind the extracted context to the function handler
                context.functionHandler = otelContext.bind(extractedContext, context.functionHandler);
            }
        });

        // Store disposables for later cleanup
        this.azFuncDisposable.push(logDisposable, preInvocationDisposable);

        return azFunc;
    }

    /**
     * Internal method to unpatch Azure Functions SDK.
     * Cleans up hooks and resets capabilities.
     * @param azFunc Azure Functions module exports.
     */
    private _unPatch(azFunc: typeof AzFunc): void {
        // Dispose of all registered hooks
        if (this.azFuncDisposable) {
            this.azFuncDisposable.forEach((disposable: AzFunc.Disposable): void => {
                disposable.dispose();
            });
            this.azFuncDisposable = [];
        }

        // Reset Azure Functions Host capabilities
        azFunc.app.setup({
            capabilities: {
                WorkerOpenTelemetryEnabled: false,
            },
        });
    }

    /**
     * Public method to manually trigger patching for ESM scenarios.
     * Useful when automatic instrumentation doesn't trigger due to ESM module loading.
     * @param azFunc Azure Functions module exports.
     */
    registerAzFunc(azFunc: typeof AzFunc): void {
        this._patch(azFunc);
    }
}

/**
 * Helper function to map Azure Functions log levels to OpenTelemetry severity numbers.
 * @param level Azure Functions log level.
 * @returns Corresponding OpenTelemetry severity number.
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
