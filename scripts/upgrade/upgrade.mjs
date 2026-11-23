import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const fullSha = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const splitPaths = (value) => value.split('\0').filter(Boolean);

function git(cwd, ...args) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error((result.stderr || result.stdout || 'Git 操作失败').trim());
    }
    return result.stdout;
}

function pinnedCommit(cwd, sha) {
    if (typeof sha !== 'string' || !fullSha.test(sha) ||
        git(cwd, 'rev-parse', '--verify', sha + '^{commit}').trim() !== sha) {
        throw new Error('输入必须是已核实的完整提交 SHA：' + sha);
    }
    return sha;
}

function indexBy(items, key) {
    const index = new Map();
    for (const item of items) {
        const id = key(item);
        if (typeof id !== 'string' || !id || index.has(id)) throw new Error('清单重复或缺少 ID：' + id);
        index.set(id, item);
    }
    return index;
}

function manifest(cwd, sha) {
    const config = JSON.parse(git(cwd, 'show', sha + ':package.json'));
    const contrib = config.contributes || {};
    const settings = [contrib.configuration || {}].flat().flatMap(group => Object.entries(group.properties || {}));
    return {
        commands: indexBy(contrib.commands || [], item => item.command),
        settings: indexBy(settings, ([key]) => key),
        dependencies: new Map(Object.entries(config.dependencies || {})),
        devDependencies: new Map(Object.entries(config.devDependencies || {})),
    };
}

function changes(before, after) {
    return {
        added: [...after.keys()].filter(key => !before.has(key)),
        removed: [...before.keys()].filter(key => !after.has(key)),
        changed: [...after.keys()].filter(key => before.has(key) && !isDeepStrictEqual(before.get(key), after.get(key))),
    };
}

function featureIds(cwd, sha) {
    return git(cwd, 'show', '-s', '--format=%(trailers:key=Feature-ID,valueonly,separator=%x2C)', sha)
        .trim().split(',').map(id => id.trim()).filter(Boolean);
}

function inspect(cwd, oldBase, source, target) {
    for (const sha of [oldBase, source, target]) pinnedCommit(cwd, sha);
    git(cwd, 'merge-base', '--is-ancestor', oldBase, source);
    const range = oldBase + '..' + source;
    if (git(cwd, 'rev-list', '--merges', range).trim()) throw new Error('补丁来源包含合并提交，请选用审定的线性候选');
    const touched = new Set(splitPaths(git(cwd, 'diff', '--name-only', '-z', '--no-renames', oldBase, target)));
    const oldManifest = manifest(cwd, oldBase);
    const newManifest = manifest(cwd, target);
    const manifestChanges = Object.fromEntries(Object.keys(oldManifest).map(key => [
        key, changes(oldManifest[key], newManifest[key]),
    ]));
    const commits = git(cwd, 'rev-list', '--reverse', range).trim().split('\n').filter(Boolean);
    const patches = commits.map(sha => {
        const ids = featureIds(cwd, sha);
        if (!ids.length) throw new Error('缺少 Feature-ID：' + sha);
        const files = splitPaths(git(cwd, 'diff-tree', '--no-commit-id', '-r', '--name-only', '-z', '--no-renames', sha));
        return { sha, featureIds: ids, overlap: files.filter(file => touched.has(file)), decision: 'review', evidence: '' };
    });
    return { oldBase, source, target, manifestChanges, patches };
}

function checkDecisions(cwd, plan) {
    const current = inspect(cwd, plan.oldBase, plan.source, plan.target);
    if (!Array.isArray(plan.patches) || plan.patches.length !== current.patches.length) {
        throw new Error('批准计划的补丁序列与来源不符');
    }
    for (const [index, expected] of current.patches.entries()) {
        const patch = plan.patches[index];
        if (patch.sha !== expected.sha || !isDeepStrictEqual(patch.featureIds, expected.featureIds)) {
            throw new Error('批准计划的 SHA、顺序或 Feature-ID 与来源不符：' + expected.sha);
        }
        if (!['keep', 'upstream'].includes(patch.decision) || typeof patch.evidence !== 'string' || !patch.evidence.trim()) {
            throw new Error('请记录补丁组的取舍和证据：' + expected.featureIds.join(', '));
        }
    }
}

function checkpoint(path, state) {
    const temporary = path + '.next';
    writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n');
    renameSync(temporary, path);
}

