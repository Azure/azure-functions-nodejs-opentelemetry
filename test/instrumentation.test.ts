// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import type * as AzFunc from '@azure/functions';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { expect } from 'chai';
import { AzureFunctionsInstrumentation } from '../src/instrumentation';
import sinon = require('sinon');
import { context as otelContext, propagation, trace } from '@opentelemetry/api';

describe('AzureFunctionsInstrumentation', () => {
    let instrumentation = new AzureFunctionsInstrumentation();
    let mockLoggerEmit = { emit: sinon.stub() };
    const mockAzFunc = {
        app: {
            setup: sinon.stub(),
            hook: {
                log: sinon.stub(),
                preInvocation: sinon.stub(),
            },
        },
        Disposable: {
            from: sinon.stub(),
        },
        // Add missing properties that the error mentions
        input: {},
        output: {},
        trigger: {},
        AppStartContext: {},
    } as unknown as typeof AzFunc;

    beforeEach(() => {
        instrumentation = new AzureFunctionsInstrumentation();
        mockLoggerEmit = { emit: sinon.stub() };
        Object.defineProperty(instrumentation, 'logger', {
            get: () => mockLoggerEmit,
        });

        mockAzFunc.app.setup = sinon.stub(); // Explicitly stub setup to enable Sinon methods like calledWith

        // Reset hooks and stubs
        (mockAzFunc.app.setup as sinon.SinonStub).resetHistory();
        (mockAzFunc.app.hook.log as sinon.SinonStub).resetHistory();
        (mockAzFunc.app.hook.preInvocation as sinon.SinonStub).reset();
        (mockAzFunc.Disposable.from as sinon.SinonStub).resetHistory();
    });

    it('should include CategoryName attribute from log context', () => {
        let logHandler: ((event: { message: string; level: string; category: string }) => void) | undefined;

        (mockAzFunc.app.hook.log as sinon.SinonStub).callsFake((fn) => {
            logHandler = fn;
            return { dispose: sinon.stub() };
        });

        instrumentation['_patch'](mockAzFunc);

        const logEvent = {
            message: 'Category was set',
            level: 'information',
            category: 'Host.General',
        };
        logHandler?.(logEvent);

        expect(mockLoggerEmit.emit.calledOnce).to.be.true;
        const payload = mockLoggerEmit.emit.firstCall.args[0];

        expect(payload.body).to.equal('Category was set');
        expect(payload.severityText).to.equal('information');
        expect(payload.attributes).to.deep.equal({ CategoryName: 'Host.General' });
    });

    it('should set WorkerOpenTelemetryEnabled to true and register hooks on patch', () => {
        const logDisposeStub = { dispose: sinon.stub() };
        const preInvokeDisposeStub = { dispose: sinon.stub() };

        (mockAzFunc.app.hook.log as sinon.SinonStub).returns(logDisposeStub);
        (mockAzFunc.app.hook.preInvocation as sinon.SinonStub).returns(preInvokeDisposeStub);
        mockAzFunc.Disposable.from = sinon.stub().returns({ dispose: sinon.stub() });

        const result = instrumentation['_patch'](mockAzFunc);

        expect(result).to.equal(mockAzFunc);
        expect(
            (mockAzFunc.app.setup as sinon.SinonStub).calledWith({
                capabilities: { WorkerOpenTelemetryEnabled: true },
            })
        ).to.be.true;

        expect((mockAzFunc.app.hook.log as sinon.SinonStub).calledOnce).to.be.true;
        expect((mockAzFunc.app.hook.preInvocation as sinon.SinonStub).calledOnce).to.be.true;
        expect((mockAzFunc.Disposable.from as sinon.SinonStub).calledOnce).to.be.true;
    });

    it('should emit log with correct severity', () => {
        let logHandler: ((event: { message: string; level: string }) => void) | undefined;
        (mockAzFunc.app.hook.log as sinon.SinonStub).callsFake((fn) => {
            logHandler = fn;
            return { dispose: sinon.stub() };
        });

        instrumentation['_patch'](mockAzFunc);

        const logEvent = { message: 'Something went wrong', level: 'error' };
        if (logHandler) {
            logHandler(logEvent);
        }

        expect(mockLoggerEmit.emit.calledOnce).to.be.true;
        expect(mockLoggerEmit.emit.firstCall.args[0]).to.deep.include({
            body: 'Something went wrong',
            severityNumber: SeverityNumber.ERROR,
            severityText: 'error',
        });
    });

    it('should bind trace context on preInvocation', () => {
        const bindStub = sinon.stub(otelContext, 'bind');
        const mockContext = otelContext.active();
        const extractStub = sinon.stub(propagation, 'extract').returns(mockContext);

        // Mock span context that will be extracted
        const mockSpanContext = {
            traceId: '0af7651916cd43dd8448eb211c80319c',
            spanId: 'b7ad6b7169203331',
            traceFlags: 1,
            isRemote: true,
        };
        const getSpanContextStub = sinon.stub(trace, 'getSpanContext').returns(mockSpanContext as any);
        const mockRemoteSpan = {} as any;
        const wrapSpanContextStub = sinon.stub(trace, 'wrapSpanContext').returns(mockRemoteSpan);
        const contextWithSpan = {} as any;
        const setSpanStub = sinon.stub(trace, 'setSpan').returns(contextWithSpan);

        let preInvokeHandler: ((context: any) => void) | null = null;

        (mockAzFunc.app.hook.preInvocation as sinon.SinonStub).callsFake((fn) => {
            preInvokeHandler = fn;
            return { dispose: sinon.stub() };
        });

        const fnHandler = () => {};
        const context = {
            invocationContext: {
                traceContext: {
                    traceParent: 'trace-parent-123',
                    traceState: 'state-xyz',
                },
            },
            functionHandler: fnHandler,
        };

        instrumentation['_patch'](mockAzFunc);
        expect((mockAzFunc.app.hook.preInvocation as sinon.SinonStub).calledOnce).to.be.true;
        expect(preInvokeHandler).to.not.be.null;

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        preInvokeHandler!(context);

        // Verify the OpenTelemetry context extraction
        expect(extractStub.calledOnce).to.be.true;
        expect(extractStub.firstCall.args[1]).to.deep.include({
            traceparent: 'trace-parent-123',
            tracestate: 'state-xyz',
        });

        // Verify span context was extracted and wrapped
        expect(getSpanContextStub.calledOnce).to.be.true;
        expect(wrapSpanContextStub.calledWith(mockSpanContext)).to.be.true;
        expect(setSpanStub.calledWith(mockContext, mockRemoteSpan)).to.be.true;

        // Verify the context with span was bound to the function handler
        expect(bindStub.calledWith(contextWithSpan, fnHandler)).to.be.true;

        // Clean up stubs
        bindStub.restore();
        extractStub.restore();
        getSpanContextStub.restore();
        wrapSpanContextStub.restore();
        setSpanStub.restore();
    });

    it('should disable WorkerOpenTelemetryEnabled on unpatch', () => {
        const disposeStub = sinon.stub();
        instrumentation['_azFuncDisposable'] = { dispose: disposeStub };

        instrumentation['_unPatch'](mockAzFunc);

        expect(disposeStub.calledOnce).to.be.true;
        expect(
            (mockAzFunc.app.setup as sinon.SinonStub).calledWith({
                capabilities: { WorkerOpenTelemetryEnabled: false },
            })
        ).to.be.true;
    });
});

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

