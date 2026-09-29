// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import type * as AzFunc from '@azure/functions';
import { context as otelContext, propagation } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { expect } from 'chai';
import sinon = require('sinon');
import { AzureFunctionsInstrumentation } from '../src/instrumentation';
import { AzureFunctionsInstrumentationESM } from '../src/instrumentationESM';
import { AzureFunctionsInstrumentationConfig } from '../types/config';

class CommonJSTestInstrumentation extends AzureFunctionsInstrumentation {
    patch(azFunc: typeof AzFunc): void {
        this._patch(azFunc);
    }
    unpatch(azFunc: typeof AzFunc): void {
        this._unPatch(azFunc);
    }
}

class ESMTestInstrumentation extends AzureFunctionsInstrumentationESM {
    patch(azFunc: typeof AzFunc): void {
        this.registerAzFunc(azFunc);
    }
    unpatch(azFunc: typeof AzFunc): void {
        this._unPatch(azFunc);
    }
}

for (const Instrumentation of [CommonJSTestInstrumentation, ESMTestInstrumentation]) {
    describe(Instrumentation.name, () => {
        let instrumentation: CommonJSTestInstrumentation | ESMTestInstrumentation;
        let emit: sinon.SinonStub;
        let warn: sinon.SinonStub;
        let logHook: sinon.SinonStub;
        let preInvocationHook: sinon.SinonStub;
        let setup: sinon.SinonStub;
        let logDispose: sinon.SinonStub;
        let preInvocationDispose: sinon.SinonStub;
        let azFunc: typeof AzFunc;

        function initialize(config: AzureFunctionsInstrumentationConfig = { structuredLogExporterReady: true }): void {
            instrumentation = new Instrumentation({ ...config, enabled: false });
            emit = sinon.stub();
            warn = sinon.stub();
            Object.defineProperty(instrumentation, 'logger', { get: () => ({ emit }) });
            Object.defineProperty(instrumentation, '_diag', { value: { warn } });
        }

        function invokeLog(attributes?: unknown, level: AzFunc.LogLevel = 'error'): void {
            const handler = logHook.firstCall.args[0] as (context: unknown) => void;
            handler({ message: 'unchanged message', category: 'user', level, attributes });
        }

        beforeEach(() => {
            initialize();
            setup = sinon.stub();
            logDispose = sinon.stub();
            preInvocationDispose = sinon.stub();
            logHook = sinon.stub().returns({ dispose: logDispose });
            preInvocationHook = sinon.stub().returns({ dispose: preInvocationDispose });
            azFunc = {
                app: { setup, hook: { log: logHook, preInvocation: preInvocationHook } },
                Disposable: {
                    from: (...disposables: AzFunc.Disposable[]) => ({
                        dispose: () => disposables.forEach((disposable) => disposable.dispose()),
                    }),
                },
            } as unknown as typeof AzFunc;
        });

        afterEach(() => {
            sinon.restore();
        });

        it('registers a structured consumer before suppressing host logs when exporter is ready', () => {
            instrumentation.patch(azFunc);
            expect(logHook.calledOnce).to.equal(true);
            expect(logHook.firstCall.args[1]).to.deep.equal({ structuredLogProperties: true });
            expect(setup.calledOnceWithExactly({ capabilities: { WorkerOpenTelemetryEnabled: true } })).to.equal(true);
            expect(logHook.calledBefore(setup)).to.equal(true);
        });

        for (const ready of [undefined, false]) {
            it(`preserves host logs without exporter readiness (${String(ready)})`, () => {
                initialize({ structuredLogExporterReady: ready });
                instrumentation.patch(azFunc);
                instrumentation.unpatch(azFunc);
                expect(logHook.called).to.equal(false);
                expect(setup.called).to.equal(false);
                expect(preInvocationHook.calledOnce).to.equal(true);
                expect(preInvocationDispose.calledOnce).to.equal(true);
            });
        }

        it('preserves text, severity, category and scalar attributes without mutating input', () => {
            instrumentation.patch(azFunc);
            const attributes = Object.freeze({ component: 'disease', retries: 2, accepted: false });
            invokeLog(attributes);
            expect(emit.firstCall.args[0]).to.deep.equal({
                body: 'unchanged message',
                severityNumber: SeverityNumber.ERROR,
                severityText: 'error',
                attributes: { CategoryName: 'user', component: 'disease', retries: 2, accepted: false },
            });
            expect(attributes).to.deep.equal({ component: 'disease', retries: 2, accepted: false });
        });

        it('retains category for text-only logs', () => {
            instrumentation.patch(azFunc);
            invokeLog();
            expect(emit.firstCall.args[0].attributes).to.deep.equal({ CategoryName: 'user' });
        });

        it('filters reserved and invalid fields without reading getters, with one bounded warning', () => {
            instrumentation.patch(azFunc);
            const getter = sinon.spy(() => 'secret');
            const attributes = Object.assign(Object.create(null) as Record<string, unknown>, {
                component: 'disease',
                CATEGORYNAME: 'forged',
                'EXCEPTION.type': 'forged',
                '_mS.any': 'forged',
                microsoftTest: 'forged',
                'AI.operation.id': 'forged',
                constructor: 'forged',
                prototype: 'forged',
                __proto__: null,
                infinite: Infinity,
                nan: NaN,
                nested: {},
                array: [],
                missing: undefined,
            });
            Object.defineProperty(attributes, '__proto__', { enumerable: true, value: 'forged' });
            Object.defineProperty(attributes, 'getter', { enumerable: true, get: getter });
            Object.defineProperty(attributes, 'hidden', { enumerable: false, value: 'secret' });
            invokeLog(attributes);
            invokeLog(attributes);
            expect(getter.called).to.equal(false);
            expect(warn.calledOnce).to.equal(true);
            expect(warn.firstCall.args).to.deep.equal(['Skipped invalid or reserved structured log attributes.']);
            expect(emit.firstCall.args[0].attributes).to.deep.equal({ CategoryName: 'user', component: 'disease' });
        });

        it('preserves the message if inspecting attributes throws', () => {
            instrumentation.patch(azFunc);
            invokeLog(
                new Proxy(
                    {},
                    {
                        ownKeys: () => {
                            throw new Error('secret');
                        },
                    }
                )
            );
            expect(emit.calledOnce).to.equal(true);
            expect(emit.firstCall.args[0].attributes).to.deep.equal({ CategoryName: 'user' });
            expect(warn.calledOnce).to.equal(true);
        });

        const severityCases: [AzFunc.LogLevel, SeverityNumber][] = [
            ['information', SeverityNumber.INFO],
            ['warning', SeverityNumber.WARN],
            ['error', SeverityNumber.ERROR],
            ['critical', SeverityNumber.FATAL],
            ['debug', SeverityNumber.DEBUG],
            ['trace', SeverityNumber.TRACE],
        ];
        for (const [level, severityNumber] of severityCases) {
            it(`maps ${level} through the actual log hook`, () => {
                instrumentation.patch(azFunc);
                invokeLog(undefined, level);
                expect(emit.firstCall.args[0].severityNumber).to.equal(severityNumber);
            });
        }

        it('binds the function handler to the invocation trace context', () => {
            const extractedContext = otelContext.active();
            const extract = sinon.stub(propagation, 'extract').returns(extractedContext);
            const bind = sinon.stub(otelContext, 'bind');
            instrumentation.patch(azFunc);
            const functionHandler = sinon.stub();
            const invocation = {
                invocationContext: { traceContext: { traceParent: 'trace-parent', traceState: 'trace-state' } },
                functionHandler,
            };
            const handler = preInvocationHook.firstCall.args[0] as (context: unknown) => void;
            handler(invocation);
            expect(extract.firstCall.args[1]).to.deep.equal({ traceparent: 'trace-parent', tracestate: 'trace-state' });
            expect(bind.calledOnceWithExactly(extractedContext, functionHandler)).to.equal(true);
        });

        it('does not rebind a handler without trace context', () => {
            const bind = sinon.spy(otelContext, 'bind');
            instrumentation.patch(azFunc);
            const handler = preInvocationHook.firstCall.args[0] as (context: unknown) => void;
            handler({ invocationContext: {}, functionHandler: sinon.stub() });
            expect(bind.called).to.equal(false);
        });

        it('registers and disposes once, then permits registration again', () => {
            instrumentation.patch(azFunc);
            instrumentation.patch(azFunc);
            expect(logHook.calledOnce).to.equal(true);
            instrumentation.unpatch(azFunc);
            instrumentation.unpatch(azFunc);
            expect(logDispose.calledOnce).to.equal(true);
            expect(preInvocationDispose.calledOnce).to.equal(true);
            expect(setup.calledTwice).to.equal(true);
            expect(setup.secondCall.args[0]).to.deep.equal({ capabilities: { WorkerOpenTelemetryEnabled: false } });
            instrumentation.patch(azFunc);
            expect(logHook.calledTwice).to.equal(true);
        });
    });
}
