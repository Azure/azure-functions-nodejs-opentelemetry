// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import * as cp from 'child_process';
import { Context } from 'mocha';
import * as path from 'path';

describe('Public TypeScript types', () => {
    it('builds public types with the project TypeScript compiler', async function (this: Context) {
        this.timeout(10 * 1000);
        expect(await runTsBuild()).to.equal(0);
    });
});

async function runTsBuild(): Promise<number> {
    const repoRoot = path.join(__dirname, '..');
    const tscPath = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
    const projectFile = path.join(repoRoot, 'test', 'types', 'tsconfig.json');
    return new Promise<number>((resolve, reject) => {
        const cmd = cp.spawn('node', [tscPath, '--project', projectFile]);
        cmd.stdout.on('data', function (data) {
            console.log(data.toString());
        });
        cmd.stderr.on('data', function (data) {
            console.error(data.toString());
        });
        cmd.on('error', reject);
        cmd.on('close', resolve);
    });
}