function prepare(cwd, options) {
    const raw = readFileSync(options.plan, 'utf8');
    const plan = JSON.parse(raw);
    checkDecisions(cwd, plan);
    const dest = resolve(options.worktree);
    const repo = git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim();
    git(cwd, 'check-ref-format', 'refs/heads/' + options.branch);
    const statePath = join(dirname(dest), '.' + basename(dest) + '.upgrade.json');
    const lock = statePath + '.lock';
    const fingerprint = createHash('sha256').update(raw).digest('hex');
    mkdirSync(lock);
    try {
        if (!existsSync(statePath)) {
            if (existsSync(dest) || options.resolved) throw new Error('首次应用需要一个新工作树路径');
            git(cwd, 'worktree', 'add', '-b', options.branch, dest, plan.target);
            checkpoint(statePath, { fingerprint, branch: options.branch, next: 0, tip: plan.target, pending: null });
        }
        const state = JSON.parse(readFileSync(statePath, 'utf8'));
        if (state.fingerprint !== fingerprint || state.branch !== options.branch ||
            git(dest, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim() !== repo ||
            git(dest, 'branch', '--show-current').trim() !== options.branch) {
            throw new Error('工作树或批准计划与续跑记录不符');
        }
        if (git(dest, 'status', '--porcelain').trim() || existsSync(git(dest, 'rev-parse', '--path-format=absolute', '--git-path', 'CHERRY_PICK_HEAD').trim())) {
            throw new Error('请先在候选工作树解决或中止 Git 操作，再续跑');
        }
        const tip = git(dest, 'rev-parse', 'HEAD').trim();
        if (state.tip !== tip || options.resolved) {
            const pending = plan.patches[state.next];
            const message = git(dest, 'show', '-s', '--format=%B', tip);
            const provenance = pending && message.includes('(cherry picked from commit ' + pending.sha + ')');
            if (!pending || state.pending !== pending.sha || git(dest, 'rev-list', '--parents', '-n', '1', tip).trim() !== tip + ' ' + state.tip ||
                (!provenance && options.resolved !== tip) || (options.resolved && options.resolved !== tip) ||
                !isDeepStrictEqual(featureIds(dest, tip), pending.featureIds)) {
                throw new Error('HEAD 与断点不符。人工解决后用完整提交 SHA 明确核准此次解决');
            }
            state.tip = tip;
            state.next++;
            state.pending = null;
            checkpoint(statePath, state);
        }
        while (state.next < plan.patches.length) {
            const patch = plan.patches[state.next];
            if (patch.decision === 'keep') {
                state.pending = patch.sha;
                checkpoint(statePath, state);
                git(dest, 'cherry-pick', '--no-rerere-autoupdate', '-x', patch.sha);
                state.tip = git(dest, 'rev-parse', 'HEAD').trim();
            }
            state.next++;
            state.pending = null;
            checkpoint(statePath, state);
        }
        console.log(JSON.stringify({ worktree: dest, target: plan.target, candidate: state.tip, processed: state.next }));
    } finally {
        rmdirSync(lock);
    }
}

function main() {
    const [command, ...tokens] = process.argv.slice(2);
    const required = command === 'plan' ? ['old-base', 'source', 'target'] : ['plan', 'worktree', 'branch'];
    const allowed = new Set(command === 'prepare' ? [...required, 'resolved'] : required);
    const options = {};
    for (let i = 0; i < tokens.length; i += 2) {
        const key = tokens[i].slice(2);
        if (!tokens[i].startsWith('--') || !allowed.has(key) || options[key] || !tokens[i + 1]) {
            throw new Error('未知、重复或缺值的参数：' + tokens[i]);
        }
        options[key] = tokens[i + 1];
    }
    if (!['plan', 'prepare'].includes(command) || required.some(key => !options[key])) {
        throw new Error('用法：plan --old-base SHA --source SHA --target SHA | prepare --plan JSON --worktree PATH --branch NAME [--resolved SHA]');
    }
    const cwd = git(process.cwd(), 'rev-parse', '--show-toplevel').trim();
    if (command === 'plan') {
        console.log(JSON.stringify(inspect(cwd, options['old-base'], options.source, options.target), null, 2));
    } else {
        prepare(cwd, options);
    }
}

try {
    main();
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
