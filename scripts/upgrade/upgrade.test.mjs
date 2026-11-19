import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = mkdtempSync(join(tmpdir(), 'xlsx-upgrade-test-'));
const repo = join(directory, 'source');
const worktree = join(directory, 'candidate');
const planFile = join(directory, 'plan.json');
const cli = fileURLToPath(new URL('./upgrade.mjs', import.meta.url));

function command(cwd, executable, ...args) {
    const result = spawnSync(executable, args, { cwd, encoding: 'utf8' });
    if (result.error) throw result.error;
    return result;
}
function git(cwd, ...args) {
    const result = command(cwd, 'git', ...args);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}
function write(cwd, file, data) { writeFileSync(join(cwd, file), data); }
function commit(title, feature) {
    git(repo, 'add', '--all');
    git(repo, 'commit', '-m', title, ...(feature ? ['-m', 'Feature-ID: ' + feature] : []));
    return git(repo, 'rev-parse', 'HEAD');
}

try {
    mkdirSync(repo);
    git(repo, 'init', '-b', 'main');
    git(repo, 'config', 'user.name', 'Upgrade Fixture');
    git(repo, 'config', 'user.email', 'fixture@example.invalid');
    write(repo, 'package.json', JSON.stringify({ contributes: { configuration: { properties: { value: { default: false } } } } }));
    write(repo, 'shared.txt', 'base\n');
    const base = commit('chore: 建立上游样例');
    git(repo, 'switch', '-c', 'personal');
    write(repo, 'kept.txt', 'personal configuration\n');
    commit('feat: 添加保留功能', 'KEEP');
    write(repo, 'legacy.txt', 'legacy top button\n');
    commit('feat: 添加旧按钮', 'TOP');
    write(repo, 'shared.txt', 'personal compatibility\n');
    const source = commit('fix: 增加兼容处理', 'COMPAT');

    git(repo, 'switch', 'main');
    write(repo, 'package.json', JSON.stringify({ contributes: {
        commands: [{ command: 'top' }],
        configuration: [{ properties: { value: { default: true } } }, { properties: { newOption: { default: 1 } } }],
    } }));
    write(repo, 'shared.txt', 'upstream behavior\n');
    const target = commit('feat: 更新上游能力');
    const result = command(repo, process.execPath, cli, 'plan', '--old-base', base, '--source', source, '--target', target);
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.deepEqual(plan.manifestChanges.commands.added, ['top']);
    assert.deepEqual(plan.manifestChanges.settings, { added: ['newOption'], removed: [], changed: ['value'] });
    assert.deepEqual(plan.patches.at(-1).overlap, ['shared.txt']);

    const args = [cli, 'prepare', '--plan', planFile, '--worktree', worktree, '--branch', 'candidate'];
    writeFileSync(planFile, JSON.stringify(plan));
    assert.equal(command(repo, process.execPath, ...args).status, 1);
    assert.equal(existsSync(worktree), false);
    for (const patch of plan.patches) {
        patch.decision = patch.featureIds[0] === 'TOP' ? 'upstream' : 'keep';
        patch.evidence = '样例人工确认，保留与退役选择可核对';
    }
    writeFileSync(planFile, JSON.stringify(plan));
    assert.equal(command(repo, process.execPath, ...args).status, 1, 'the overlapping change must stop at the conflict');
    assert.equal(existsSync(join(worktree, 'kept.txt')), true);
    assert.equal(existsSync(join(worktree, 'legacy.txt')), false);
    assert.equal(command(repo, process.execPath, ...args).status, 1, 'an unresolved worktree must stay paused');

    write(worktree, 'shared.txt', 'upstream behavior with personal compatibility\n');
    git(worktree, 'add', 'shared.txt');
    git(worktree, '-c', 'core.editor=true', 'cherry-pick', '--continue');
    const tip = git(worktree, 'rev-parse', 'HEAD');
    const resumed = command(repo, process.execPath, ...args, '--resolved', tip);
    assert.equal(resumed.status, 0, resumed.stderr);
    const repeated = command(repo, process.execPath, ...args);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.equal(JSON.parse(repeated.stdout).candidate, tip);
    assert.equal(git(worktree, 'rev-list', '--count', target + '..HEAD'), '2');
    assert.equal(git(repo, 'rev-parse', 'HEAD'), target);
    console.log('升级入口回放通过：清单差异、缺证拒绝、上游退役、冲突续跑及重复应用。');
} finally {
    rmSync(directory, { recursive: true, force: true });
}
