// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { SeverityNumber } from '@opentelemetry/api-logs';
import { AzureFunctionsInstrumentationESM } from '../src/instrumentationESM';
import sinon = require('sinon');
import { context as otelContext } from '@opentelemetry/api';
import { expect } from 'chai';

describe('AzureFunctionsInstrumentationESM', () => {
    let instrumentation: AzureFunctionsInstrumentationESM;
    let mockAzFunc: any;
    let logHandler: any;
    let preInvocationHandler: any;

    beforeEach(() => {
        logHandler = undefined;
        preInvocationHandler = undefined;

        mockAzFunc = {
            app: {
                setup: sinon.stub(),
                hook: {
                    log: sinon.stub().callsFake((cb) => {
                        logHandler = cb;
                        return { dispose: sinon.stub() };
                    }),
                    preInvocation: sinon.stub().callsFake((cb) => {
                        preInvocationHandler = cb;
                        return { dispose: sinon.stub() };
                    }),
                },
            },
        };

        instrumentation = new AzureFunctionsInstrumentationESM();
    });

    it('should register Azure Functions hooks and set capabilities', () => {
        instrumentation.registerAzFunc(mockAzFunc);

        expect(
            mockAzFunc.app.setup.calledWithMatch({
                capabilities: {
                    WorkerOpenTelemetryEnabled: true,
                },
            })
        ).to.be.true;

        expect(logHandler).to.be.a('function');
        expect(preInvocationHandler).to.be.a('function');
    });

    it('should emit logs using logger.emit in log hook', () => {
        const loggerEmitStub = sinon.stub(instrumentation['logger'], 'emit');

        instrumentation.registerAzFunc(mockAzFunc);

        logHandler({ level: 'information', message: 'log message' });

        expect(loggerEmitStub.calledOnce).to.be.true;
        expect(loggerEmitStub.firstCall.args[0]).to.deep.include({
            body: 'log message',
            severityNumber: SeverityNumber.INFO,
            severityText: 'information',
        });

        loggerEmitStub.restore();
    });

    it('should bind context in preInvocation hook if traceContext exists', () => {
        const bindStub = sinon.stub(otelContext, 'bind');
        instrumentation.registerAzFunc(mockAzFunc);

        const handlerStub = sinon.stub();
        const invocationContext = {
            traceContext: {
                traceParent: 'some-trace-parent',
                traceState: 'some-trace-state',
            },
        };

        const context = {
            invocationContext,
            functionHandler: handlerStub,
        };

        preInvocationHandler(context);

        expect(bindStub.called).to.be.true;

        bindStub.restore();
    });

    it('should not bind context in preInvocation if no traceContext', () => {
        const bindSpy = sinon.spy(otelContext, 'bind');
        instrumentation.registerAzFunc(mockAzFunc);

        const context = {
            invocationContext: {},
            functionHandler: sinon.stub(),
        };

        preInvocationHandler(context);

        expect(bindSpy.called).to.be.false;

        bindSpy.restore();
    });

    it('should unpatch and dispose all registered disposables', () => {
        const disposeStub1 = sinon.stub();
        const disposeStub2 = sinon.stub();

        mockAzFunc.app.hook.log.returns({ dispose: disposeStub1 });
        mockAzFunc.app.hook.preInvocation.returns({ dispose: disposeStub2 });

        instrumentation.registerAzFunc(mockAzFunc);
        instrumentation['_unPatch'](mockAzFunc);

        expect(disposeStub1.calledOnce).to.be.true;
        expect(disposeStub2.calledOnce).to.be.true;
        expect(
            mockAzFunc.app.setup.calledWithMatch({
                capabilities: {
                    WorkerOpenTelemetryEnabled: false,
                },
            })
        ).to.be.true;
    });
});
