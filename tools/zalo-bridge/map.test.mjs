import assert from 'node:assert/strict';
import test from 'node:test';
import { memberIdsFromGroup, peopleFromProfiles, pollsForApp, voterIdsFromPolls, votesFromPolls } from './map.mjs';

const names = new Map([
  ['1', 'An'],
  ['2', 'Bình'],
  ['3', 'Chi'],
]);

test('member ids come from memVerList, then memberIds', () => {
  assert.deepEqual(memberIdsFromGroup({ memVerList: ['111_0', '222_1', '111_2'] }).ids, ['111', '222']);
  assert.equal(memberIdsFromGroup({ memVerList: ['111_0'] }).weird, false);
  assert.deepEqual(memberIdsFromGroup({ memVerList: [], memberIds: ['333'] }).ids, ['333']);
  assert.equal(memberIdsFromGroup({ memVerList: [{ id: '9' }] }).weird, true);
});

test('profile name prefers the group display name', () => {
  const people = peopleFromProfiles({
    a: { id: 'a', displayName: 'An', zaloName: 'Nguyễn An', avatar: 'https://a' },
    b: { id: 'b', displayName: '', zaloName: 'Bình', avatar: '' },
    c: { id: 'c', displayName: ' ', zaloName: '', avatar: '' },
  });
  assert.deepEqual(
    people.map((person) => person.name),
    ['An', 'Bình'],
  );
});

test('pinned vote members are the voter ids, anonymous polls add none', () => {
  const ids = voterIdsFromPolls([
    {
      is_anonymous: false,
      options: [
        { content: 'Thứ 3 7/10', voters: ['1', '2'] },
        { content: 'Thứ 6 10/10', voters: ['2', '3'] },
      ],
    },
    { is_anonymous: true, options: [{ content: 'đi', voters: ['9'] }] },
  ]);
  assert.deepEqual(ids, ['1', '2', '3']);
});

test('members come from dated votes, including đi and không đi', () => {
  const ids = voterIdsFromPolls([
    {
      question: 'Ăn gì',
      is_anonymous: false,
      options: [{ content: 'Phở', voters: ['9'] }],
    },
    {
      question: 'Thứ 3 7/10',
      is_anonymous: false,
      options: [
        { content: 'Không đi', voters: ['2'] },
        { content: 'Đi', voters: ['1'] },
      ],
    },
  ]);
  assert.deepEqual(ids, ['2', '1']);
});

test('each pinned poll stays selectable, with dated days split out', () => {
  const polls = pollsForApp(
    [
      {
        poll_id: 'p1',
        question: 'Đi tuần này',
        is_anonymous: false,
        options: [
          { content: 'Thứ 3 7/10', voters: ['1', '2'] },
          { content: 'Không đi', voters: ['3'] },
        ],
      },
      {
        poll_id: 'p2',
        question: 'Ăn gì',
        is_anonymous: false,
        options: [{ content: 'Phở', voters: ['1'] }],
      },
    ],
    names,
  );
  assert.deepEqual(
    polls.map((poll) => ({
      id: poll.id,
      days: poll.days.map((day) => day.title),
      options: poll.options.map((option) => option.content),
    })),
    [
      { id: 'p1', days: ['Thứ 3 7/10'], options: ['Thứ 3 7/10', 'Không đi'] },
      { id: 'p2', days: [], options: ['Phở'] },
    ],
  );
});

test('a multi-day poll becomes one row per dated option', () => {
  const votes = votesFromPolls(
    [
      {
        question: 'Đi tuần này',
        is_anonymous: false,
        options: [
          { content: 'Thứ 3 7/10', voters: ['1', '2', '9'] },
          { content: 'Thứ 6 10/10', voters: ['1'] },
          { content: 'Không đi', voters: ['3'] },
        ],
      },
    ],
    names,
  );
  assert.deepEqual(
    votes.map((row) => ({ title: row.title, names: row.names, voterIds: row.voterIds })),
    [
      { title: 'Thứ 3 7/10', names: ['An', 'Bình'], voterIds: ['1', '2'] },
      { title: 'Thứ 6 10/10', names: ['An'], voterIds: ['1'] },
    ],
  );
});

test('a single-day đi / không poll uses the going option', () => {
  const votes = votesFromPolls(
    [
      {
        question: 'Thứ 3 7/10',
        is_anonymous: false,
        options: [
          { content: 'Không đi', voters: ['2'] },
          { content: 'Đi', voters: ['1', '3'] },
        ],
      },
    ],
    names,
  );
  assert.equal(votes.length, 1);
  assert.equal(votes[0].title, 'Thứ 3 7/10');
  assert.deepEqual(votes[0].names, ['An', 'Chi']);
  assert.equal(votes[0].anonymous, false);
});

test('an anonymous poll has no names', () => {
  const votes = votesFromPolls(
    [
      {
        question: 'Thứ 3 7/10',
        is_anonymous: true,
        options: [{ content: 'Đi', voters: ['1'] }],
      },
    ],
    names,
  );
  assert.deepEqual(votes, [
    { title: 'Thứ 3 7/10', names: [], voterIds: [], anonymous: true },
  ]);
});
