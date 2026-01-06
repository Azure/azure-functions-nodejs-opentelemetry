# Distributed Tracing Regression Fix

## Issue Summary

Distributed tracing between Azure Functions and external dependencies (Service Bus, Redis, HTTP, etc.) was broken when using OpenTelemetry instrumentation. Function invocations across Service Bus boundaries were not correlated, and external dependency calls were not appearing as child spans in Application Insights traces.

## Root Cause Analysis

### The Problem

The Azure Functions OpenTelemetry instrumentation was extracting trace context from the Azure Functions Host using `propagation.extract()`, which parses the `traceparent` and `tracestate` headers and creates a context containing **span context metadata** (trace ID, span ID, trace flags).

However, `propagation.extract()` does **NOT** create or set an active **Span object** in the context—it only sets the span context metadata using `trace.setSpanContext()`.

### Why This Broke Distributed Tracing

When the function handler executed and downstream OpenTelemetry instrumentations (HTTP, Redis, Service Bus, etc.) tried to create child spans, they called `trace.getSpan(context)` to find the active parent span. Since no span object existed in the context (only metadata), `trace.getSpan()` returned `undefined`.

As a result:
- Downstream instrumentations couldn't find a parent span
- Child spans were created as orphaned root spans
- Distributed tracing correlation was broken
- Application Insights showed fragmented traces instead of end-to-end transaction views

### Technical Details

**What `propagation.extract()` does:**
```javascript
// Simplified from W3CTraceContextPropagator
extract(context, carrier, getter) {
    const spanContext = parseTraceParent(traceParent);
    spanContext.isRemote = true;
    return trace.setSpanContext(context, spanContext);  // Only sets metadata
}
```

**What downstream instrumentations need:**
```javascript
// Simplified from HTTP instrumentation
_startHttpSpan(name, options, ctx) {
    const currentSpan = trace.getSpan(ctx);  // Tries to get active span
    if (currentSpan === undefined) {
        // No parent span found - creates orphaned span
        span = this.tracer.startSpan(name, options, ctx);
    }
    return span;
}
```

## Solution

Wrap the extracted remote span context in a NonRecordingSpan and set it as the active span in the context. This makes the remote span context available to downstream instrumentations while avoiding duplicate span creation.

### Implementation

```typescript
// Extract the remote span context from Azure Functions Host
const extractedContext = propagation.extract(otelContext.active(), {
    traceparent: traceContext.traceParent,
    tracestate: traceContext.traceState,
});

// Get the span context that was set by propagation.extract
const spanContext = trace.getSpanContext(extractedContext);

if (spanContext) {
    // Wrap the remote span context in a NonRecordingSpan
    // This creates a span object without recording/exporting it
    const remoteSpan = trace.wrapSpanContext(spanContext);
    
    // Set the wrapped span as active in the context
    const contextWithSpan = trace.setSpan(extractedContext, remoteSpan);
    
    // Bind the context with active span to the function handler
    context.functionHandler = otelContext.bind(contextWithSpan, context.functionHandler);
}
```

### Why This Works

1. **`trace.wrapSpanContext(spanContext)`** creates a NonRecordingSpan that wraps the remote span context. This span object satisfies the OpenTelemetry Span interface but doesn't record or export data (since the actual span is already recorded by the Azure Functions Host).

2. **`trace.setSpan(context, span)`** sets the wrapped span as the active span in the context. Now when downstream instrumentations call `trace.getSpan(context)`, they get this span object.

3. **`otelContext.bind(context, handler)`** binds the context to the function handler. When the handler executes, the context (with the active span) is made active via `context.with()` internally.

4. Downstream instrumentations can now:
   - Find the active span via `trace.getSpan(context)`
   - Create child spans with proper parent-child relationships
   - Maintain distributed tracing correlation

## Benefits

✅ **Proper Parent-Child Relationships**: Child spans created by HTTP, Redis, Service Bus, and other instrumentations are correctly parented to the function invocation span

✅ **End-to-End Visibility**: Complete transaction views in Application Insights showing the full trace from trigger to all dependencies

✅ **Cross-Service Correlation**: Function invocations across Service Bus boundaries are properly correlated

✅ **No Duplicate Spans**: Using NonRecordingSpan avoids creating duplicate spans for the function invocation (the Azure Functions Host already creates the invocation span)

## Testing

The fix includes comprehensive tests that verify:
- Trace context is extracted from Azure Functions Host
- Span context is wrapped using `trace.wrapSpanContext()`
- The wrapped span is set as active using `trace.setSpan()`
- The context with active span is bound to the function handler

## References

- [OpenTelemetry Context Propagation](https://opentelemetry.io/docs/concepts/context-propagation/)
- [OpenTelemetry JavaScript Context API](https://opentelemetry.io/docs/languages/js/context/)
- [W3C Trace Context Specification](https://www.w3.org/TR/trace-context/)
- [Azure Functions OpenTelemetry Documentation](https://learn.microsoft.com/en-us/azure/azure-functions/opentelemetry-howto)
