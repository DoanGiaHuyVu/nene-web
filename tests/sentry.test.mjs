import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFrontendEvent } from '../sentry.options.ts';

test('frontend events remove prompt, code, authentication, user data and stack source context', () => {
  const event={request:{data:'private prompt',headers:{authorization:'Bearer secret'}},user:{email:'private@example'},extra:{code:'private source'},breadcrumbs:[{message:'private prompt'}],contexts:{runtime:{secret:'token'}},tags:{'service.name':'nene-frontend',prompt:'private prompt'},exception:{values:[{type:'private prompt',value:'private prompt',stacktrace:{frames:[{filename:'app/page.tsx?token=secret',vars:{key:'secret'},context_line:'private source',pre_context:['private source'],post_context:['private source']}]}}]}};
  const safe=sanitizeFrontendEvent(event);
  assert.equal(safe.exception.values[0].type,'Error');
  assert.deepEqual(safe.tags,{'service.name':'nene-frontend'});
  const encoded=JSON.stringify(safe);
  for(const forbidden of ['private prompt','private source','secret','private@example','authorization']) assert.ok(!encoded.includes(forbidden),forbidden);
  assert.equal(safe.exception.values[0].stacktrace.frames[0].filename,'app/page.tsx');
});
