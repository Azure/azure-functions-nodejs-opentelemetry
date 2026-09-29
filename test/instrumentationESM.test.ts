// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import type * as AzFunc from '@azure/functions';
import { expect } from 'chai';
import sinon = require('sinon');
import { AzureFunctionsInstrumentationESM } from '../src/instrumentationESM';

describe('AzureFunctionsInstrumentationESM public API', () => {
    function createRegistry() {
        const logDispose = sinon.stub();
        const preInvocationDispose = sinon.stub();
        const setup = sinon.stub();
        const log = sinon.stub().returns({ dispose: logDispose });
        const preInvocation = sinon.stub().returns({ dispose: preInvocationDispose });
        const azFunc = {
            app: { setup, hook: { log, preInvocation } },
            Disposable: {
                from: (...disposables: AzFunc.Disposable[]) => ({
                    dispose: () => disposables.forEach((disposable) => disposable.dispose()),
                }),
            },
        } as unknown as typeof AzFunc;
        return { azFunc, log, setup, logDispose, preInvocationDispose };
    }

    it('accepts exporter readiness through the inherited configuration', () => {
        const instrumentation = new AzureFunctionsInstrumentationESM({
            enabled: false,
            structuredLogExporterReady: true,
        });
        expect(instrumentation.getConfig().structuredLogExporterReady).to.equal(true);
    });

    it('disposes explicitly registered hooks through public disable even with automatic instrumentation disabled', () => {
        const registry = createRegistry();
        const instrumentation = new AzureFunctionsInstrumentationESM({
            enabled: false,
            structuredLogExporterReady: true,
        });
        instrumentation.registerAzFunc(registry.azFunc);
        instrumentation.registerAzFunc(registry.azFunc);
        expect(registry.log.calledOnce).to.equal(true);
        instrumentation.disable();
        instrumentation.disable();
        expect(registry.logDispose.calledOnce).to.equal(true);
        expect(registry.preInvocationDispose.calledOnce).to.equal(true);
        expect(registry.setup.calledTwice).to.equal(true);
        expect(registry.setup.secondCall.args[0]).to.deep.equal({
            capabilities: { WorkerOpenTelemetryEnabled: false },
        });
        instrumentation.registerAzFunc(registry.azFunc);
        expect(registry.log.calledTwice).to.equal(true);
        instrumentation.disable();
        expect(registry.logDispose.calledTwice).to.equal(true);
    });

    it('disposes hooks once after startup and diagnoses capabilities that require restart', () => {
        const registry = createRegistry();
        const instrumentation = new AzureFunctionsInstrumentationESM({
            enabled: false,
            structuredLogExporterReady: true,
        });
        const warn = sinon.stub();
        Object.defineProperty(instrumentation, '_diag', { value: { warn } });
        instrumentation.registerAzFunc(registry.azFunc);
        registry.setup.throws(new Error('Setup options cannot change after startup.'));
        expect(() => instrumentation.disable()).not.to.throw();
        instrumentation.disable();
        expect(registry.logDispose.calledOnce).to.equal(true);
        expect(registry.preInvocationDispose.calledOnce).to.equal(true);
        expect(warn.calledOnce).to.equal(true);
        expect(warn.firstCall.args[0]).to.equal(
            'Log forwarding stopped, but host capabilities cannot change after startup. Restart the app to restore host log export.'
        );
    });
});
