import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  appendRun, continuationBase, newProject, projectStatus, readProjects,
  stageLabels, updateRun,
} from '../app/lib/projects.ts';

const initial = {
  id: 'build-1', prompt: 'Build me a restaurant voting app',
  status: 'completed', progress: 'completed', updatedAt: '2026-10-04T10:00:00Z',
  github: { branch: 'nene/restaurant', url: 'https://github.com/example/app/tree/nene/restaurant', commit: 'abc123' },
  deployment: { provider: 'render', status: 'live', deployId: 'deploy-1', url: 'https://example.onrender.com' },
};
const revision = {
  id: 'revision-1', prompt: 'Make the button blue', isUpdate: true,
  createdAt: '2026-10-04T11:00:00Z', baseTaskId: 'build-1', events: [],
};

function addRevision() { return appendRun(newProject(initial), revision); }
function revisionTask(overrides = {}) {
  return { ...initial, id: 'build-2', prompt: revision.prompt, status: 'running', progress: 'coding', github: undefined, deployment: undefined, ...overrides };
}

test('follow-ups retain the project identity, title, earlier result and live URL', () => {
  const project = updateRun(addRevision(), revision.id, { task: revisionTask() });
  assert.equal(project.id, initial.id);
  assert.equal(project.title, 'restaurant voting app');
  assert.equal(project.runs.length, 2);
  assert.equal(project.runs[0].task.prompt, initial.prompt);
  assert.equal(project.liveVersion.url, initial.deployment.url);
  assert.equal(projectStatus(project), 'Building');
});

test('failed HTTP and asynchronous updates retain the successful version and retry base', () => {
  for (const patch of [{ error: 'Service unavailable' }, { task: revisionTask({ status: 'failed', error: 'Test failed' }) }]) {
    const project = updateRun(addRevision(), revision.id, patch);
    assert.equal(projectStatus(project), 'Update failed');
    assert.equal(project.lastSuccessfulTask.id, initial.id);
    assert.equal(continuationBase(project).id, initial.id);
    assert.equal(project.liveVersion.url, initial.deployment.url);
    assert.equal(project.runs[0].events.some((event) => event.label === 'Deployment live'), true);
    assert.equal(readProjects(JSON.stringify([project]))[0].runs.length, 2);
  }
});

test('ready updates wait for approval and keep publication and approval history', () => {
  let project = updateRun(addRevision(), revision.id, { task: revisionTask({ progress: 'waiting_for_approval', status: 'waiting_for_approval' }) });
  assert.equal(projectStatus(project), 'Waiting for approval');
  const published = revisionTask({ status: 'completed', progress: 'completed', github: { ...initial.github, commit: 'def456' }, deployment: initial.deployment });
  project = updateRun(project, revision.id, { task: published, approved: true });
  project = updateRun(project, revision.id, { task: published });
  assert.equal(projectStatus(project), 'Ready to deploy');
  assert.equal(project.liveVersion.commit, 'abc123');
  assert.equal(continuationBase(project).id, 'build-2');
  assert.deepEqual(project.runs[1].events.map((event) => event.label), ['Changes approved', 'Published to GitHub']);
});

test('deploying an update retains the URL and records the new live branch/commit', () => {
  const published = revisionTask({ status: 'completed', progress: 'completed', github: { ...initial.github, commit: 'def456' } });
  let project = updateRun(addRevision(), revision.id, { task: published, approved: true });
  project = updateRun(project, revision.id, { task: { ...published, deployment: { ...initial.deployment, status: 'building', deployId: 'deploy-2' } }, deploymentRequested: true });
  assert.equal(projectStatus(project), 'Building');
  assert.equal(project.liveVersion.commit, 'abc123');
  project = updateRun(project, revision.id, { task: { ...published, deployment: { ...initial.deployment, deployId: 'deploy-2' } } });
  assert.equal(projectStatus(project), 'Live');
  assert.equal(project.liveVersion.url, initial.deployment.url);
  assert.equal(project.liveVersion.branch, initial.github.branch);
  assert.equal(project.liveVersion.commit, 'def456');
  assert.equal(project.runs[1].events.at(-1).label, 'Deployment live');
});

test('same-task continuation does not mark an inherited deployment as the new live version', () => {
  let project = updateRun(addRevision(), revision.id, { task: revisionTask({ id: initial.id }) });
  project = updateRun(project, revision.id, { task: { ...initial, github: { ...initial.github, commit: 'def456' } } });
  assert.equal(projectStatus(project), 'Ready to deploy');
  assert.equal(project.liveVersion.commit, 'abc123');
  assert.equal(project.runs[0].task.github.commit, 'abc123');
});

test('failed deployment keeps the previous app live and reports the failure', () => {
  const project = updateRun(addRevision(), revision.id, {
    task: revisionTask({ status: 'completed', progress: 'completed', github: { ...initial.github, commit: 'def456' }, deployment: { ...initial.deployment, status: 'failed', deployId: 'deploy-2', error: 'Render build failed' } }),
    deploymentRequested: true,
  });
  assert.equal(projectStatus(project), 'Update failed');
  assert.equal(project.liveVersion.commit, 'abc123');
  assert.equal(project.runs[1].events.at(-1).detail, 'Render build failed');
});

test('a follow-up does not inherit the previous revision’s deployment failure', () => {
  const prior = { ...initial, deployment: { ...initial.deployment, status: 'failed', error: 'Old deployment failed' } };
  const project = updateRun(appendRun(newProject(prior), revision), revision.id, {
    task: revisionTask({ status: 'completed', progress: 'completed', github: { ...initial.github, commit: 'def456' }, deployment: prior.deployment }),
  });
  assert.equal(projectStatus(project), 'Ready to deploy');
  assert.equal(project.runs[1].events.some((event) => event.label === 'Deployment failed'), false);
});

test('continuation progress uses the requested labels and invalid storage recovers safely', () => {
  assert.deepEqual(stageLabels(true), ['Loading existing project', 'Understanding codebase', 'Making changes', 'Testing', 'Ready for approval']);
  assert.deepEqual(stageLabels(false), ['Planning', 'Creating project', 'Writing code', 'Testing', 'Ready for approval']);
  for (const value of [null, '{', '{}', '[null]', '[{"id":"bad","title":"Bad","runs":[null]}]']) assert.deepEqual(readProjects(value), []);
});

test('reload during a follow-up request leaves a retryable failure, not permanent building', () => {
  const project = readProjects(JSON.stringify([addRevision()]))[0];
  assert.equal(projectStatus(project), 'Update failed');
  assert.match(project.runs[1].error, /interrupted/);
  assert.equal(continuationBase(project).id, initial.id);
  assert.equal(project.liveVersion.url, initial.deployment.url);
});
