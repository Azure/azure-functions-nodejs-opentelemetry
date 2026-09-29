// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import type * as AzFunc from '@azure/functions';
import { SeverityNumber } from '@opentelemetry/api-logs';

export interface StructuredLogHookContext extends AzFunc.LogHookContext {
    readonly attributes?: Readonly<Record<string, string | number | boolean>>;
}

export function createLogRecord(context: StructuredLogHookContext, warn: () => void) {
    const attributes: Record<string, string | number | boolean> = { CategoryName: context.category };
    try {
        if (context.attributes) {
            for (const key of Object.getOwnPropertyNames(context.attributes)) {
                const descriptor = Object.getOwnPropertyDescriptor(context.attributes, key);
                if (!descriptor?.enumerable) {
                    continue;
                }
                const attribute: unknown = descriptor.value;
                if (isReserved(key) || !('value' in descriptor) || !isScalar(attribute)) {
                    warn();
                    continue;
                }
                attributes[key] = attribute;
            }
        }
    } catch {
        warn();
    }
    return {
        body: context.message,
        severityNumber: toOtelSeverityNumber(context.level),
        severityText: context.level,
        attributes,
    };
}

function isReserved(key: string): boolean {
    const normalized = key.toLowerCase();
    return (
        ['categoryname', '__proto__', 'prototype', 'constructor'].includes(normalized) ||
        ['exception.', '_ms', 'microsoft', 'ai.'].some((prefix) => normalized.startsWith(prefix))
    );
}

function isScalar(attribute: unknown): attribute is string | number | boolean {
    return (
        typeof attribute === 'string' ||
        typeof attribute === 'boolean' ||
        (typeof attribute === 'number' && Number.isFinite(attribute))
    );
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