describe('toOtelSeverityNumber', () => {
    it('should convert "information" to SeverityNumber.INFO', () => {
        expect(toOtelSeverityNumber('information')).to.equal(SeverityNumber.INFO);
    });

    it('should convert "debug" to SeverityNumber.DEBUG', () => {
        expect(toOtelSeverityNumber('debug')).to.equal(SeverityNumber.DEBUG);
    });

    it('should convert "error" to SeverityNumber.ERROR', () => {
        expect(toOtelSeverityNumber('error')).to.equal(SeverityNumber.ERROR);
    });

    it('should convert "trace" to SeverityNumber.TRACE', () => {
        expect(toOtelSeverityNumber('trace')).to.equal(SeverityNumber.TRACE);
    });

    it('should convert "warning" to SeverityNumber.WARN', () => {
        expect(toOtelSeverityNumber('warning')).to.equal(SeverityNumber.WARN);
    });

    it('should convert "critical" to SeverityNumber.FATAL', () => {
        expect(toOtelSeverityNumber('critical')).to.equal(SeverityNumber.FATAL);
    });

    it('should return UNSPECIFIED for unknown log levels', () => {
        // Using type assertion to bypass TypeScript's type checking for this test case
        expect(toOtelSeverityNumber('unknown' as AzFunc.LogLevel)).to.equal(SeverityNumber.UNSPECIFIED);
    });
});
